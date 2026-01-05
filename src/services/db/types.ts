export interface DbQueryResult {
    values?: any[];
}

export interface DbExecuteResult {
    changes?: number;
    lastId?: number;
}

export interface IDbProvider {
    initialize(): Promise<void>;
    execute(sql: string, params?: any[]): Promise<DbExecuteResult>;
    query(sql: string, params?: any[]): Promise<DbQueryResult>;
    transaction(callback: (provider: IDbProvider) => Promise<void>): Promise<void>;
    run(sql: string, params?: any[]): Promise<DbExecuteResult>;
}
