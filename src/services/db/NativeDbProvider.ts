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
        try {
            await this.db.execute('BEGIN TRANSACTION');
            await callback(this);
            await this.db.execute('COMMIT');
        } catch (error) {
            await this.db.execute('ROLLBACK');
            throw error;
        }
    }
}
