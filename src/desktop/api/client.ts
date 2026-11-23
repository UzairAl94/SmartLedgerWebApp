import type { Account, Budget, Category, Currency, RecurringTransaction, UserSettings } from '../../types';
import type {
    ApiLogEntry,
    AuditEntryView,
    BalancesResponse,
    Connection,
    ExportedLedger,
    HealthReport,
    HealthResponse,
    ImportBatch,
    ReconcileState,
    SafeSettings,
    SummaryData,
    TransactionFilters,
    TransactionView,
    TransactionsResponse,
} from '../types';
import { toQuery } from '../format';

export class ApiError extends Error {
    status: number;
    details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

export interface TransactionInput {
    type: string;
    amount: number;
    currency?: Currency;
    accountId: string;
    categoryId?: string;
    toAccountId?: string;
    date: string;
    fee?: number;
    note?: string;
    hidden?: boolean;
}

export interface AccountInput {
    name: string;
    type: string;
    currency: Currency;
    initialBalance?: number;
    color?: string;
}

export interface RecurringInput extends TransactionInput {
    frequency: string;
    nextRunDate: string;
    active?: boolean;
}

async function request<T>(connection: Connection, path: string, init: RequestInit = {}): Promise<T> {
    const base = connection.baseUrl.replace(/\/+$/, '');
    let response: Response;
    try {
        response = await fetch(base + path, {
            ...init,
            headers: {
                Authorization: `Bearer ${connection.token}`,
                'Content-Type': 'application/json',
                ...(init.headers || {}),
            },
        });
    } catch (caught) {
        const reason = caught instanceof Error ? caught.message : String(caught);
        throw new ApiError(0, `Could not reach ${base}. ${reason}`);
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch {
            payload = { raw: text };
        }
    }

    if (!response.ok) {
        const body = payload as { error?: { message?: string } } | null;
        throw new ApiError(response.status, body?.error?.message || `HTTP ${response.status}`, payload);
    }

    return payload as T;
}

const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const createClient = (connection: Connection) => ({
    async health(): Promise<HealthResponse> {
        return request<HealthResponse>(connection, '/api/health');
    },

    async logs(): Promise<ApiLogEntry[]> {
        const data = await request<{ logs: ApiLogEntry[] }>(connection, '/api/logs');
        return data.logs || [];
    },

    async listAccounts(): Promise<Account[]> {
        const data = await request<{ accounts: Account[] }>(connection, '/api/accounts');
        return data.accounts || [];
    },

    async createAccount(input: AccountInput): Promise<void> {
        await request(connection, '/api/accounts', jsonBody(input));
    },

    async updateAccount(id: string, patch: Partial<AccountInput>): Promise<void> {
        await request(connection, `/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },

    async deleteAccount(id: string): Promise<void> {
        await request(connection, `/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async listCategories(): Promise<Category[]> {
        const data = await request<{ categories: Category[] }>(connection, '/api/categories');
        return data.categories || [];
    },

    async createCategory(input: { name: string; type: 'Income' | 'Expense'; icon?: string; color?: string }): Promise<void> {
        await request(connection, '/api/categories', jsonBody(input));
    },

    async deleteCategory(id: string): Promise<void> {
        await request(connection, `/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async listTransactions(filters: Partial<TransactionFilters>, limit: number, offset: number): Promise<TransactionsResponse> {
        const query = toQuery({ ...filters, limit, offset });
        return request<TransactionsResponse>(connection, `/api/transactions${query}`);
    },

    async createTransaction(input: TransactionInput): Promise<TransactionView> {
        const data = await request<{ transaction: TransactionView }>(connection, '/api/transactions', jsonBody(input));
        return data.transaction;
    },

    async updateTransaction(id: string, input: TransactionInput): Promise<void> {
        await request(connection, `/api/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
    },

    async deleteTransaction(id: string): Promise<void> {
        await request(connection, `/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async getSettings(): Promise<SafeSettings> {
        const data = await request<{ settings: SafeSettings }>(connection, '/api/settings');
        return data.settings;
    },

    async updateSettings(patch: Partial<UserSettings>): Promise<void> {
        await request(connection, '/api/settings', { method: 'PATCH', body: JSON.stringify(patch) });
    },

    async listBudgets(): Promise<Budget[]> {
        const data = await request<{ budgets: Budget[] }>(connection, '/api/budgets');
        return data.budgets || [];
    },

    async createBudget(input: { categoryId: string; amount: number; currency: Currency }): Promise<void> {
        await request(connection, '/api/budgets', jsonBody(input));
    },

    async updateBudget(id: string, input: { amount: number; currency: Currency }): Promise<void> {
        await request(connection, `/api/budgets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
    },

    async deleteBudget(id: string): Promise<void> {
        await request(connection, `/api/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async listRecurring(): Promise<RecurringTransaction[]> {
        const data = await request<{ recurring: RecurringTransaction[] }>(connection, '/api/recurring');
        return data.recurring || [];
    },

    async createRecurring(input: RecurringInput): Promise<void> {
        await request(connection, '/api/recurring', jsonBody(input));
    },

    async setRecurringActive(id: string, active: boolean): Promise<void> {
        await request(connection, `/api/recurring/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    },

    async deleteRecurring(id: string): Promise<void> {
        await request(connection, `/api/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async listImports(): Promise<ImportBatch[]> {
        const data = await request<{ imports: ImportBatch[] }>(connection, '/api/imports');
        return data.imports || [];
    },

    async undoImport(batchId: string): Promise<void> {
        await request(connection, `/api/imports/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
    },

    async summary(params: { from?: string; to?: string; currency: Currency }): Promise<SummaryData> {
        const query = toQuery({ ...params, groupBy: 'month' });
        return request<SummaryData>(connection, `/api/summary${query}`);
    },

    async balances(currency: Currency): Promise<BalancesResponse> {
        return request<BalancesResponse>(connection, `/api/balances${toQuery({ currency })}`);
    },

    async reconcile(accountId: string): Promise<ReconcileState> {
        return request<ReconcileState>(connection, `/api/reconcile${toQuery({ accountId })}`);
    },

    async setCleared(id: string, cleared: boolean): Promise<void> {
        await request(connection, `/api/transactions/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ cleared }),
        });
    },

    async audit(limit = 100): Promise<AuditEntryView[]> {
        const data = await request<{ entries: AuditEntryView[] }>(connection, `/api/audit${toQuery({ limit })}`);
        return data.entries || [];
    },

    async undoAudit(id: string): Promise<void> {
        await request(connection, `/api/audit/${encodeURIComponent(id)}/undo`, { method: 'POST' });
    },

    async diagnostics(): Promise<HealthReport> {
        return request<HealthReport>(connection, '/api/diagnostics');
    },

    async exportLedger(): Promise<ExportedLedger> {
        return request<ExportedLedger>(connection, '/api/export');
    },
});

export type LedgerClient = ReturnType<typeof createClient>;
