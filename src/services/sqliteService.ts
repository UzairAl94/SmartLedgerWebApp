import { Capacitor } from '@capacitor/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { IDbProvider } from './db/types';
import { NativeDbProvider } from './db/NativeDbProvider';
import { WebDbProvider } from './db/WebDbProvider';
import { seedCategoriesIfNeeded } from './db/seeder';
import { computeAmounts } from './ledgerMath';
import type { Account, Currency, Transaction } from '../types';

// Bump this and add a matching `if (version < N)` block when the schema changes.
const LATEST_SCHEMA_VERSION = 3;

class SqliteService {
    private provider: IDbProvider | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;

    async initialize() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        console.info('SqliteService: Starting initialization...');
        this.initPromise = (async () => {

            const platform = Capacitor.getPlatform();
            if (platform === 'web') {
                this.provider = new WebDbProvider();
            } else {
                this.provider = new NativeDbProvider(this.createSchemaInternal.bind(this));
            }

            try {
                await this.provider.initialize();

                // Set isInitialized early to avoid deadlock when createSchema calls execute/query
                this.isInitialized = true;

                if (platform === 'web') {
                    await this.createSchema();
                }

                // Seed categories if it's the first time
                await seedCategoriesIfNeeded(this.provider);

                this.initPromise = null;
                console.info(`SqliteService: Database initialized on ${platform}`);
            } catch (error) {
                this.isInitialized = false;
                this.initPromise = null;
                console.error('SqliteService: Error initializing database:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    private async createSchemaInternal(db: SQLiteDBConnection) {
        // This is specifically for native SQLite.

        // 1. Ensure the base schema exists (no-op for existing installs).
        await db.execute(this.getSchemaSql());

        // 2. Apply versioned migrations for existing installs. Fresh installs
        //    already get every column from getSchemaSql(), so ensureColumn()
        //    confirms it exists and skips.
        const version = await this.getSchemaVersion(db);

        if (version < 1) {
            // v1: columns added after the original schema shipped.
            await this.ensureColumn(db, 'transactions', 'receiptPath', 'TEXT');
            await this.ensureColumn(db, 'transactions', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
            await this.ensureColumn(db, 'categories', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
            await this.ensureColumn(db, 'recurring_transactions', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
        }

        if (version < 2) {
            // v2: import provenance + idempotency keys for API bulk imports.
            await this.ensureColumn(db, 'transactions', 'externalId', 'TEXT');
            await this.ensureColumn(db, 'transactions', 'importBatchId', 'TEXT');
            try {
                await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(externalId);');
                await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
            } catch (error) {
                // Indexes are an optimisation; the app still works without them.
                console.warn('SqliteService: could not create transaction indexes:', error);
            }
        }

        if (version < 3) {
            // v3: freeze each transaction's conversion so rate edits don't rewrite
            // history, and add the reconciliation flag.
            await this.ensureColumn(db, 'transactions', 'accountAmount', 'REAL');
            await this.ensureColumn(db, 'transactions', 'accountFee', 'REAL');
            await this.ensureColumn(db, 'transactions', 'toAccountAmount', 'REAL');
            await this.ensureColumn(db, 'transactions', 'baseAmount', 'REAL');
            await this.ensureColumn(db, 'transactions', 'baseCurrency', 'TEXT');
            await this.ensureColumn(db, 'transactions', 'fxRate', 'REAL');
            await this.ensureColumn(db, 'transactions', 'cleared', 'INTEGER NOT NULL DEFAULT 0');
            try {
                await db.execute('CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared);');
            } catch (error) {
                console.warn('SqliteService: could not create cleared index:', error);
            }

            // One-time snapshot: existing rows are frozen with the rates in effect
            // right now. After this, changing a rate only affects new entries.
            await this.backfillFrozenAmounts(db);
        }

        // Future migrations: if (version < 4) { ...ensureColumn / ALTER / CREATE INDEX... }

        // 3. Persist the new version. Non-fatal if it fails — every migration
        //    above is idempotent, so it can safely re-run on the next launch.
        if (version < LATEST_SCHEMA_VERSION) {
            try {
                await db.execute(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
            } catch (error) {
                console.warn('SqliteService: could not persist schema version:', error);
            }
        }
    }

    private async getSchemaVersion(db: SQLiteDBConnection): Promise<number> {
        try {
            const result = await db.query('PRAGMA user_version;');
            const row = result.values?.[0] as { user_version?: number } | undefined;
            const version = Number(row?.user_version ?? 0);
            return Number.isFinite(version) ? version : 0;
        } catch (error) {
            console.warn('SqliteService: could not read schema version:', error);
            return 0;
        }
    }

    private async hasColumn(db: SQLiteDBConnection, table: string, column: string): Promise<boolean> {
        const result = await db.query(`PRAGMA table_info(${table});`);
        return (result.values || []).some((row: any) => row.name === column);
    }

    private async ensureColumn(db: SQLiteDBConnection, table: string, column: string, definition: string) {
        if (await this.hasColumn(db, table, column)) return;
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }

    /**
     * Freeze the conversion for every existing transaction using the rates in
     * effect right now. Runs once, during the v3 migration. Rows that already
     * have a frozen amount are skipped, so this is safe to re-run.
     */
    private async backfillFrozenAmounts(db: SQLiteDBConnection) {
        const settingsResult = await db.query('SELECT value FROM settings WHERE key = ?', ['user_preferences']);
        let stored: Record<string, unknown> = {};
        const raw = settingsResult.values?.[0]?.value;
        if (typeof raw === 'string') {
            try {
                stored = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                stored = {};
            }
        }
        const settings = {
            mainCurrency: (stored.mainCurrency as Currency) || 'PKR',
            useCustomRates: stored.useCustomRates === true,
            customRates: (stored.customRates as Record<string, number>) || {},
        };

        const accountsResult = await db.query('SELECT * FROM accounts');
        const accounts = (accountsResult.values || []) as Account[];
        const accountById = new Map(accounts.map(account => [account.id, account]));

        const txResult = await db.query('SELECT * FROM transactions');
        const transactions = (txResult.values || []) as Transaction[];

        const statements: Array<{ statement: string; values: (string | number | null)[] }> = [];
        for (const tx of transactions) {
            if (tx.accountAmount !== undefined && tx.accountAmount !== null) continue;
            const source = accountById.get(tx.accountId);
            if (!source) continue;
            const destination = tx.type === 'Transfer' && tx.toAccountId
                ? accountById.get(tx.toAccountId) || null
                : null;
            const amounts = computeAmounts(tx, source, destination, settings);
            statements.push({
                statement: `UPDATE transactions SET accountAmount = ?, accountFee = ?, toAccountAmount = ?,
                            baseAmount = ?, baseCurrency = ?, fxRate = ? WHERE id = ?`,
                values: [
                    amounts.accountAmount,
                    amounts.accountFee,
                    amounts.toAccountAmount ?? null,
                    amounts.baseAmount,
                    amounts.baseCurrency,
                    amounts.fxRate,
                    tx.id,
                ],
            });
        }

        if (statements.length === 0) return;
        try {
            await db.executeSet(statements, true);
            console.info(`SqliteService: froze conversion for ${statements.length} existing transaction(s).`);
        } catch (error) {
            // The app still works because recalculation falls back to live rates.
            console.warn('SqliteService: could not backfill frozen amounts:', error);
        }
    }

    private async createSchema() {
        // This works for both because it uses the provider's execute/query
        const schema = this.getSchemaSql();
        // The WebDbProvider's execute will ignore most CREATE TABLE statements 
        // as tables are created dynamically, but we call it for consistency.
        await this.execute(schema);
    }

    private getSchemaSql(): string {
        return `
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                currency TEXT NOT NULL,
                balance REAL NOT NULL,
                initialBalance REAL NOT NULL,
                color TEXT,
                icon TEXT
            );

            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL,
                color TEXT NOT NULL,
                type TEXT NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                categoryId TEXT,
                accountId TEXT NOT NULL,
                toAccountId TEXT,
                date TEXT NOT NULL,
                note TEXT,
                type TEXT NOT NULL,
                fee REAL,
                receiptPath TEXT,
                hidden INTEGER NOT NULL DEFAULT 0,
                externalId TEXT,
                importBatchId TEXT,
                accountAmount REAL,
                accountFee REAL,
                toAccountAmount REAL,
                baseAmount REAL,
                baseCurrency TEXT,
                fxRate REAL,
                cleared INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(accountId) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY(toAccountId) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS budgets (
                id TEXT PRIMARY KEY,
                categoryId TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                period TEXT NOT NULL,
                FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id TEXT PRIMARY KEY,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                categoryId TEXT,
                accountId TEXT NOT NULL,
                toAccountId TEXT,
                note TEXT,
                type TEXT NOT NULL,
                fee REAL,
                frequency TEXT NOT NULL,
                nextRunDate TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                hidden INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                at TEXT NOT NULL,
                action TEXT NOT NULL,
                entity TEXT NOT NULL,
                entityId TEXT NOT NULL,
                before TEXT,
                after TEXT,
                batchId TEXT,
                undoneAt TEXT
            );
        `;
    }

    async getProvider(): Promise<IDbProvider> {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.provider!;
    }

    async execute(sql: string, params: any[] = []) {
        const provider = await this.getProvider();
        return await provider.execute(sql, params);
    }

    async run(sql: string, params: any[] = []) {
        const provider = await this.getProvider();
        return await provider.execute(sql, params);
    }

    async query(sql: string, params: any[] = []) {
        const provider = await this.getProvider();
        return await provider.query(sql, params);
    }

    async transaction(callback: (provider: IDbProvider) => Promise<void>) {
        const provider = await this.getProvider();
        await provider.transaction(callback);
    }
}

export const sqliteService = new SqliteService();
