import { accountService } from '../accountService';
import { transactionService } from '../transactionService';
import { categoryService } from '../categoryService';
import { budgetService } from '../budgetService';
import { recurringService } from '../recurringService';
import { settingsService } from '../settingsService';
import { analyticsService } from '../analyticsService';
import { reconcileService } from '../reconcileService';
import { auditService } from '../auditService';
import { healthService } from '../healthService';
import { periodService } from '../periodService';
import { ApiServer } from './plugin';
import { getLogEntries } from './log';
import {
    ApiError,
    asBoolean,
    asNumber,
    asString,
    findAccount,
    findCategory,
    normalizeAccountInput,
    normalizeBudgetInput,
    normalizeCategoryInput,
    normalizeCurrency,
    normalizeRecurringInput,
    normalizeTransactionInput,
} from './validate';
import type { Account, AccountType, Category, Transaction, UserSettings } from '../../types';

export interface HandlerContext {
    params: Record<string, string>;
    query: URLSearchParams;
    body: Record<string, unknown>;
}

export interface HandlerResult {
    status: number;
    body: unknown;
}

export type Handler = (context: HandlerContext) => Promise<HandlerResult>;

const json = (body: unknown, status = 200): HandlerResult => ({ status, body });

const bodyRecord = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
};

const hash = (value: string): string => {
    let hashValue = 5381;
    for (let index = 0; index < value.length; index++) {
        hashValue = ((hashValue << 5) + hashValue + value.charCodeAt(index)) >>> 0;
    }
    return hashValue.toString(16);
};

const randomId = (): string => {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const boundary = (value: string | null, end: boolean): number | null => {
    if (!value) return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const ms = Date.parse(dateOnly ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}` : value);
    return Number.isNaN(ms) ? null : ms;
};

const loadContext = async () => {
    const [accounts, categories, settings] = await Promise.all([
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        settingsService.getSettings(),
    ]);
    return { accounts, categories, settings };
};

const transactionView = (
    tx: Transaction,
    accountById: Map<string, Account>,
    categoryById: Map<string, Category>
) => ({
    ...tx,
    accountName: accountById.get(tx.accountId)?.name || 'Unknown account',
    categoryName: tx.categoryId ? categoryById.get(tx.categoryId)?.name || null : null,
    toAccountName: tx.toAccountId ? accountById.get(tx.toAccountId)?.name || null : null,
});

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export const health: Handler = async () => {
    const [accounts, categories, transactions, budgets, recurring, settings] = await Promise.all([
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        transactionService.getAllTransactions(),
        budgetService.getAllBudgets(),
        recurringService.getAll(),
        settingsService.getSettings(),
    ]);

    let server = null;
    try {
        server = await ApiServer.getStatus();
    } catch {
        server = null;
    }

    return json({
        status: 'ok',
        time: new Date().toISOString(),
        mainCurrency: settings.mainCurrency,
        server,
        counts: {
            accounts: accounts.length,
            transactions: transactions.length,
            categories: categories.length,
            budgets: budgets.length,
            recurring: recurring.length,
        },
    });
};

export const version: Handler = async () => {
    const [accounts, categories, transactions, budgets, recurring, settings] = await Promise.all([
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        transactionService.getAllTransactions(),
        budgetService.getAllBudgets(),
        recurringService.getAll(),
        settingsService.getSettings(),
    ]);

    const latest = transactions[0];
    const fingerprint = [
        accounts.length,
        transactions.length,
        categories.length,
        budgets.length,
        recurring.length,
        latest?.id || '',
        latest?.date || '',
        JSON.stringify(settings),
    ].join('|');

    return json({
        rev: hash(fingerprint),
        counts: {
            accounts: accounts.length,
            transactions: transactions.length,
            categories: categories.length,
            budgets: budgets.length,
            recurring: recurring.length,
        },
        latestTransactionDate: latest?.date || null,
    });
};

export const logs: Handler = async () => json({ logs: getLogEntries() });

export const endpointCatalog: Handler = async () =>
    json({
        name: 'Smart Ledger local API',
        version: 1,
        auth: 'Authorization: Bearer <token>',
        endpoints: [
            'GET /api/health',
            'GET /api/version',
            'GET /api/logs',
            'GET|POST /api/accounts',
            'PATCH|DELETE /api/accounts/:id',
            'GET|POST /api/categories',
            'DELETE /api/categories/:id',
            'GET|POST /api/transactions',
            'GET|PATCH|DELETE /api/transactions/:id',
            'POST /api/import/transactions',
            'GET /api/imports',
            'DELETE /api/imports/:batchId',
            'GET|POST /api/budgets',
            'PATCH|DELETE /api/budgets/:id',
            'GET|POST /api/recurring',
            'PATCH|DELETE /api/recurring/:id',
            'GET|PATCH /api/settings',
            'GET /api/summary',
            'GET /api/balances',
            'GET /api/reconcile?accountId=…',
            'GET /api/audit',
            'POST /api/audit/:id/undo',
            'GET /api/diagnostics',
            'GET /api/periods',
            'GET /api/periods/proposals',
            'POST /api/periods',
            'POST /api/periods/apply',
            'PATCH|DELETE /api/periods/:id',
            'GET /api/export',
        ],
    });

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const listAccounts: Handler = async () => {
    const accounts = await accountService.getAllAccounts();
    return json({ accounts });
};

export const createAccount: Handler = async ({ body }) => {
    const settings = await settingsService.getSettings();
    const input = normalizeAccountInput(bodyRecord(body), settings);

    const accounts = await accountService.getAllAccounts();
    if (accounts.some(account => account.name.toLowerCase() === input.name.toLowerCase())) {
        throw new ApiError(409, `An account named "${input.name}" already exists.`);
    }

    const id = await accountService.addAccount(input);
    return json({ account: { id, ...input } }, 201);
};

export const updateAccount: Handler = async ({ params, body }) => {
    const id = params.id;
    const raw = bodyRecord(body);
    const { accounts } = await loadContext();
    const account = accounts.find(item => item.id === id);
    if (!account) throw new ApiError(404, 'Account not found.');

    const patch: Partial<Account> = {};

    if (raw.name !== undefined) {
        const name = asString(raw.name);
        if (!name) throw new ApiError(400, 'name must be a non-empty string.');
        if (accounts.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
            throw new ApiError(409, `An account named "${name}" already exists.`);
        }
        patch.name = name;
    }

    if (raw.type !== undefined) {
        const typeMap: Record<string, AccountType> = { bank: 'Bank', cash: 'Cash', investment: 'Investment' };
        const type = typeMap[asString(raw.type)?.toLowerCase() || ''];
        if (!type) throw new ApiError(400, 'type must be Bank, Cash, or Investment.');
        patch.type = type;
    }

    if (raw.color !== undefined) patch.color = asString(raw.color) || undefined;
    if (raw.icon !== undefined) patch.icon = asString(raw.icon) || undefined;

    const wantsCurrency = raw.currency !== undefined;
    const wantsInitial = raw.initialBalance !== undefined;
    if (wantsCurrency || wantsInitial) {
        const count = await transactionService.countForAccount(id);
        if (count > 0) {
            throw new ApiError(409, 'Cannot change currency or initial balance for an account that has transactions.');
        }
        if (wantsCurrency) patch.currency = normalizeCurrency(raw.currency, account.currency);
        if (wantsInitial) {
            const initialBalance = asNumber(raw.initialBalance);
            if (initialBalance === null) throw new ApiError(400, 'initialBalance must be a number.');
            patch.initialBalance = initialBalance;
            patch.balance = initialBalance;
        }
    }

    if (Object.keys(patch).length === 0) {
        throw new ApiError(400, 'No supported fields to update.');
    }

    await accountService.updateAccount(id, patch);
    const updated = (await accountService.getAllAccounts()).find(item => item.id === id);
    return json({ account: updated });
};

export const deleteAccount: Handler = async ({ params }) => {
    const accounts = await accountService.getAllAccounts();
    if (!accounts.some(account => account.id === params.id)) {
        throw new ApiError(404, 'Account not found.');
    }
    await accountService.deleteAccount(params.id);
    return json({ deleted: true, id: params.id });
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories: Handler = async () => {
    const categories = await categoryService.getAllCategories();
    return json({ categories });
};

export const createCategory: Handler = async ({ body }) => {
    const input = normalizeCategoryInput(bodyRecord(body));
    const categories = await categoryService.getAllCategories();
    if (categories.some(category =>
        category.type === input.type && category.name.toLowerCase() === input.name.toLowerCase()
    )) {
        throw new ApiError(409, `A ${input.type.toLowerCase()} category named "${input.name}" already exists.`);
    }
    const id = await categoryService.addCategory(input);
    return json({ category: { id, ...input } }, 201);
};

export const deleteCategory: Handler = async ({ params }) => {
    const categories = await categoryService.getAllCategories();
    if (!categories.some(category => category.id === params.id)) {
        throw new ApiError(404, 'Category not found.');
    }
    await categoryService.deleteCategory(params.id);
    return json({ deleted: true, id: params.id });
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const listTransactions: Handler = async ({ query }) => {
    const [transactions, accounts, categories] = await Promise.all([
        transactionService.getAllTransactions(),
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
    ]);

    const accountById = new Map(accounts.map(account => [account.id, account]));
    const categoryById = new Map(categories.map(category => [category.id, category]));

    const fromMs = boundary(query.get('from'), false);
    const toMs = boundary(query.get('to'), true);
    const accountId = query.get('accountId');
    const categoryId = query.get('categoryId');
    const batchId = query.get('batchId');
    const clearedRaw = query.get('cleared');
    const search = query.get('q')?.toLowerCase();
    const typeRaw = query.get('type')?.toLowerCase();
    const typeMap: Record<string, string> = { income: 'Income', expense: 'Expense', transfer: 'Transfer' };
    const type = typeRaw ? typeMap[typeRaw] : undefined;
    if (typeRaw && !type) throw new ApiError(400, 'type must be income, expense, or transfer.');

    const order = query.get('order') === 'asc' ? 'asc' : 'desc';
    const limitRaw = Number(query.get('limit') ?? 100);
    const limit = Math.min(Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : 100), 1), 1000);
    const offsetRaw = Number(query.get('offset') ?? 0);
    const offset = Math.max(Math.floor(Number.isFinite(offsetRaw) ? offsetRaw : 0), 0);

    const filtered = transactions.filter(tx => {
        const ms = Date.parse(tx.date);
        if (fromMs !== null && (Number.isNaN(ms) || ms < fromMs)) return false;
        if (toMs !== null && (Number.isNaN(ms) || ms > toMs)) return false;
        if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false;
        if (categoryId && tx.categoryId !== categoryId) return false;
        if (batchId && tx.importBatchId !== batchId) return false;
        if (clearedRaw === '1' && tx.cleared !== 1) return false;
        if (clearedRaw === '0' && tx.cleared === 1) return false;
        if (type && tx.type !== type) return false;
        if (search) {
            const haystack = [
                tx.note || '',
                accountById.get(tx.accountId)?.name || '',
                tx.categoryId ? categoryById.get(tx.categoryId)?.name || '' : '',
            ].join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    filtered.sort((a, b) => order === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));

    const page = filtered.slice(offset, offset + limit).map(tx => transactionView(tx, accountById, categoryById));

    return json({
        transactions: page,
        total: filtered.length,
        limit,
        offset,
    });
};

export const getTransaction: Handler = async ({ params }) => {
    const [transaction, accounts, categories] = await Promise.all([
        transactionService.getTransactionById(params.id),
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
    ]);
    if (!transaction) throw new ApiError(404, 'Transaction not found.');
    return json({
        transaction: transactionView(
            transaction,
            new Map(accounts.map(account => [account.id, account])),
            new Map(categories.map(category => [category.id, category]))
        ),
    });
};

export const createTransaction: Handler = async ({ body }) => {
    const { accounts, categories, settings } = await loadContext();
    const normalized = normalizeTransactionInput(bodyRecord(body), { accounts, categories, settings });
    const id = await transactionService.createTransaction(normalized.tx);
    const transaction = await transactionService.getTransactionById(id);
    if (!transaction) throw new ApiError(500, 'Transaction was created but could not be read back.');
    return json({
        transaction: transactionView(
            transaction,
            new Map(accounts.map(account => [account.id, account])),
            new Map(categories.map(category => [category.id, category]))
        ),
    }, 201);
};

export const updateTransaction: Handler = async ({ params, body }) => {
    const old = await transactionService.getTransactionById(params.id);
    if (!old) throw new ApiError(404, 'Transaction not found.');

    const { accounts, categories, settings } = await loadContext();
    const raw = bodyRecord(body);

    // Toggling reconciliation must not re-freeze the row's conversion.
    if (raw.cleared !== undefined && Object.keys(raw).length === 1) {
        await transactionService.setCleared([old.id], asBoolean(raw.cleared) ? 1 : 0);
        const updated = await transactionService.getTransactionById(old.id);
        if (!updated) throw new ApiError(500, 'Transaction was updated but could not be read back.');
        return json({
            transaction: transactionView(
                updated,
                new Map(accounts.map(account => [account.id, account])),
                new Map(categories.map(category => [category.id, category]))
            ),
        });
    }

    const base: Record<string, unknown> = {
        date: old.date,
        type: old.type,
        amount: old.amount,
        currency: old.currency,
        accountId: old.accountId,
        categoryId: old.categoryId,
        toAccountId: old.toAccountId,
        fee: old.fee,
        note: old.note,
        hidden: old.hidden,
        externalId: old.externalId,
    };
    const merged: Record<string, unknown> = { ...base, ...raw };
    // A name supplied by the caller should win over the stored id.
    if (raw.account !== undefined) delete merged.accountId;
    if (raw.category !== undefined) delete merged.categoryId;
    if (raw.toAccount !== undefined) delete merged.toAccountId;

    const normalized = normalizeTransactionInput(merged, { accounts, categories, settings, requireDate: true });
    await transactionService.updateTransaction(old, normalized.tx);

    const updated = await transactionService.getTransactionById(old.id);
    if (!updated) throw new ApiError(500, 'Transaction was updated but could not be read back.');
    return json({
        transaction: transactionView(
            updated,
            new Map(accounts.map(account => [account.id, account])),
            new Map(categories.map(category => [category.id, category]))
        ),
    });
};

export const deleteTransaction: Handler = async ({ params }) => {
    const transaction = await transactionService.getTransactionById(params.id);
    if (!transaction) throw new ApiError(404, 'Transaction not found.');
    await transactionService.deleteTransaction(transaction);
    return json({ deleted: true, id: params.id });
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface ImportResultItem {
    index: number;
    status: 'valid' | 'invalid' | 'skipped' | 'created';
    error?: string;
    reason?: string;
    externalId?: string;
    id?: string;
    transaction?: Record<string, unknown>;
}

export const importTransactions: Handler = async ({ body }) => {
    const raw = bodyRecord(body);
    const rows = Array.isArray(raw.transactions) ? raw.transactions : null;
    if (!rows) throw new ApiError(400, 'transactions must be an array.');
    if (rows.length === 0) throw new ApiError(400, 'transactions must not be empty.');
    if (rows.length > 2000) throw new ApiError(400, 'A single import is limited to 2000 rows.');

    const dryRun = asBoolean(raw.dryRun);
    const allowPartial = asBoolean(raw.allowPartial);
    const source = asString(raw.source);
    const requestedBatchId = asString(raw.batchId);

    const [accounts, categories, settings, existing] = await Promise.all([
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        settingsService.getSettings(),
        transactionService.getAllTransactions(),
    ]);

    const existingExternalIds = new Set(
        existing.map(tx => tx.externalId).filter((value): value is string => !!value)
    );
    const seenExternalIds = new Set<string>();
    const missingAccounts = new Set<string>();
    const missingCategories = new Set<string>();

    const results: ImportResultItem[] = [];
    const valid: Omit<Transaction, 'id'>[] = [];

    rows.forEach((row, index) => {
        const item = bodyRecord(row);
        const accountRef = asString(item.account) || asString(item.accountId);
        const toAccountRef = asString(item.toAccount) || asString(item.toAccountId);
        const categoryRef = asString(item.category) || asString(item.categoryId);

        // Collect every missing reference up front so the approval list can
        // show them all at once, not just the first failure per row.
        if (accountRef && !findAccount(accounts, item.accountId, item.account)) missingAccounts.add(accountRef);
        if (toAccountRef && !findAccount(accounts, item.toAccountId, item.toAccount)) missingAccounts.add(toAccountRef);
        if (categoryRef && !findCategory(categories, item.categoryId, item.category)) missingCategories.add(categoryRef);

        try {
            const normalized = normalizeTransactionInput(item, {
                accounts,
                categories,
                settings,
                requireDate: true,
            });

            const externalId = normalized.tx.externalId;
            if (externalId && (existingExternalIds.has(externalId) || seenExternalIds.has(externalId))) {
                results.push({ index, status: 'skipped', reason: 'duplicate externalId', externalId });
                return;
            }
            if (externalId) seenExternalIds.add(externalId);

            results.push({
                index,
                status: 'valid',
                externalId: externalId || undefined,
                transaction: {
                    ...normalized.tx,
                    accountName: normalized.accountName,
                    categoryName: normalized.categoryName,
                    toAccountName: normalized.toAccountName,
                } as Record<string, unknown>,
            });
            valid.push(normalized.tx);
        } catch (error) {
            results.push({
                index,
                status: 'invalid',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    const summary = {
        total: rows.length,
        valid: results.filter(result => result.status === 'valid').length,
        skipped: results.filter(result => result.status === 'skipped').length,
        invalid: results.filter(result => result.status === 'invalid').length,
        created: 0,
        missingReferences: missingAccounts.size + missingCategories.size,
    };

    const report = {
        dryRun,
        summary,
        missing: {
            accounts: Array.from(missingAccounts),
            categories: Array.from(missingCategories),
        },
        items: results,
    };

    if (dryRun) return json(report);

    if (summary.invalid > 0 && !allowPartial) {
        return json({
            ...report,
            error: 'Import rejected: fix the invalid rows and retry, or pass allowPartial: true.',
        }, 400);
    }

    if (valid.length === 0) {
        return json({ ...report, batchId: null, created: 0 });
    }

    const safeSource = (source || 'import').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'import';
    const batchId = requestedBatchId || `${safeSource}_${new Date().toISOString()}_${randomId()}`;
    const withBatch = valid.map(tx => ({ ...tx, importBatchId: batchId }));

    const ids = await transactionService.createTransactionsBatch(withBatch);
    summary.created = ids.length;

    let idIndex = 0;
    for (const result of results) {
        if (result.status !== 'valid') continue;
        result.status = 'created';
        result.id = ids[idIndex++];
    }

    return json({
        batchId,
        created: ids.length,
        skipped: summary.skipped,
        failed: 0,
        summary,
        items: results,
    }, 201);
};

export const listImports: Handler = async () => {
    const transactions = await transactionService.getAllTransactions();
    const batches = new Map<string, { batchId: string; count: number; firstDate: string; lastDate: string }>();

    for (const tx of transactions) {
        if (!tx.importBatchId) continue;
        const existing = batches.get(tx.importBatchId);
        if (existing) {
            existing.count++;
            if (tx.date < existing.firstDate) existing.firstDate = tx.date;
            if (tx.date > existing.lastDate) existing.lastDate = tx.date;
        } else {
            batches.set(tx.importBatchId, {
                batchId: tx.importBatchId,
                count: 1,
                firstDate: tx.date,
                lastDate: tx.date,
            });
        }
    }

    return json({
        imports: Array.from(batches.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
    });
};

export const undoImport: Handler = async ({ params }) => {
    const batchId = params.batchId;
    if (!batchId) throw new ApiError(400, 'batchId is required.');

    const transactions = await transactionService.getAllTransactions();
    const batch = transactions.filter(tx => tx.importBatchId === batchId);
    if (batch.length === 0) throw new ApiError(404, 'Import batch not found.');

    await transactionService.deleteTransactionsBatch(batch);
    return json({ deleted: batch.length, batchId });
};

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export const listBudgets: Handler = async () => {
    const budgets = await budgetService.getAllBudgets();
    return json({ budgets });
};

export const createBudget: Handler = async ({ body }) => {
    const [categories, settings, budgets] = await Promise.all([
        categoryService.getAllCategories(),
        settingsService.getSettings(),
        budgetService.getAllBudgets(),
    ]);
    const input = normalizeBudgetInput(bodyRecord(body), categories, settings);

    if (budgets.some(budget => budget.categoryId === input.categoryId)) {
        throw new ApiError(409, 'A budget already exists for that category.');
    }

    const id = await budgetService.addBudget(input);
    return json({ budget: { id, ...input } }, 201);
};

export const updateBudget: Handler = async ({ params, body }) => {
    const budgets = await budgetService.getAllBudgets();
    const budget = budgets.find(item => item.id === params.id);
    if (!budget) throw new ApiError(404, 'Budget not found.');

    const raw = bodyRecord(body);
    const amount = raw.amount === undefined ? budget.amount : asNumber(raw.amount);
    if (amount === null || amount <= 0) throw new ApiError(400, 'amount must be a positive number.');
    const currency = raw.currency === undefined
        ? budget.currency
        : normalizeCurrency(raw.currency, budget.currency);

    await budgetService.updateBudget(params.id, amount, currency);
    return json({ budget: { ...budget, amount, currency } });
};

export const deleteBudget: Handler = async ({ params }) => {
    const budgets = await budgetService.getAllBudgets();
    if (!budgets.some(budget => budget.id === params.id)) {
        throw new ApiError(404, 'Budget not found.');
    }
    await budgetService.deleteBudget(params.id);
    return json({ deleted: true, id: params.id });
};

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

export const listRecurring: Handler = async () => {
    const recurring = await recurringService.getAll();
    return json({ recurring });
};

export const createRecurring: Handler = async ({ body }) => {
    const { accounts, categories, settings } = await loadContext();
    const input = normalizeRecurringInput(bodyRecord(body), { accounts, categories, settings });
    const id = await recurringService.addRule(input);
    return json({ recurring: { id, ...input } }, 201);
};

export const updateRecurring: Handler = async ({ params, body }) => {
    const rules = await recurringService.getAll();
    if (!rules.some(rule => rule.id === params.id)) {
        throw new ApiError(404, 'Recurring rule not found.');
    }
    const raw = bodyRecord(body);
    if (raw.active === undefined) {
        throw new ApiError(400, 'Only the active flag can be updated; delete and recreate to change other fields.');
    }
    const active = asBoolean(raw.active) ? 1 : 0;
    await recurringService.setActive(params.id, active);
    const updated = (await recurringService.getAll()).find(rule => rule.id === params.id);
    return json({ recurring: updated });
};

export const deleteRecurring: Handler = async ({ params }) => {
    const rules = await recurringService.getAll();
    if (!rules.some(rule => rule.id === params.id)) {
        throw new ApiError(404, 'Recurring rule not found.');
    }
    await recurringService.deleteRule(params.id);
    return json({ deleted: true, id: params.id });
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const redactSettings = (settings: UserSettings) => {
    const result: Record<string, unknown> = { ...settings };
    delete result.appPin;
    // Older backups stored these in settings; never expose them over the API.
    delete result.deepSeekApiKey;
    delete result.elevenLabsApiKey;
    result.hasPin = !!settings.appPin;
    return result;
};

export const getSettings: Handler = async () => {
    const settings = await settingsService.getSettings();
    return json({ settings: redactSettings(settings) });
};

export const updateSettings: Handler = async ({ body }) => {
    const raw = bodyRecord(body);

    if (raw.appPin !== undefined || raw.appLockEnabled !== undefined) {
        throw new ApiError(403, 'App lock settings cannot be changed over the API.');
    }

    const patch: Partial<UserSettings> = {};

    if (raw.mainCurrency !== undefined) {
        patch.mainCurrency = normalizeCurrency(raw.mainCurrency, 'PKR');
    }
    if (raw.monthStartDay !== undefined) {
        const day = asNumber(raw.monthStartDay);
        if (day === null || day < 1 || day > 28) throw new ApiError(400, 'monthStartDay must be between 1 and 28.');
        patch.monthStartDay = Math.round(day);
    }
    if (raw.salaryCategoryIds !== undefined) {
        if (!Array.isArray(raw.salaryCategoryIds) || raw.salaryCategoryIds.some(value => typeof value !== 'string')) {
            throw new ApiError(400, 'salaryCategoryIds must be an array of category ids.');
        }
        patch.salaryCategoryIds = (raw.salaryCategoryIds as string[]).filter(Boolean);
    }
    if (raw.useCustomRates !== undefined) {
        patch.useCustomRates = asBoolean(raw.useCustomRates);
    }
    if (raw.customRates !== undefined) {
        const ratesRaw = bodyRecord(raw.customRates);
        const rates: Record<string, number> = {};
        for (const [key, value] of Object.entries(ratesRaw)) {
            const rate = asNumber(value);
            if (rate === null || rate <= 0) {
                throw new ApiError(400, `customRates.${key} must be a positive number.`);
            }
            rates[key] = rate;
        }
        patch.customRates = rates;
    }
    if (raw.theme !== undefined) {
        const theme = asString(raw.theme);
        if (!theme || !['light', 'dark', 'system'].includes(theme)) {
            throw new ApiError(400, 'theme must be light, dark, or system.');
        }
        patch.theme = theme as UserSettings['theme'];
    }
    if (raw.notificationsEnabled !== undefined) {
        patch.notificationsEnabled = asBoolean(raw.notificationsEnabled);
    }
    if (raw.autoBackupEnabled !== undefined) {
        patch.autoBackupEnabled = asBoolean(raw.autoBackupEnabled);
    }
    if (raw.backupFrequency !== undefined) {
        const frequency = asString(raw.backupFrequency);
        if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency)) {
            throw new ApiError(400, 'backupFrequency must be daily, weekly, or monthly.');
        }
        patch.backupFrequency = frequency as UserSettings['backupFrequency'];
    }
    if (raw.backupTime !== undefined) {
        const time = asString(raw.backupTime);
        if (!time || !/^\d{2}:\d{2}$/.test(time)) {
            throw new ApiError(400, 'backupTime must be HH:mm.');
        }
        patch.backupTime = time;
    }

    if (Object.keys(patch).length === 0) {
        throw new ApiError(400, 'No supported settings fields provided.');
    }
    if (raw.appPin !== undefined || raw.appLockEnabled !== undefined) {
        throw new ApiError(403, 'App lock settings cannot be changed over the API.');
    }

    await settingsService.updateSettings(patch);
    const updated = await settingsService.getSettings();
    return json({ settings: redactSettings(updated) });
};

// ---------------------------------------------------------------------------
// Analytics / export
// ---------------------------------------------------------------------------

export const summary: Handler = async ({ query }) => {
    const [transactions, accounts, categories, settings] = await Promise.all([
        transactionService.getAllTransactions(),
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        settingsService.getSettings(),
    ]);

    const currencyRaw = query.get('currency');
    const currency = currencyRaw ? normalizeCurrency(currencyRaw, settings.mainCurrency) : undefined;
    const groupBy = query.get('groupBy') === 'day' ? 'day' : 'month';

    // period=current|previous resolves to a stored pay cycle when one exists.
    let from = query.get('from') || undefined;
    let to = query.get('to') || undefined;
    const periodKey = query.get('period');
    if (periodKey === 'current' || periodKey === 'previous') {
        const period = periodKey === 'current'
            ? await periodService.current()
            : await periodService.previous();
        if (period) {
            from = period.startDate;
            to = period.endDate || undefined;
        }
    }

    return json(analyticsService.summarize({
        transactions,
        accounts,
        categories,
        settings,
        from,
        to,
        currency,
        groupBy,
    }));
};

export const balances: Handler = async ({ query }) => {
    const [accounts, settings] = await Promise.all([
        accountService.getAllAccounts(),
        settingsService.getSettings(),
    ]);
    const currencyRaw = query.get('currency');
    const currency = currencyRaw ? normalizeCurrency(currencyRaw, settings.mainCurrency) : undefined;
    return json(analyticsService.computeBalances(accounts, settings, currency));
};

// ---------------------------------------------------------------------------
// Reconciliation, audit trail, diagnostics
// ---------------------------------------------------------------------------

export const reconcile: Handler = async ({ query }) => {
    const accountId = query.get('accountId');
    if (!accountId) throw new ApiError(400, 'accountId is required.');
    try {
        return json(await reconcileService.getState(accountId));
    } catch (error) {
        throw new ApiError(404, error instanceof Error ? error.message : 'Account not found.');
    }
};

export const listAudit: Handler = async ({ query }) => {
    const limitRaw = Number(query.get('limit') ?? 50);
    const limit = Math.min(Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : 50), 1), 200);
    return json({ entries: await auditService.list(limit) });
};

export const undoAudit: Handler = async ({ params }) => {
    try {
        await auditService.undo(params.id);
        return json({ undone: true, id: params.id });
    } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : 'Could not undo this change.');
    }
};

export const diagnostics: Handler = async () => json(await healthService.runChecks());

// ---------------------------------------------------------------------------
// Pay cycles
// ---------------------------------------------------------------------------

export const listPeriods: Handler = async () => json({ periods: await periodService.summaries() });

export const listPeriodProposals: Handler = async () => json({ proposals: await periodService.proposals() });

export const createPeriod: Handler = async ({ body }) => {
    const raw = bodyRecord(body);
    const startDate = asString(raw.startDate);
    if (!startDate) throw new ApiError(400, 'startDate is required (YYYY-MM-DD).');
    const endDate = raw.endDate === null ? null : asString(raw.endDate);

    try {
        const period = await periodService.create({
            startDate,
            endDate,
            source: 'manual',
            note: asString(raw.note) || undefined,
        });
        return json({ period }, 201);
    } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : 'Could not create the pay cycle.');
    }
};

export const updatePeriod: Handler = async ({ params, body }) => {
    const raw = bodyRecord(body);
    try {
        const period = await periodService.update(params.id, {
            startDate: raw.startDate !== undefined ? asString(raw.startDate) || '' : undefined,
            endDate: raw.endDate === null ? null : raw.endDate !== undefined ? asString(raw.endDate) || '' : undefined,
            note: raw.note !== undefined ? asString(raw.note) || '' : undefined,
        });
        return json({ period });
    } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : 'Could not update the pay cycle.');
    }
};

export const deletePeriod: Handler = async ({ params }) => {
    try {
        await periodService.remove(params.id);
        return json({ deleted: true, id: params.id });
    } catch (error) {
        throw new ApiError(404, error instanceof Error ? error.message : 'Pay cycle not found.');
    }
};

export const applyPeriodProposals: Handler = async ({ body }) => {
    const raw = bodyRecord(body);
    const rows = Array.isArray(raw.periods) ? raw.periods : null;
    if (!rows) throw new ApiError(400, 'periods must be an array.');

    const proposals = rows.map(row => bodyRecord(row))
        .map(row => ({ startDate: asString(row.startDate) || '', endDate: row.endDate === null ? null : asString(row.endDate) }));
    if (proposals.some(proposal => !proposal.startDate)) {
        throw new ApiError(400, 'Every proposal needs a startDate.');
    }

    return json(await periodService.applyProposals(proposals), 201);
};

export const exportData: Handler = async () => {
    const [transactions, accounts, categories, budgets, recurring, settings] = await Promise.all([
        transactionService.getAllTransactions(),
        accountService.getAllAccounts(),
        categoryService.getAllCategories(),
        budgetService.getAllBudgets(),
        recurringService.getAll(),
        settingsService.getSettings(),
    ]);

    return json({
        version: 3,
        timestamp: new Date().toISOString(),
        accounts,
        transactions,
        categories,
        budgets,
        recurring,
        settings: redactSettings(settings),
    });
};
