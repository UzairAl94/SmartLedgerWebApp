import { describe, expect, it } from 'vitest';
import {
    addDaysToDay,
    buildPeriodProposals,
    clusterSalaryDays,
    coversDay,
    currentPeriod,
    findOverlappingPeriod,
    findPeriodForDay,
    periodLabel,
    previousPeriod,
    salaryDaysFor,
    validatePeriodRange,
} from './payPeriodMath';
import type { Category, PayPeriod, Transaction, UserSettings } from '../types';

const period = (id: string, startDate: string, endDate: string | null): PayPeriod => ({ id, startDate, endDate, source: 'manual' });

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

const category = (id: string, name: string, type: 'Income' | 'Expense'): Category => ({ id, name, type, icon: '', color: '#000' });
const tx = (id: string, date: string, categoryId: string): Transaction => ({
    id, amount: 100, currency: 'PKR', accountId: 'a1', categoryId, date, type: 'Income',
});

describe('period boundaries from salary dates', () => {
    it('starts a cycle at each salary event and ends the day before the next', () => {
        const proposals = buildPeriodProposals(['2026-08-27', '2026-09-29']);
        expect(proposals).toEqual([
            { startDate: '2026-08-27', endDate: '2026-09-28', salaryDays: ['2026-08-27'] },
            { startDate: '2026-09-29', endDate: null, salaryDays: ['2026-09-29'] },
        ]);
    });

    it('keeps split pay within 10 days in one cycle', () => {
        const clusters = clusterSalaryDays(['2026-08-28', '2026-09-01', '2026-09-29']);
        expect(clusters).toEqual([['2026-08-28', '2026-09-01'], ['2026-09-29']]);
    });

    it('opens a new cycle when the gap exceeds 10 days', () => {
        expect(clusterSalaryDays(['2026-08-28', '2026-09-08'])).toEqual([['2026-08-28'], ['2026-09-08']]);
    });

    it('subtracts a day for the previous cycle end', () => {
        expect(addDaysToDay('2026-10-01', -1)).toBe('2026-09-30');
    });
});

describe('assigning days to periods', () => {
    const periods = [period('p1', '2026-08-27', '2026-09-28'), period('p2', '2026-09-29', null)];

    it('covers inclusive start and end dates', () => {
        expect(coversDay(periods[0], '2026-08-27')).toBe(true);
        expect(coversDay(periods[0], '2026-09-28')).toBe(true);
        expect(coversDay(periods[0], '2026-09-29')).toBe(false);
    });

    it('finds the period containing a day', () => {
        expect(findPeriodForDay(periods, '2026-09-03')?.id).toBe('p1');
        expect(findPeriodForDay(periods, '2026-10-02')?.id).toBe('p2');
    });

    it('resolves the current and previous periods', () => {
        expect(currentPeriod(periods, '2026-10-02')?.id).toBe('p2');
        expect(previousPeriod(periods, periods[1])?.id).toBe('p1');
    });
});

describe('validation', () => {
    it('rejects inverted ranges and bad dates', () => {
        expect(validatePeriodRange('2026-09-01', '2026-08-31')).toMatch(/on or after/);
        expect(validatePeriodRange('nope')).toMatch(/valid date/);
        expect(validatePeriodRange('2026-09-01', '2026-09-30')).toBeNull();
    });

    it('detects overlaps, including open-ended periods', () => {
        const existing = [period('p1', '2026-08-27', '2026-09-28')];
        expect(findOverlappingPeriod({ id: 'new', startDate: '2026-09-28', endDate: '2026-10-27' }, existing)?.id).toBe('p1');
        expect(findOverlappingPeriod({ id: 'new', startDate: '2026-09-29', endDate: null }, existing)).toBeNull();
    });

    it('ignores the period being edited', () => {
        const existing = [period('p1', '2026-08-27', '2026-09-28')];
        expect(findOverlappingPeriod({ id: 'p1', startDate: '2026-08-28', endDate: '2026-09-28' }, existing)).toBeNull();
    });
});

describe('salary detection', () => {
    const categories = [category('c-salary', 'Salary', 'Income'), category('c-free', 'Freelance', 'Income')];
    const transactions = [
        tx('t1', '2026-08-27T12:00:00.000Z', 'c-salary'),
        tx('t2', '2026-08-28T12:00:00.000Z', 'c-salary'),
        tx('t3', '2026-08-30T12:00:00.000Z', 'c-free'),
        tx('t4', '2026-09-29T12:00:00.000Z', 'c-salary'),
    ];

    it('uses income categories named Salary by default', () => {
        expect(salaryDaysFor(transactions, categories, settings)).toEqual(['2026-08-27', '2026-08-28', '2026-09-29']);
    });

    it('honours an explicit salary category list', () => {
        expect(salaryDaysFor(transactions, categories, { ...settings, salaryCategoryIds: ['c-free'] })).toEqual(['2026-08-30']);
    });

    it('labels a closed and an open period', () => {
        expect(periodLabel(period('p1', '2026-08-27', '2026-09-28'))).toContain('27 Aug');
        expect(periodLabel(period('p2', '2026-09-29', null))).toContain('now');
    });
});
