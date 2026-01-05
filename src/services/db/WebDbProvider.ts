import localforage from 'localforage';
import type { IDbProvider, DbExecuteResult, DbQueryResult } from './types';

export class WebDbProvider implements IDbProvider {
    private isInitialized = false;

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        localforage.config({
            name: 'SmartLedger',
            storeName: 'smart_ledger_store'
        });
        this.isInitialized = true;
        console.log('Web database (localforage) initialized');
    }

    private async getTable(tableName: string): Promise<any[]> {
        const data = await localforage.getItem<any[]>(tableName);
        return data || [];
    }

    private async saveTable(tableName: string, data: any[]): Promise<void> {
        await localforage.setItem(tableName, data);
    }

    async execute(sql: string, params: any[] = []): Promise<DbExecuteResult> {
        if (!this.isInitialized) await this.initialize();

        const cleanSql = sql.trim().replace(/\s+/g, ' ');

        // INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        if (cleanSql.toUpperCase().startsWith('INSERT OR REPLACE INTO SETTINGS')) {
            const tableName = 'settings';
            const table = await this.getTable(tableName);
            const key = params[0];
            const value = params[1];

            const index = table.findIndex(item => item.key === key);
            if (index >= 0) {
                table[index] = { key, value };
            } else {
                table.push({ key, value });
            }
            await this.saveTable(tableName, table);
            return { changes: 1 };
        }

        // INSERT INTO table (cols) VALUES (?, ...)
        if (cleanSql.toUpperCase().startsWith('INSERT INTO')) {
            const matches = cleanSql.match(/INSERT INTO (\w+)/i);
            const tableName = matches![1].toLowerCase();
            const table = await this.getTable(tableName);

            // Simplified parsing for current app usage
            // The app expects full objects usually
            const colsMatch = cleanSql.match(/\((.*?)\)/);
            const cols = colsMatch![1].split(',').map(c => c.trim());

            const newRecord: any = {};
            cols.forEach((col, idx) => {
                newRecord[col] = params[idx];
            });

            table.push(newRecord);
            await this.saveTable(tableName, table);
            return { changes: 1 };
        }

        // UPDATE table SET col1 = ?, ... WHERE id = ?
        if (cleanSql.toUpperCase().startsWith('UPDATE')) {
            const tableNameMatch = cleanSql.match(/UPDATE (\w+)/i);
            const tableName = tableNameMatch![1].toLowerCase();
            const table = await this.getTable(tableName);

            // Find ID in params (last one usually)
            const id = params[params.length - 1];
            const index = table.findIndex(item => item.id === id);

            if (index >= 0) {
                // Simplified: assuming update fields match params order
                const setClauseMatch = cleanSql.match(/SET (.*?) WHERE/i);
                const fields = setClauseMatch![1].split(',').map(f => f.split('=')[0].trim());

                fields.forEach((field, idx) => {
                    table[index][field] = params[idx];
                });

                await this.saveTable(tableName, table);
                return { changes: 1 };
            }
            return { changes: 0 };
        }

        // DELETE FROM table WHERE id = ?
        if (cleanSql.toUpperCase().startsWith('DELETE FROM')) {
            const tableNameMatch = cleanSql.match(/DELETE FROM (\w+)/i);
            const tableName = tableNameMatch![1].toLowerCase();
            const table = await this.getTable(tableName);
            const id = params[0];

            const newTable = table.filter(item => item.id !== id);
            await this.saveTable(tableName, newTable);
            return { changes: table.length - newTable.length };
        }

        console.warn('Unsupported Web SQL (execute):', sql);
        return { changes: 0 };
    }

    async query(sql: string, params: any[] = []): Promise<DbQueryResult> {
        if (!this.isInitialized) await this.initialize();

        const cleanSql = sql.trim().replace(/\s+/g, ' ');

        // Support for both SELECT * FROM and SELECT col FROM
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
            const tableNameMatch = cleanSql.match(/FROM (\w+)/i);

            if (!tableNameMatch) {
                console.warn('Unsupported Web SQL (query):', sql);
                return { values: [] };
            }

            const tableName = tableNameMatch[1].toLowerCase();
            let table = await this.getTable(tableName);

            // Simple WHERE support for key/id filtering
            if (cleanSql.toUpperCase().includes('WHERE')) {
                const whereMatch = cleanSql.match(/WHERE (\w+)\s*=\s*\?/i);
                if (whereMatch) {
                    const col = whereMatch[1].toLowerCase();
                    const val = params[0];
                    table = table.filter(item => {
                        // Case insensitive column matching since our objects have lowercase keys usually
                        const itemVal = item[col] !== undefined ? item[col] : item[whereMatch[1]];
                        return itemVal === val;
                    });
                }
            }

            // ORDER BY, LIMIT etc... (existing logic)
            if (cleanSql.toUpperCase().includes('ORDER BY')) {
                const orderMatch = cleanSql.match(/ORDER BY (\w+)( \w+)?/i);
                if (orderMatch) {
                    const col = orderMatch[1];
                    const dir = orderMatch[2]?.trim().toUpperCase() || 'ASC';
                    table.sort((a, b) => {
                        if (a[col] < b[col]) return dir === 'DESC' ? 1 : -1;
                        if (a[col] > b[col]) return dir === 'DESC' ? -1 : 1;
                        return 0;
                    });
                }
            }

            if (cleanSql.toUpperCase().includes('LIMIT')) {
                const limitMatch = cleanSql.match(/LIMIT (\d+)/i);
                if (limitMatch) {
                    const limit = parseInt(limitMatch[1], 10);
                    table = table.slice(0, limit);
                } else if (params.length > 0 && cleanSql.endsWith('?')) {
                    table = table.slice(0, params[params.length - 1]);
                }
            }

            return { values: table };
        }

        console.warn('Unsupported Web SQL (query):', sql);
        return { values: [] };
    }

    async run(sql: string, params: any[] = []): Promise<DbExecuteResult> {
        return this.execute(sql, params);
    }

    async transaction(callback: (provider: IDbProvider) => Promise<void>): Promise<void> {
        // Simple transaction simulation: just run it. 
        // Real rollback is hard with localforage without snapshotting.
        // For development, we'll assuming success.
        await callback(this);
    }
}
