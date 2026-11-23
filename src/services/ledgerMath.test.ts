import { describe, expect, it } from 'vitest';
import { accountDeltas, computeAmounts } from './ledgerMath';
import type { Account, Transaction, UserSettings } from '../types';

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

const cash: Account = { id: 'cash', name: 'Cash', type: 'Cash', currency: 'PKR', balance: 0, initialBalance: 0 };
const bank: Account = { id: 'bank', name: 'Bank', type: 'Bank', currency: 'PKR', balance: 0, initialBalance: 0 };
const usd: Account = { id: 'usd', name: 'USD', type: 'Bank', currency: 'USD', balance: 0, initialBalance: 0 };
const accounts = [cash, bank, usd];

const tx = (patch: Partial<Transaction>): Transaction => ({
    id: 't',
    amount: 100,
    currency: 'PKR',
    accountId: 'cash',
    date: '2026-11-01T12:00:00.000Z',
    type: 'Expense',
    ...patch,
});

describe('computeAmounts', () => {
    it('freezes the account, base and fx values at write time', () => {
        const amounts = computeAmounts({ amount: 100, currency: 'USD', type: 'Expense' }, cash, null, settings);
        expect(amounts.accountAmount).toBeCloseTo(27850, 6);
        expect(amounts.baseAmount).toBeCloseTo(27850, 6);
        expect(amounts.baseCurrency).toBe('PKR');
        expect(amounts.fxRate).toBeCloseTo(278.5, 6);
        expect(amounts.toAccountAmount).toBeUndefined();
    });

    it('freezes both legs of a cross-currency transfer', () => {
        const amounts = computeAmounts({ amount: 100, currency: 'USD', type: 'Transfer' }, cash, usd, settings);
        expect(amounts.accountAmount).toBeCloseTo(27850, 6);
        expect(amounts.toAccountAmount).toBeCloseTo(100, 6);
    });

    it('converts the fee into the account currency', () => {
        const amounts = computeAmounts({ amount: 100, currency: 'USD', type: 'Expense', fee: 1 }, cash, null, settings);
        expect(amounts.accountFee).toBeCloseTo(278.5, 6);
    });
});

describe('accountDeltas', () => {
    it('applies income, expense, fees and both transfer legs', () => {
        const deltas = accountDeltas(
            [
                tx({ id: 'expense', amount: 100 }),
                tx({ id: 'income', type: 'Income', amount: 500, accountId: 'bank', fee: 10 }),
                tx({ id: 'transfer', type: 'Transfer', amount: 50, currency: 'USD', accountId: 'usd', toAccountId: 'bank' }),
            ],
            accounts,
            settings
        );

        expect(deltas.get('cash')).toBeCloseTo(-100, 6);
        expect(deltas.get('bank')).toBeCloseTo(490 + 13925, 6);
        expect(deltas.get('usd')).toBeCloseTo(-50, 6);
    });

    it('nets to zero when a row is added and removed', () => {
        const row = tx({ id: 'row', amount: 250 });
        const added = accountDeltas([row], accounts, settings);
        const removed = accountDeltas([row], accounts, { ...settings, mainCurrency: 'PKR' });
        const combined = new Map<string, number>();
        for (const [id, value] of added) combined.set(id, (combined.get(id) || 0) + value);
        for (const [id, value] of removed) combined.set(id, (combined.get(id) || 0) - value);
        for (const value of combined.values()) expect(value).toBeCloseTo(0, 8);
    });

    it('uses frozen amounts, so changing rates later cannot rewrite history', () => {
        const frozen = tx({
            id: 'frozen',
            amount: 100,
            currency: 'USD',
            accountAmount: 27850,
            accountFee: 0,
            baseAmount: 27850,
            baseCurrency: 'PKR',
            fxRate: 278.5,
        });

        const before = accountDeltas([frozen], accounts, settings);
        const afterRateChange = accountDeltas([frozen], accounts, {
            ...settings,
            useCustomRates: true,
            customRates: { USD: 500 },
        });

        expect(before.get('cash')).toBeCloseTo(-27850, 6);
        expect(afterRateChange.get('cash')).toBeCloseTo(-27850, 6);
    });

    it('falls back to live conversion for legacy rows without frozen values', () => {
        const legacy = tx({ id: 'legacy', amount: 100, currency: 'USD' });
        const deltas = accountDeltas([legacy], accounts, {
            ...settings,
            useCustomRates: true,
            customRates: { USD: 300 },
        });
        expect(deltas.get('cash')).toBeCloseTo(-30000, 6);
    });
});
