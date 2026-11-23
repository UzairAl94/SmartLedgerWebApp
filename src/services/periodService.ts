import { sqliteService } from './sqliteService';
import { categoryService } from './categoryService';
import { transactionService } from './transactionService';
import { settingsService } from './settingsService';
import { convert } from '../utils/money';
import {
    buildPeriodProposals,
    coversDay,
    currentPeriod,
    findOverlappingPeriod,
    periodLabel,
    previousPeriod,
    salaryCategoryIds,
    salaryDaysFor,
    toDay,
    validatePeriodRange,
    type PeriodProposal,
} from './payPeriodMath';
import type { PayPeriod } from '../types';

export interface PeriodSummary extends PayPeriod {
    label: string;
    isCurrent: boolean;
    transactionCount: number;
    income: number;
    expense: number;
    salaryTotal: number;
    salaryCount: number;
}

export interface PeriodInput {
    startDate: string;
    endDate?: string | null;
    source?: 'detected' | 'manual';
    note?: string;
}

const parsePeriod = (row: Record<string, unknown>): PayPeriod => ({
    id: String(row.id),
    startDate: toDay(String(row.startDate)),
    endDate: row.endDate ? toDay(String(row.endDate)) : null,
    source: row.source === 'detected' ? 'detected' : 'manual',
    note: row.note ? String(row.note) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
});

export const periodService = {
    async list(): Promise<PayPeriod[]> {
        const result = await sqliteService.query('SELECT * FROM pay_periods ORDER BY startDate ASC');
        return (result.values || []).map(row => parsePeriod(row as Record<string, unknown>));
    },

    async create(input: PeriodInput): Promise<PayPeriod> {
        const startDate = toDay(input.startDate);
        const endDate = input.endDate ? toDay(input.endDate) : null;
        const error = validatePeriodRange(startDate, endDate);
        if (error) throw new Error(error);

        const existing = await periodService.list();
        const overlap = findOverlappingPeriod({ id: '', startDate, endDate }, existing);
        if (overlap) throw new Error(`This cycle overlaps ${periodLabel(overlap)}.`);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await sqliteService.execute(
            `INSERT INTO pay_periods (id, startDate, endDate, source, note, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, startDate, endDate, input.source || 'manual', input.note || null, now, now]
        );
        return { id, startDate, endDate, source: input.source || 'manual', note: input.note, createdAt: now, updatedAt: now };
    },

    async update(id: string, patch: { startDate?: string; endDate?: string | null; note?: string }): Promise<PayPeriod> {
        const existing = await periodService.list();
        const current = existing.find(period => period.id === id);
        if (!current) throw new Error('Pay cycle not found.');

        const startDate = patch.startDate ? toDay(patch.startDate) : current.startDate;
        const endDate = patch.endDate === undefined
            ? current.endDate ?? null
            : patch.endDate === null
                ? null
                : toDay(patch.endDate);

        const error = validatePeriodRange(startDate, endDate);
        if (error) throw new Error(error);

        const overlap = findOverlappingPeriod({ id, startDate, endDate }, existing);
        if (overlap) throw new Error(`This cycle would overlap ${periodLabel(overlap)}.`);

        const updatedAt = new Date().toISOString();
        await sqliteService.execute(
            'UPDATE pay_periods SET startDate = ?, endDate = ?, note = ?, updatedAt = ? WHERE id = ?',
            [startDate, endDate, patch.note ?? current.note ?? null, updatedAt, id]
        );
        return { ...current, startDate, endDate, note: patch.note ?? current.note, updatedAt };
    },

    async remove(id: string): Promise<void> {
        const existing = await periodService.list();
        if (!existing.some(period => period.id === id)) throw new Error('Pay cycle not found.');
        await sqliteService.execute('DELETE FROM pay_periods WHERE id = ?', [id]);
    },

    /** Salary-derived cycle proposals that do not overlap a stored cycle. */
    async proposals(): Promise<PeriodProposal[]> {
        const [transactions, categories, settings, existing] = await Promise.all([
            transactionService.getAllTransactions(),
            categoryService.getAllCategories(),
            settingsService.getSettings(),
            periodService.list(),
        ]);

        const days = salaryDaysFor(transactions, categories, settings);
        return buildPeriodProposals(days).filter(proposal =>
            !findOverlappingPeriod({ id: '', startDate: proposal.startDate, endDate: proposal.endDate }, existing)
        );
    },

    async applyProposals(proposals: Array<{ startDate: string; endDate?: string | null }>): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;

        for (const proposal of proposals) {
            try {
                await periodService.create({
                    startDate: proposal.startDate,
                    endDate: proposal.endDate ?? null,
                    source: 'detected',
                });
                created++;
            } catch {
                skipped++;
            }
        }

        return { created, skipped };
    },

    async summaries(): Promise<PeriodSummary[]> {
        const [periods, transactions, categories, settings] = await Promise.all([
            periodService.list(),
            transactionService.getAllTransactions(),
            categoryService.getAllCategories(),
            settingsService.getSettings(),
        ]);

        const salaryIds = salaryCategoryIds(categories, settings);
        const today = toDay(new Date().toISOString());
        const current = currentPeriod(periods, today);

        return periods.map(period => {
            const rows = transactions.filter(tx => coversDay(period, toDay(tx.date)));
            let income = 0;
            let expense = 0;
            let salaryTotal = 0;
            let salaryCount = 0;

            for (const tx of rows) {
                if (tx.type === 'Income') income += convert(tx.amount, tx.currency, settings.mainCurrency, settings);
                if (tx.type === 'Expense') expense += convert(tx.amount, tx.currency, settings.mainCurrency, settings);
                if (tx.type === 'Income' && tx.categoryId && salaryIds.has(tx.categoryId)) {
                    salaryTotal += convert(tx.amount, tx.currency, settings.mainCurrency, settings);
                    salaryCount++;
                }
            }

            return {
                ...period,
                label: periodLabel(period),
                isCurrent: current?.id === period.id,
                transactionCount: rows.length,
                income,
                expense,
                salaryTotal,
                salaryCount,
            };
        });
    },

    async current(): Promise<PayPeriod | null> {
        return currentPeriod(await periodService.list());
    },

    async previous(): Promise<PayPeriod | null> {
        const periods = await periodService.list();
        return previousPeriod(periods, currentPeriod(periods));
    },
};
