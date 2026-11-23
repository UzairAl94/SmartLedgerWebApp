import type { Account, Category, Currency, Transaction, UserSettings } from '../types';
import { convert } from '../utils/money';

export interface SummaryOptions {
    transactions: Transaction[];
    categories: Category[];
    accounts: Account[];
    settings: UserSettings;
    from?: string;
    to?: string;
    currency?: Currency;
    groupBy?: 'month' | 'day';
}

export interface Summary {
    range: { from: string | null; to: string | null };
    currency: Currency;
    totals: { income: number; expense: number; net: number; fees: number; count: number };
    byCategory: Array<{
        categoryId: string | null;
        name: string;
        type: 'Income' | 'Expense';
        total: number;
        count: number;
    }>;
    byAccount: Array<{
        accountId: string;
        name: string;
        income: number;
        expense: number;
        net: number;
    }>;
    byPeriod: Array<{ period: string; income: number; expense: number; net: number }>;
}

const parseBoundary = (value: string | undefined, end: boolean): number | null => {
    if (!value) return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const iso = dateOnly ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}` : value;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
};

export const analyticsService = {
    summarize({
        transactions,
        categories,
        accounts,
        settings,
        from,
        to,
        currency,
        groupBy = 'month',
    }: SummaryOptions): Summary {
        const targetCurrency: Currency = currency || settings.mainCurrency;
        const fromMs = parseBoundary(from, false);
        const toMs = parseBoundary(to, true);

        const categoryById = new Map(categories.map(c => [c.id, c]));
        const accountById = new Map(accounts.map(a => [a.id, a]));

        const byCategory = new Map<string, { name: string; type: 'Income' | 'Expense'; total: number; count: number }>();
        const byAccount = new Map<string, { income: number; expense: number }>();
        const byPeriod = new Map<string, { income: number; expense: number }>();

        let income = 0;
        let expense = 0;
        let fees = 0;
        let count = 0;

        for (const tx of transactions) {
            const ms = Date.parse(tx.date);
            if (Number.isNaN(ms)) continue;
            if (fromMs !== null && ms < fromMs) continue;
            if (toMs !== null && ms > toMs) continue;

            count++;

            // Prefer the frozen base amount so historical reports don't move when
            // the user changes an exchange rate.
            const amount = tx.baseAmount !== undefined && tx.baseAmount !== null && tx.baseCurrency
                ? convert(tx.baseAmount, tx.baseCurrency, targetCurrency, settings)
                : convert(tx.amount, tx.currency, targetCurrency, settings);
            const fee = tx.fee ? convert(tx.fee, tx.currency, targetCurrency, settings) : 0;
            fees += fee;

            if (tx.type !== 'Income' && tx.type !== 'Expense') continue;

            const isIncome = tx.type === 'Income';
            if (isIncome) income += amount;
            else expense += amount;

            const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
            const categoryKey = tx.categoryId || '__uncategorized__';
            const existingCategory = byCategory.get(categoryKey);
            if (existingCategory) {
                existingCategory.total += amount;
                existingCategory.count++;
            } else {
                byCategory.set(categoryKey, {
                    name: category?.name || 'Uncategorized',
                    type: tx.type,
                    total: amount,
                    count: 1,
                });
            }

            const accountKey = tx.accountId;
            const existingAccount = byAccount.get(accountKey);
            if (existingAccount) {
                if (isIncome) existingAccount.income += amount;
                else existingAccount.expense += amount;
            } else {
                byAccount.set(accountKey, {
                    income: isIncome ? amount : 0,
                    expense: isIncome ? 0 : amount,
                });
            }

            const period = groupBy === 'day' ? tx.date.slice(0, 10) : tx.date.slice(0, 7);
            const existingPeriod = byPeriod.get(period);
            if (existingPeriod) {
                if (isIncome) existingPeriod.income += amount;
                else existingPeriod.expense += amount;
            } else {
                byPeriod.set(period, {
                    income: isIncome ? amount : 0,
                    expense: isIncome ? 0 : amount,
                });
            }
        }

        return {
            range: { from: from || null, to: to || null },
            currency: targetCurrency,
            totals: {
                income,
                expense,
                net: income - expense,
                fees,
                count,
            },
            byCategory: Array.from(byCategory.entries())
                .map(([categoryId, value]) => ({
                    categoryId: categoryId === '__uncategorized__' ? null : categoryId,
                    name: value.name,
                    type: value.type,
                    total: value.total,
                    count: value.count,
                }))
                .sort((a, b) => b.total - a.total),
            byAccount: Array.from(byAccount.entries())
                .map(([accountId, value]) => ({
                    accountId,
                    name: accountById.get(accountId)?.name || 'Unknown account',
                    income: value.income,
                    expense: value.expense,
                    net: value.income - value.expense,
                }))
                .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
            byPeriod: Array.from(byPeriod.entries())
                .map(([period, value]) => ({
                    period,
                    income: value.income,
                    expense: value.expense,
                    net: value.income - value.expense,
                }))
                .sort((a, b) => a.period.localeCompare(b.period)),
        };
    },

    computeBalances(accounts: Account[], settings: UserSettings, currency?: Currency) {
        const targetCurrency: Currency = currency || settings.mainCurrency;
        const rows = accounts.map(account => ({
            id: account.id,
            name: account.name,
            currency: account.currency,
            balance: account.balance,
            balanceConverted: convert(
                account.balance,
                account.currency,
                targetCurrency,
                settings
            ),
        }));

        return {
            currency: targetCurrency,
            netWorth: rows.reduce((sum, row) => sum + row.balanceConverted, 0),
            accounts: rows,
        };
    },
};
