import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account, Budget, Category, RecurringTransaction, UserSettings } from '../types';
import { createClient, type LedgerClient } from './api/client';
import { convert, isoDay, rangeBounds } from './format';
import type {
    ApiLogEntry,
    BalancesResponse,
    Connection,
    HealthResponse,
    ImportBatch,
    PageKey,
    RangeKey,
    SafeSettings,
    SummaryData,
    ToastMessage,
    TransactionFilters,
    TransactionView,
} from './types';

const STORAGE_KEY = 'smartledger.desktop.v1';
const PAGE_SIZE = 25;

const DEFAULT_FILTERS: TransactionFilters = {
    q: '',
    type: '',
    accountId: '',
    categoryId: '',
    from: '',
    to: '',
    order: 'desc',
};

export type ThemeChoice = 'light' | 'dark' | 'system';

interface StoredState {
    connection: Connection | null;
    theme: ThemeChoice;
}

export function readStored(): StoredState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { connection: null, theme: 'system' };
        const parsed = JSON.parse(raw) as Partial<StoredState>;
        const theme = parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system';
        const connection =
            parsed.connection && typeof parsed.connection.baseUrl === 'string' && typeof parsed.connection.token === 'string'
                ? parsed.connection
                : null;
        return { connection, theme };
    } catch {
        return { connection: null, theme: 'system' };
    }
}

export function writeStored(next: StoredState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /* storage unavailable */
    }
}

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const emptyDashboard = null;

export interface DesktopStore {
    connection: Connection | null;
    client: LedgerClient | null;
    theme: ThemeChoice;
    activeTheme: 'light' | 'dark';
    setTheme: (theme: ThemeChoice) => void;
    connect: (connection: Connection) => Promise<void>;
    disconnect: () => void;

    page: PageKey;
    navigate: (page: PageKey) => void;

    accounts: Account[];
    categories: Category[];
    settings: SafeSettings | null;
    budgets: Budget[];
    recurring: RecurringTransaction[];
    imports: ImportBatch[];
    dashboard: { balances: BalancesResponse; summary: SummaryData; recent: TransactionView[] } | null;
    budgetSpend: Record<string, number>;
    transactions: TransactionView[];
    transactionTotal: number;
    transactionOffset: number;
    filters: TransactionFilters;
    range: RangeKey;
    api: { health: HealthResponse | null; logs: ApiLogEntry[]; latency: number | null };

    loading: boolean;
    error: string | null;
    setFilters: (patch: Partial<TransactionFilters>) => void;
    setRange: (range: RangeKey) => void;
    setPage: (offset: number) => void;
    refresh: () => Promise<void>;

    toasts: ToastMessage[];
    notify: (text: string, kind?: ToastMessage['kind']) => void;
}

export function useDesktopStore(): DesktopStore {
    const stored = useMemo(() => readStored(), []);
    const [connection, setConnection] = useState<Connection | null>(stored.connection);
    const [theme, setThemeState] = useState<ThemeChoice>(stored.theme);
    const [systemDark, setSystemDark] = useState<boolean>(() =>
        typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    const [page, setPage] = useState<PageKey>('dashboard');
    const [range, setRange] = useState<RangeKey>('6m');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [settings, setSettings] = useState<SafeSettings | null>(null);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
    const [imports, setImports] = useState<ImportBatch[]>([]);
    const [dashboard, setDashboard] = useState<DesktopStore['dashboard']>(emptyDashboard);
    const [budgetSpend, setBudgetSpend] = useState<Record<string, number>>({});
    const [transactions, setTransactions] = useState<TransactionView[]>([]);
    const [transactionTotal, setTransactionTotal] = useState(0);
    const [filters, setFiltersState] = useState<TransactionFilters>(DEFAULT_FILTERS);
    const [offset, setOffset] = useState(0);
    const [api, setApi] = useState<DesktopStore['api']>({ health: null, logs: [], latency: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const client = useMemo(() => (connection ? createClient(connection) : null), [connection]);
    const activeTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
        setSystemDark(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', activeTheme === 'dark');
    }, [activeTheme]);

    const notify = useCallback((text: string, kind: ToastMessage['kind'] = '') => {
        const toast: ToastMessage = { id: uid(), text, kind };
        setToasts(current => [...current, toast]);
        setTimeout(() => setToasts(current => current.filter(item => item.id !== toast.id)), 3800);
    }, []);

    const setTheme = useCallback(
        (next: ThemeChoice) => {
            setThemeState(next);
            writeStored({ connection, theme: next });
        },
        [connection]
    );

    const connect = useCallback(
        async (next: Connection) => {
            await createClient(next).health();
            setConnection(next);
            writeStored({ connection: next, theme });
            setError(null);
        },
        [theme]
    );

    const disconnect = useCallback(() => {
        setConnection(null);
        writeStored({ connection: null, theme });
        setAccounts([]);
        setCategories([]);
        setSettings(null);
        setDashboard(emptyDashboard);
        setTransactions([]);
        setApi({ health: null, logs: [], latency: null });
    }, [theme]);

    const refresh = useCallback(async () => {
        if (!client) return;
        setLoading(true);
        setError(null);
        try {
            const [nextAccounts, nextCategories, nextSettings] = await Promise.all([
                client.listAccounts(),
                client.listCategories(),
                client.getSettings(),
            ]);
            setAccounts(nextAccounts);
            setCategories(nextCategories);
            setSettings(nextSettings);
            const currency = (nextSettings?.mainCurrency as UserSettings['mainCurrency']) || 'PKR';

            if (page === 'dashboard') {
                const bounds = rangeBounds(range);
                const [balances, summary, recent] = await Promise.all([
                    client.balances(currency),
                    client.summary({ ...bounds, currency }),
                    client.listTransactions(bounds, 8, 0),
                ]);
                setDashboard({ balances, summary, recent: recent.transactions });
            } else if (page === 'transactions') {
                const data = await client.listTransactions(filters, PAGE_SIZE, offset);
                setTransactions(data.transactions);
                setTransactionTotal(data.total);
            } else if (page === 'budgets') {
                const now = new Date();
                const [nextBudgets, spend] = await Promise.all([
                    client.listBudgets(),
                    client.listTransactions(
                        { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now), type: 'expense' },
                        1000,
                        0
                    ),
                ]);
                setBudgets(nextBudgets);
                const totals: Record<string, number> = {};
                for (const tx of spend.transactions) {
                    if (!tx.categoryId) continue;
                    totals[tx.categoryId] = (totals[tx.categoryId] || 0) + convert(tx.amount, tx.currency, currency, nextSettings);
                }
                setBudgetSpend(totals);
            } else if (page === 'recurring') {
                setRecurring(await client.listRecurring());
            } else if (page === 'imports') {
                setImports(await client.listImports());
            } else if (page === 'api') {
                const started = performance.now();
                const [health, logs] = await Promise.all([client.health(), client.logs()]);
                setApi({ health, logs, latency: Math.round(performance.now() - started) });
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setLoading(false);
        }
    }, [client, page, filters, offset, range]);

    // Declarative load: any change to the client, page, or its inputs refetches.
    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        connection,
        client,
        theme,
        activeTheme,
        setTheme,
        connect,
        disconnect,
        page,
        navigate: setPage,
        accounts,
        categories,
        settings,
        budgets,
        recurring,
        imports,
        dashboard,
        budgetSpend,
        transactions,
        transactionTotal,
        transactionOffset: offset,
        filters,
        range,
        api,
        loading,
        error,
        setFilters: patch => {
            setFiltersState(current => ({ ...current, ...patch }));
            setOffset(0);
        },
        setRange,
        setPage: setOffset,
        refresh,
        toasts,
        notify,
    };
}

export const mainCurrencyOf = (settings: SafeSettings | null): UserSettings['mainCurrency'] =>
    (settings?.mainCurrency as UserSettings['mainCurrency']) || 'PKR';
