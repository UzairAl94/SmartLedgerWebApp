import localforage from 'localforage';
import type { IDbProvider, DbExecuteResult, DbQueryResult } from './types';

interface ParsedWhere {
    logic: 'AND' | 'OR';
    columns: string[];
}

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

    // Read a column from a row, tolerating case differences between the SQL
    // identifier and the stored object key.
    private getRowValue(row: any, column: string): any {
        if (column in row) return row[column];
        const key = Object.keys(row).find(k => k.toLowerCase() === column.toLowerCase());
        return key ? row[key] : undefined;
    }

    // Parse "col = ? [AND|OR col = ? ...]" into a predicate description.
    // Returns null for anything outside the supported subset.
    private parseWhere(whereClause: string): ParsedWhere | null {
        const clause = whereClause.trim();
        if (!clause) return null;

        const orParts = clause.split(/\s+OR\s+/i);
        const logic: 'AND' | 'OR' = orParts.length > 1 ? 'OR' : 'AND';
        const parts = logic === 'OR' ? orParts : clause.split(/\s+AND\s+/i);

        const columns: string[] = [];
        for (const part of parts) {
            const match = part.trim().match(/^(\w+)\s*=\s*\?$/);
            if (!match) return null;
            columns.push(match[1]);
        }
        return { logic, columns };
    }

    private matchesWhere(row: any, where: ParsedWhere, values: any[]): boolean {
        const results = where.columns.map((column, index) =>
            this.getRowValue(row, column) === values[index]
        );
        return where.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    }

    async execute(sql: string, params: any[] = []): Promise<DbExecuteResult> {
        if (!this.isInitialized) await this.initialize();

        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        const upperSql = cleanSql.toUpperCase();

        // INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        if (upperSql.startsWith('INSERT OR REPLACE INTO SETTINGS')) {
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
        if (upperSql.startsWith('INSERT INTO')) {
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

        // UPDATE table SET col1 = ?, ... WHERE col = ?
        if (upperSql.startsWith('UPDATE')) {
            const updateMatch = cleanSql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)\s+WHERE\s+(.*)$/i);
            if (!updateMatch) {
                console.warn('Unsupported Web SQL (update):', sql);
                return { changes: 0 };
            }

            const tableName = updateMatch[1].toLowerCase();
            const columns = updateMatch[2].split(',').map(part => {
                const match = part.trim().match(/^(\w+)\s*=\s*\?$/);
                return match ? match[1] : null;
            });
            if (columns.some(column => column === null)) {
                console.warn('Unsupported Web SQL (update set):', sql);
                return { changes: 0 };
            }

            const where = this.parseWhere(updateMatch[3]);
            if (!where) {
                console.warn('Unsupported Web SQL (update where):', sql);
                return { changes: 0 };
            }

            const setValues = params.slice(0, columns.length);
            const whereValues = params.slice(columns.length, columns.length + where.columns.length);

            const table = await this.getTable(tableName);
            let changed = 0;
            for (const row of table) {
                if (!this.matchesWhere(row, where, whereValues)) continue;
                (columns as string[]).forEach((column, index) => {
                    row[column] = setValues[index];
                });
                changed++;
            }

            if (changed > 0) await this.saveTable(tableName, table);
            return { changes: changed };
        }

        // DELETE FROM table [WHERE col = ? [AND|OR col = ? ...]]
        if (upperSql.startsWith('DELETE FROM')) {
            const deleteMatch = cleanSql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*))?$/i);
            if (!deleteMatch) {
                console.warn('Unsupported Web SQL (delete):', sql);
                return { changes: 0 };
            }

            const tableName = deleteMatch[1].toLowerCase();
            const table = await this.getTable(tableName);

            // No WHERE clause: clear the table (used by restore).
            if (!deleteMatch[2]) {
                await this.saveTable(tableName, []);
                return { changes: table.length };
            }

            const where = this.parseWhere(deleteMatch[2]);
            if (!where) {
                console.warn('Unsupported Web SQL (delete where):', sql);
                return { changes: 0 };
            }

            const values = params.slice(0, where.columns.length);
            const remaining = table.filter(row => !this.matchesWhere(row, where, values));
            await this.saveTable(tableName, remaining);
            return { changes: table.length - remaining.length };
        }

        console.warn('Unsupported Web SQL (execute):', sql);
        return { changes: 0 };
    }

    async query(sql: string, params: any[] = []): Promise<DbQueryResult> {
        if (!this.isInitialized) await this.initialize();

        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        const upperSql = cleanSql.toUpperCase();

        // Support for both SELECT * FROM and SELECT col FROM
        if (upperSql.startsWith('SELECT')) {
            const tableNameMatch = cleanSql.match(/FROM (\w+)/i);

            if (!tableNameMatch) {
                console.warn('Unsupported Web SQL (query):', sql);
                return { values: [] };
            }

            const tableName = tableNameMatch[1].toLowerCase();
            let table = await this.getTable(tableName);

            // WHERE support: one or more "col = ?" joined by AND / OR.
            const whereMatch = cleanSql.match(/\sWHERE\s+(.+?)(?=\s+ORDER\s+BY\s+|\s+LIMIT\s+|$)/i);
            if (whereMatch) {
                const where = this.parseWhere(whereMatch[1]);
                if (where) {
                    const values = params.slice(0, where.columns.length);
                    table = table.filter(row => this.matchesWhere(row, where, values));
                } else {
                    console.warn('Unsupported Web SQL (query where):', sql);
                    return { values: [] };
                }
            }

            // ORDER BY
            if (upperSql.includes('ORDER BY')) {
                const orderMatch = cleanSql.match(/ORDER BY (\w+)( \w+)?/i);
                if (orderMatch) {
                    const col = orderMatch[1];
                    const dir = orderMatch[2]?.trim().toUpperCase() || 'ASC';
                    table = [...table].sort((a, b) => {
                        if (a[col] < b[col]) return dir === 'DESC' ? 1 : -1;
                        if (a[col] > b[col]) return dir === 'DESC' ? -1 : 1;
                        return 0;
                    });
                }
            }

            // LIMIT
            if (upperSql.includes('LIMIT')) {
                const limitMatch = cleanSql.match(/LIMIT (\d+)/i);
                if (limitMatch) {
                    table = table.slice(0, parseInt(limitMatch[1], 10));
                } else if (cleanSql.endsWith('?') && params.length > 0) {
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
        // localforage has no transactions, so snapshot every table and restore
        // the snapshot if the callback throws. This makes restores and other
        // multi-write operations all-or-nothing on web.
        const snapshot = new Map<string, any[]>();
        await localforage.iterate((value: any, key: string) => {
            snapshot.set(key, JSON.parse(JSON.stringify(value)));
        });

        try {
            await callback(this);
        } catch (error) {
            for (const [key, value] of snapshot.entries()) {
                await localforage.setItem(key, value);
            }
            // Drop any tables created during the failed callback.
            const keys = await localforage.keys();
            for (const key of keys) {
                if (!snapshot.has(key)) await localforage.removeItem(key);
            }
            throw error;
        }
    }
}
