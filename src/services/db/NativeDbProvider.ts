import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { IDbProvider, DbExecuteResult, DbQueryResult } from './types';

export class NativeDbProvider implements IDbProvider {
    private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
    private db: SQLiteDBConnection | null = null;
    private readonly DB_NAME = 'smart_ledger_db';

    private isInitialized = false;
    private createSchema: (db: SQLiteDBConnection) => Promise<void>;

    constructor(createSchema: (db: SQLiteDBConnection) => Promise<void>) {
        this.createSchema = createSchema;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        const ret = await this.sqlite.checkConnectionsConsistency();
        const isConn = (await this.sqlite.isConnection(this.DB_NAME, false)).result;

        if (ret.result && isConn) {
            this.db = await this.sqlite.retrieveConnection(this.DB_NAME, false);
        } else {
            this.db = await this.sqlite.createConnection(this.DB_NAME, false, 'no-encryption', 1, false);
        }

        await this.db!.open();
        await this.createSchema(this.db!);
        this.isInitialized = true;
    }

    async execute(sql: string, params: any[] = []): Promise<DbExecuteResult> {
        if (!this.db) throw new Error('Native database not initialized');
        const result = await this.db.run(sql, params);
        return {
            changes: result.changes?.changes ?? 0,
            lastId: result.changes?.lastId
        };
    }

    async run(sql: string, params: any[] = []): Promise<DbExecuteResult> {
        return this.execute(sql, params);
    }

    async query(sql: string, params: any[] = []): Promise<DbQueryResult> {
        if (!this.db) throw new Error('Native database not initialized');
        const result = await this.db.query(sql, params);
        return {
            values: result.values
        };
    }

    async transaction(callback: (provider: IDbProvider) => Promise<void>): Promise<void> {
        if (!this.db) throw new Error('Native database not initialized');

        // Capacitor SQLite requires using executeSet for transactional operations
        // We'll collect statements during the callback and execute them together
        const statements: Array<{ statement: string; values: any[] }> = [];
        const queryResults: Map<number, any[]> = new Map();
        let queryIndex = 0;

        // Create a proxy provider that collects statements instead of executing them
        const transactionProvider: IDbProvider = {
            initialize: async () => { },
            execute: async (sql: string, params: any[] = []) => {
                statements.push({ statement: sql, values: params });
                return { changes: 0 };
            },
            run: async (sql: string, params: any[] = []) => {
                statements.push({ statement: sql, values: params });
                return { changes: 0 };
            },
            query: async (sql: string, params: any[] = []) => {
                // For queries within transactions, we need to execute them immediately
                // but we'll track them for now and execute the whole set atomically
                const idx = queryIndex++;
                statements.push({ statement: sql, values: params });
                return { values: queryResults.get(idx) || [] };
            },
            transaction: async () => {
                throw new Error('Nested transactions not supported');
            }
        };

        try {
            // Collect all statements via the callback
            await callback(transactionProvider);

            // Execute all statements as a single transaction using executeSet
            if (statements.length > 0) {
                const set = statements.map(stmt => ({
                    statement: stmt.statement,
                    values: stmt.values
                }));

                await this.db.executeSet(set, true); // true = use transaction
            }
        } catch (error) {
            // executeSet handles rollback automatically on error
            throw error;
        }
    }
}
