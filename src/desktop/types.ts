import type { Account, Budget, Category, RecurringTransaction, Transaction, UserSettings } from '../types';
import type { Summary } from '../services/analyticsService';

export interface TransactionView extends Transaction {
    accountName: string;
    categoryName: string | null;
    toAccountName: string | null;
}

export interface AccountBalanceRow {
    id: string;
    name: string;
    currency: Account['currency'];
    balance: number;
    balanceConverted: number;
}

export interface BalancesResponse {
    currency: Account['currency'];
    netWorth: number;
    accounts: AccountBalanceRow[];
}

export interface ServerStatus {
    running: boolean;
    port: number;
    host: string;
    allowLan: boolean;
    requestCount: number;
    addresses: string[];
}

export interface Counts {
    accounts: number;
    transactions: number;
    categories: number;
    budgets: number;
    recurring: number;
}

export interface HealthResponse {
    status: string;
    time: string;
    mainCurrency: Account['currency'];
    server: ServerStatus | null;
    counts: Counts;
}

export interface ApiLogEntry {
    at: string;
    method: string;
    path: string;
    status: number;
    ms: number;
}

export interface TransactionsResponse {
    transactions: TransactionView[];
    total: number;
    limit: number;
    offset: number;
}

export interface ImportBatch {
    batchId: string;
    count: number;
    firstDate: string;
    lastDate: string;
}

export interface ExportedLedger {
    version: number;
    timestamp: string;
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    recurring: RecurringTransaction[];
    settings: UserSettings;
}

export type SafeSettings = UserSettings & { hasPin?: boolean };

export interface TransactionFilters {
    q: string;
    type: string;
    accountId: string;
    categoryId: string;
    from: string;
    to: string;
    order: 'asc' | 'desc';
}

export type RangeKey = 'this-month' | 'last-month' | '3m' | '6m' | 'ytd' | 'all';

export type PageKey =
    | 'dashboard'
    | 'transactions'
    | 'reconcile'
    | 'accounts'
    | 'budgets'
    | 'recurring'
    | 'imports'
    | 'activity'
    | 'diagnostics'
    | 'api'
    | 'settings';

export type ModalState =
    | { kind: 'tx'; tx: TransactionView | null }
    | { kind: 'account'; account: Account | null }
    | { kind: 'budget'; budget: Budget | null }
    | { kind: 'recurring' }
    | { kind: 'confirm'; title: string; message: string; confirmLabel: string; run: () => Promise<void> | void };

export interface ToastMessage {
    id: string;
    text: string;
    kind: 'ok' | 'error' | '';
}

export interface Connection {
    baseUrl: string;
    token: string;
}

export type SummaryData = Summary;

export const RANGE_OPTIONS: Array<[RangeKey, string]> = [
    ['this-month', 'This month'],
    ['last-month', 'Last month'],
    ['3m', 'Last 3 months'],
    ['6m', 'Last 6 months'],
    ['ytd', 'Year to date'],
    ['all', 'All time'],
];

export const PAGE_META: Record<PageKey, [string, string]> = {
    dashboard: ['Overview', 'Your money at a glance'],
    transactions: ['Transactions', 'Every entry in the ledger'],
    reconcile: ['Reconcile', 'Match cleared rows to a statement'],
    accounts: ['Accounts', 'Where the money sits'],
    budgets: ['Budgets', 'Monthly limits per category'],
    recurring: ['Recurring', 'Rules that create entries automatically'],
    imports: ['Imports', 'Batches written through the API'],
    activity: ['Activity', 'Recent changes, with undo'],
    diagnostics: ['Data health', 'Integrity checks across the ledger'],
    api: ['API & Sync', 'The phone server this page talks to'],
    settings: ['Settings', 'Preferences shared with the mobile app'],
};

export interface ReconcileState {
    accountId: string;
    accountName: string;
    currency: Account['currency'];
    ledgerBalance: number;
    clearedBalance: number;
    unclearedCount: number;
    unclearedDelta: number;
}

export interface AuditEntryView {
    id: string;
    at: string;
    action: 'create' | 'update' | 'delete' | 'clear' | 'batch-create';
    entity: 'transaction' | 'import';
    entityId: string;
    before: unknown;
    after: unknown;
    batchId: string | null;
    undoneAt: string | null;
}

export interface HealthIssue {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    entityId?: string;
}

export interface HealthReport {
    checkedAt: string;
    counts: {
        accounts: number;
        transactions: number;
        categories: number;
        budgets: number;
    };
    issues: HealthIssue[];
}
