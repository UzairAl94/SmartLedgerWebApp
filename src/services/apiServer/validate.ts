import type {
    Account,
    AccountType,
    Budget,
    Category,
    Currency,
    RecurringFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
    UserSettings,
} from '../../types';

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

export const CURRENCIES: Currency[] = ['PKR', 'USD', 'AED', 'MYR'];

export const isCurrency = (value: string): value is Currency =>
    (CURRENCIES as string[]).includes(value.toUpperCase());

export const asString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const asNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const asBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
    return false;
};

export const normalizeCurrency = (value: unknown, fallback: Currency): Currency => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = asString(value)?.toUpperCase();
    if (!parsed || !isCurrency(parsed)) {
        throw new ApiError(400, 'currency must be one of PKR, USD, AED, MYR.');
    }
    return parsed;
};

export const normalizeDate = (value: unknown, fallbackNow = false): string => {
    if (value === undefined || value === null || value === '') {
        if (fallbackNow) return new Date().toISOString();
        throw new ApiError(400, 'date is required (YYYY-MM-DD or ISO timestamp).');
    }
    if (typeof value !== 'string') {
        throw new ApiError(400, 'date must be a string.');
    }
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        // Anchor date-only values at noon UTC, matching the manual form.
        return `${raw}T12:00:00.000Z`;
    }
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) {
        throw new ApiError(400, `Invalid date "${raw}".`);
    }
    return new Date(ms).toISOString();
};

export const findAccount = (accounts: Account[], idValue: unknown, nameValue: unknown): Account | null => {
    const id = asString(idValue);
    if (id) {
        const byId = accounts.find(account => account.id === id);
        if (byId) return byId;
    }
    const name = asString(nameValue);
    if (name) {
        return accounts.find(account => account.name.toLowerCase() === name.toLowerCase()) || null;
    }
    return null;
};

export const findCategory = (categories: Category[], idValue: unknown, nameValue: unknown): Category | null => {
    const id = asString(idValue);
    if (id) {
        const byId = categories.find(category => category.id === id);
        if (byId) return byId;
    }
    const name = asString(nameValue);
    if (name) {
        return categories.find(category => category.name.toLowerCase() === name.toLowerCase()) || null;
    }
    return null;
};

export interface NormalizedTransaction {
    tx: Omit<Transaction, 'id'>;
    accountName: string;
    categoryName: string | null;
    toAccountName: string | null;
}

export const normalizeTransactionInput = (
    raw: Record<string, unknown>,
    context: {
        accounts: Account[];
        categories: Category[];
        settings: UserSettings;
        requireDate?: boolean;
    }
): NormalizedTransaction => {
    const typeMap: Record<string, TransactionType> = {
        income: 'Income',
        expense: 'Expense',
        transfer: 'Transfer',
    };
    const typeRaw = asString(raw.type)?.toLowerCase();
    const type = typeRaw ? typeMap[typeRaw] : undefined;
    if (!type) {
        throw new ApiError(400, 'type must be income, expense, or transfer.');
    }

    const amount = asNumber(raw.amount);
    if (amount === null || amount <= 0) {
        throw new ApiError(400, 'amount must be a positive number.');
    }

    const date = normalizeDate(raw.date, context.requireDate !== true);

    const account = findAccount(context.accounts, raw.accountId, raw.account);
    if (!account) {
        throw new ApiError(
            400,
            `Account not found: ${asString(raw.account) || asString(raw.accountId) || '(missing)'}.`
        );
    }

    let categoryId: string | undefined;
    let categoryName: string | null = null;
    if (type !== 'Transfer') {
        const category = findCategory(context.categories, raw.categoryId, raw.category);
        if (!category) {
            throw new ApiError(
                400,
                `Category not found: ${asString(raw.category) || asString(raw.categoryId) || '(missing)'}.`
            );
        }
        if (category.type !== type) {
            throw new ApiError(
                400,
                `Category "${category.name}" is a ${category.type} category, not ${type}.`
            );
        }
        categoryId = category.id;
        categoryName = category.name;
    }

    let toAccountId: string | undefined;
    let toAccountName: string | null = null;
    if (type === 'Transfer') {
        const toAccount = findAccount(context.accounts, raw.toAccountId, raw.toAccount);
        if (!toAccount) {
            throw new ApiError(
                400,
                `Destination account not found: ${asString(raw.toAccount) || asString(raw.toAccountId) || '(missing)'}.`
            );
        }
        if (toAccount.id === account.id) {
            throw new ApiError(400, 'Source and destination accounts must be different.');
        }
        toAccountId = toAccount.id;
        toAccountName = toAccount.name;
    }

    let fee = 0;
    if (raw.fee !== undefined && raw.fee !== null && raw.fee !== '') {
        const parsedFee = asNumber(raw.fee);
        if (parsedFee === null || parsedFee < 0) {
            throw new ApiError(400, 'fee must be zero or a positive number.');
        }
        fee = parsedFee;
    }

    const currency = normalizeCurrency(raw.currency, account.currency);

    const externalId = asString(raw.externalId);
    if (externalId && externalId.length > 200) {
        throw new ApiError(400, 'externalId must be 200 characters or fewer.');
    }

    const hidden = asBoolean(raw.hidden);

    const tx: Omit<Transaction, 'id'> = {
        amount,
        currency,
        categoryId,
        accountId: account.id,
        toAccountId,
        date,
        note: asString(raw.note) || undefined,
        type,
        fee: fee || undefined,
        receiptPath: asString(raw.receiptPath) || undefined,
        hidden: hidden ? 1 : 0,
        externalId: externalId || undefined,
    };

    return {
        tx,
        accountName: account.name,
        categoryName,
        toAccountName,
    };
};

export const normalizeAccountInput = (
    raw: Record<string, unknown>,
    settings: UserSettings
): Omit<Account, 'id'> => {
    const name = asString(raw.name);
    if (!name) throw new ApiError(400, 'name is required.');

    const typeMap: Record<string, AccountType> = {
        bank: 'Bank',
        cash: 'Cash',
        investment: 'Investment',
    };
    const typeRaw = asString(raw.type)?.toLowerCase();
    const type = typeRaw ? typeMap[typeRaw] : 'Bank';
    if (!type) throw new ApiError(400, 'type must be Bank, Cash, or Investment.');

    const currency = normalizeCurrency(raw.currency, settings.mainCurrency);

    const initialBalance = raw.initialBalance === undefined || raw.initialBalance === null
        ? 0
        : asNumber(raw.initialBalance);
    if (initialBalance === null || !Number.isFinite(initialBalance)) {
        throw new ApiError(400, 'initialBalance must be a number.');
    }

    return {
        name,
        type,
        currency,
        balance: initialBalance,
        initialBalance,
        color: asString(raw.color) || undefined,
        icon: asString(raw.icon) || undefined,
    };
};

export const normalizeCategoryInput = (raw: Record<string, unknown>): Omit<Category, 'id'> => {
    const name = asString(raw.name);
    if (!name) throw new ApiError(400, 'name is required.');

    const typeRaw = asString(raw.type)?.toLowerCase();
    const type: TransactionType | null = typeRaw === 'income' ? 'Income' : typeRaw === 'expense' ? 'Expense' : null;
    if (!type) throw new ApiError(400, 'type must be income or expense.');

    return {
        name,
        type,
        icon: asString(raw.icon) || '🏷️',
        color: asString(raw.color) || '#4f46e5',
        hidden: asBoolean(raw.hidden) ? 1 : 0,
    };
};

export const normalizeBudgetInput = (
    raw: Record<string, unknown>,
    categories: Category[],
    settings: UserSettings
): Omit<Budget, 'id'> => {
    const category = findCategory(categories, raw.categoryId, raw.category);
    if (!category) {
        throw new ApiError(
            400,
            `Category not found: ${asString(raw.category) || asString(raw.categoryId) || '(missing)'}.`
        );
    }
    if (category.type !== 'Expense') {
        throw new ApiError(400, 'Budgets can only target expense categories.');
    }

    const amount = asNumber(raw.amount);
    if (amount === null || amount <= 0) {
        throw new ApiError(400, 'amount must be a positive number.');
    }

    const period = asString(raw.period) || 'monthly';
    if (period !== 'monthly') {
        throw new ApiError(400, 'period must be "monthly".');
    }

    return {
        categoryId: category.id,
        amount,
        currency: normalizeCurrency(raw.currency, settings.mainCurrency),
        period: 'monthly',
    };
};

export const normalizeRecurringInput = (
    raw: Record<string, unknown>,
    context: { accounts: Account[]; categories: Category[]; settings: UserSettings }
): Omit<RecurringTransaction, 'id'> => {
    const frequencyMap: Record<string, RecurringFrequency> = {
        daily: 'daily',
        weekly: 'weekly',
        monthly: 'monthly',
    };
    const frequencyRaw = asString(raw.frequency)?.toLowerCase();
    const frequency = frequencyRaw ? frequencyMap[frequencyRaw] : undefined;
    if (!frequency) throw new ApiError(400, 'frequency must be daily, weekly, or monthly.');

    const nextRunDate = normalizeDate(raw.nextRunDate ?? raw.startDate, true);

    const base = normalizeTransactionInput(
        { ...raw, date: nextRunDate },
        { ...context, requireDate: false }
    );

    return {
        amount: base.tx.amount,
        currency: base.tx.currency,
        categoryId: base.tx.categoryId,
        accountId: base.tx.accountId,
        toAccountId: base.tx.toAccountId,
        note: base.tx.note,
        type: base.tx.type,
        fee: base.tx.fee,
        frequency,
        nextRunDate,
        active: raw.active === undefined || raw.active === null ? 1 : asBoolean(raw.active) ? 1 : 0,
        hidden: base.tx.hidden,
    };
};
