import { describe, expect, it } from 'vitest';
import { analyzeLedger } from './healthCheck';
import type { Account, Category, Transaction } from '../types';

const account = (patch: Partial<Account> = {}): Account => ({
    id: 'a1', name: 'Cash', type: 'Cash', currency: 'PKR', balance: 0, initialBalance: 0, ...patch,
});
const category: Category = { id: 'c1', name: 'Food', type: 'Expense', icon: '🍽️', color: '#000' };
const tx = (patch: Partial<Transaction> = {}): Transaction => ({
    id: 't1', amount: 100, currency: 'PKR', accountId: 'a1', categoryId: 'c1',
    date: '2026-11-01T12:00:00.000Z', type: 'Expense', ...patch,
});

const run = (overrides: Partial<Parameters<typeof analyzeLedger>[0]> = {}) =>
    analyzeLedger({
        accounts: [account()],
        categories: [category],
        transactions: [tx()],
        budgets: [],
        expectedBalances: new Map([['a1', 0]]),
        ...overrides,
    });

describe('data health checks', () => {
    it('reports a clean ledger with no issues', () => {
        expect(run().issues).toEqual([]);
    });

    it('flags balance drift beyond a cent', () => {
        const report = run({ expectedBalances: new Map([['a1', -100]]) });
        expect(report.issues.some(issue => issue.code === 'balance-drift')).toBe(true);
    });

    it('flags duplicate candidates by date, amount and account', () => {
        const report = run({ transactions: [tx({ id: 't1' }), tx({ id: 't2' })] });
        expect(report.issues.some(issue => issue.code === 'possible-duplicate')).toBe(true);
    });

    it('flags duplicate external ids as errors', () => {
        const report = run({ transactions: [tx({ id: 't1', externalId: 'x' }), tx({ id: 't2', externalId: 'x' })] });
        expect(report.issues.some(issue => issue.code === 'duplicate-external-id')).toBe(true);
    });

    it('flags missing references and bad transfers', () => {
        const report = run({
            transactions: [tx({ accountId: 'gone', categoryId: 'gone' }), tx({ id: 't2', type: 'Transfer', toAccountId: 'a1' })],
        });
        const codes = report.issues.map(issue => issue.code);
        expect(codes).toContain('missing-account');
        expect(codes).toContain('missing-category');
        expect(codes).toContain('transfer-self');
    });

    it('flags future dates and non-positive amounts', () => {
        const report = run({
            transactions: [tx({ id: 'future', date: '2999-01-01T12:00:00.000Z' }), tx({ id: 'zero', amount: 0 })],
        });
        const codes = report.issues.map(issue => issue.code);
        expect(codes).toContain('future-date');
        expect(codes).toContain('bad-amount');
    });

    it('flags budgets pointing at missing categories', () => {
        const report = run({ budgets: [{ id: 'b1', categoryId: 'gone', amount: 100, currency: 'PKR', period: 'monthly' }] });
        expect(report.issues.some(issue => issue.code === 'budget-missing-category')).toBe(true);
    });
});
