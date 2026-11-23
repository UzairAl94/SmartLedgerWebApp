import { describe, expect, it } from 'vitest';
import { normalizeAccountInput, normalizeTransactionInput } from './validate';
import type { Account, Category, UserSettings } from '../../types';

const settings: UserSettings = {
    mainCurrency: 'PKR',
    monthStartDay: 1,
    useCustomRates: false,
    customRates: {},
    appLockEnabled: false,
    theme: 'system',
    notificationsEnabled: false,
    autoBackupEnabled: false,
    backupFrequency: 'weekly',
    backupTime: '09:00',
    apiServerPort: 8765,
    apiServerAllowLan: true,
};

const accounts: Account[] = [
    { id: 'a-cash', name: 'Cash', type: 'Cash', currency: 'PKR', balance: 0, initialBalance: 0 },
    { id: 'a-usd', name: 'USD Savings', type: 'Bank', currency: 'USD', balance: 0, initialBalance: 0 },
];

const categories: Category[] = [
    { id: 'c-groceries', name: 'Groceries', type: 'Expense', icon: '🛒', color: '#000' },
    { id: 'c-salary', name: 'Salary', type: 'Income', icon: '💼', color: '#000' },
];

const context = { accounts, categories, settings };

describe('normalizeTransactionInput', () => {
    it('resolves account and category by case-insensitive name', () => {
        const { tx } = normalizeTransactionInput(
            { date: '2026-11-01', type: 'expense', amount: 1250.5, account: 'cash', category: 'groceries' },
            context
        );
        expect(tx.accountId).toBe('a-cash');
        expect(tx.categoryId).toBe('c-groceries');
        expect(tx.currency).toBe('PKR');
    });

    it('anchors date-only values at noon UTC', () => {
        const { tx } = normalizeTransactionInput(
            { date: '2026-11-01', type: 'expense', amount: 10, account: 'Cash', category: 'Groceries' },
            context
        );
        expect(tx.date).toBe('2026-11-01T12:00:00.000Z');
    });

    it('rejects a missing account', () => {
        expect(() =>
            normalizeTransactionInput(
                { date: '2026-11-01', type: 'expense', amount: 10, account: 'Nope', category: 'Groceries' },
                context
            )
        ).toThrow(/Account not found/);
    });

    it('rejects a category of the wrong type', () => {
        expect(() =>
            normalizeTransactionInput(
                { date: '2026-11-01', type: 'expense', amount: 10, account: 'Cash', category: 'Salary' },
                context
            )
        ).toThrow(/not Expense/);
    });

    it('requires a distinct destination for transfers', () => {
        expect(() =>
            normalizeTransactionInput(
                { date: '2026-11-01', type: 'transfer', amount: 10, account: 'Cash' },
                context
            )
        ).toThrow(/Destination account not found/);

        expect(() =>
            normalizeTransactionInput(
                { date: '2026-11-01', type: 'transfer', amount: 10, account: 'Cash', toAccount: 'Cash' },
                context
            )
        ).toThrow(/must be different/);
    });

    it('rejects non-positive amounts', () => {
        expect(() =>
            normalizeTransactionInput(
                { date: '2026-11-01', type: 'expense', amount: 0, account: 'Cash', category: 'Groceries' },
                context
            )
        ).toThrow(/positive number/);
    });

    it('rejects an over-long externalId', () => {
        expect(() =>
            normalizeTransactionInput(
                {
                    date: '2026-11-01',
                    type: 'expense',
                    amount: 10,
                    account: 'Cash',
                    category: 'Groceries',
                    externalId: 'x'.repeat(201),
                },
                context
            )
        ).toThrow(/200 characters/);
    });

    it('defaults the currency to the account currency', () => {
        const { tx } = normalizeTransactionInput(
            { date: '2026-11-01', type: 'expense', amount: 10, account: 'USD Savings', category: 'Groceries' },
            context
        );
        expect(tx.currency).toBe('USD');
    });
});

describe('normalizeAccountInput', () => {
    it('defaults type to Bank and currency to the main currency', () => {
        const input = normalizeAccountInput({ name: 'Wallet' }, settings);
        expect(input.type).toBe('Bank');
        expect(input.currency).toBe('PKR');
        expect(input.initialBalance).toBe(0);
    });

    it('requires a name', () => {
        expect(() => normalizeAccountInput({ name: '   ' }, settings)).toThrow(/name is required/);
    });
});
