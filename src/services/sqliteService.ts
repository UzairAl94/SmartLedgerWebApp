import { Capacitor } from '@capacitor/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { IDbProvider } from './db/types';
import { NativeDbProvider } from './db/NativeDbProvider';
import { WebDbProvider } from './db/WebDbProvider';
import { seedCategoriesIfNeeded } from './db/seeder';

class SqliteService {
    private provider: IDbProvider | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;

    async initialize() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        console.log('SqliteService: Starting initialization...');
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
                console.log(`SqliteService: Database initialized on ${platform}`);
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
        // This is specifically for native SQLite
        const schema = this.getSchemaSql();
        await db.execute(schema);
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
                type TEXT NOT NULL
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
                FOREIGN KEY(accountId) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY(toAccountId) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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
