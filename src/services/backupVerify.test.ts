import { describe, expect, it } from 'vitest';
import { verifyBackupData, type BackupData } from './backupVerify';
import type { Account, Category, Transaction } from '../types';

const account: Account = { id: 'a1', name: 'Cash', type: 'Cash', currency: 'PKR', balance: 0, initialBalance: 0 };
const category: Category = { id: 'c1', name: 'Food', type: 'Expense', icon: '🍽️', color: '#000' };
const tx = (patch: Partial<Transaction>): Transaction => ({
    id: 't1',
    amount: 100,
    currency: 'PKR',
    accountId: 'a1',
    categoryId: 'c1',
    date: '2026-11-01T12:00:00.000Z',
    type: 'Expense',
    ...patch,
});

const data = (transactions: Transaction[], accounts: Account[] = [account], categories: Category[] = [category]): BackupData => ({
    version: 4,
    timestamp: '2026-11-22T00:00:00.000Z',
    accounts,
    transactions,
    categories,
    budgets: [],
    recurring: [],
    settings: null,
});

const verify = (overrides: Partial<BackupData> = {}, receiptPaths: Set<string> | null = null) =>
    verifyBackupData({ data: { ...data([tx({})]), ...overrides }, receiptPaths, warnings: [], encrypted: false });

describe('verifyBackupData', () => {
    it('passes a clean backup and reports counts', () => {
        const report = verify();
        expect(report.issues).toEqual([]);
        expect(report.counts.transactions).toBe(1);
        expect(report.counts.accounts).toBe(1);
    });

    it('flags duplicate transaction ids', () => {
        const report = verify({ transactions: [tx({ id: 'dup' }), tx({ id: 'dup' })] });
        expect(report.issues.some(issue => issue.includes('Duplicate transaction id'))).toBe(true);
    });

    it('flags missing account and category references', () => {
        const report = verify({ transactions: [tx({ accountId: 'gone', categoryId: 'gone' })] });
        expect(report.issues.some(issue => issue.includes('missing account'))).toBe(true);
        expect(report.issues.some(issue => issue.includes('missing category'))).toBe(true);
    });

    it('flags a transfer to the same account and non-positive amounts', () => {
        const report = verify({ transactions: [tx({ type: 'Transfer', toAccountId: 'a1', amount: 0 })] });
        expect(report.issues.some(issue => issue.includes('same source and destination'))).toBe(true);
        expect(report.issues.some(issue => issue.includes('non-positive amount'))).toBe(true);
    });

    it('warns about a missing receipt instead of blocking', () => {
        const report = verify({ transactions: [tx({ receiptPath: 'receipts/missing.jpg' })] }, new Set());
        expect(report.issues).toEqual([]);
        expect(report.warnings.some(warning => warning.includes('Receipt missing'))).toBe(true);
    });

    it('flags a budget for a missing category', () => {
        const report = verify({
            budgets: [{ id: 'b1', categoryId: 'gone', amount: 1000, currency: 'PKR', period: 'monthly' }],
        });
        expect(report.issues.some(issue => issue.includes('Budget b1'))).toBe(true);
    });
});
