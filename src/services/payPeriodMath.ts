import { addDays, format, parseISO } from 'date-fns';
import type { Category, PayPeriod, Transaction, UserSettings } from '../types';

export const toDay = (value: string): string => String(value || '').slice(0, 10);

export const isDay = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export const addDaysToDay = (day: string, offset: number): string =>
    format(addDays(parseISO(day), offset), 'yyyy-MM-dd');

export const daysBetween = (from: string, to: string): number =>
    Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const coversDay = (period: Pick<PayPeriod, 'startDate' | 'endDate'>, day: string): boolean =>
    day >= period.startDate && (!period.endDate || day <= period.endDate);

/** The period a transaction belongs to. Late rows after a closed period fall into it too. */
export const findPeriodForDay = (periods: PayPeriod[], day: string): PayPeriod | null => {
    const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const covering = sorted.find(period => coversDay(period, day));
    if (covering) return covering;

    const started = sorted.filter(period => period.startDate <= day);
    return started[started.length - 1] || null;
};

export const currentPeriod = (periods: PayPeriod[], today = toDay(new Date().toISOString())): PayPeriod | null =>
    findPeriodForDay(periods, today);

export const previousPeriod = (periods: PayPeriod[], current: PayPeriod | null): PayPeriod | null => {
    if (!current) return null;
    const earlier = [...periods]
        .filter(period => period.startDate < current.startDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return earlier[earlier.length - 1] || null;
};

const OPEN_END = '9999-12-31';

export const periodsOverlap = (
    candidate: Pick<PayPeriod, 'id' | 'startDate' | 'endDate'>,
    other: Pick<PayPeriod, 'id' | 'startDate' | 'endDate'>
): boolean => {
    if (candidate.id && candidate.id === other.id) return false;
    const candidateEnd = candidate.endDate || OPEN_END;
    const otherEnd = other.endDate || OPEN_END;
    return candidate.startDate <= otherEnd && other.startDate <= candidateEnd;
};

export const findOverlappingPeriod = (
    candidate: Pick<PayPeriod, 'id' | 'startDate' | 'endDate'>,
    periods: PayPeriod[]
): PayPeriod | null => periods.find(period => periodsOverlap(candidate, period)) || null;

export const validatePeriodRange = (startDate: string, endDate?: string | null): string | null => {
    if (!isDay(startDate)) return 'Start date must be a valid date.';
    if (endDate && !isDay(endDate)) return 'End date must be a valid date.';
    if (endDate && endDate < startDate) return 'End date must be on or after the start date.';
    return null;
};

/**
 * Group salary dates into pay events. Credits within `gapDays` of the cluster's
 * first credit belong to the same pay (e.g. Wise on the 28th, Elevate Pay on the 1st).
 */
export const clusterSalaryDays = (days: string[], gapDays = 10): string[][] => {
    const sorted = Array.from(new Set(days.filter(isDay))).sort();
    const clusters: string[][] = [];

    for (const day of sorted) {
        const current = clusters[clusters.length - 1];
        if (!current) {
            clusters.push([day]);
            continue;
        }
        if (daysBetween(current[0], day) <= gapDays) current.push(day);
        else clusters.push([day]);
    }

    return clusters;
};

export interface PeriodProposal {
    startDate: string;
    endDate: string | null;
    salaryDays: string[];
}

export const buildPeriodProposals = (salaryDays: string[], gapDays = 10): PeriodProposal[] => {
    const clusters = clusterSalaryDays(salaryDays, gapDays);
    return clusters.map((cluster, index) => ({
        startDate: cluster[0],
        endDate: index < clusters.length - 1 ? addDaysToDay(clusters[index + 1][0], -1) : null,
        salaryDays: cluster,
    }));
};

const sameYear = (start: string, end: string): boolean => start.slice(0, 4) === end.slice(0, 4);

export const periodLabel = (period: Pick<PayPeriod, 'startDate' | 'endDate'>): string => {
    const nowYear = new Date().getFullYear();
    const start = parseISO(period.startDate);
    const startFormat = start.getFullYear() === nowYear ? 'd MMM' : 'd MMM yyyy';

    if (!period.endDate) return `${format(start, startFormat)} – now`;
    const end = parseISO(period.endDate);
    const endFormat = sameYear(period.startDate, period.endDate)
        ? (end.getFullYear() === nowYear ? 'd MMM' : 'd MMM yyyy')
        : 'd MMM yyyy';
    return `${format(start, startFormat)} – ${format(end, endFormat)}`;
};

/** Which categories count as salary: explicit ids, else income categories named "Salary". */
export const salaryCategoryIds = (categories: Category[], settings: UserSettings | null): Set<string> => {
    const configured = (settings?.salaryCategoryIds || []).filter(Boolean);
    if (configured.length > 0) return new Set(configured);

    return new Set(
        categories
            .filter(category => category.type === 'Income' && /salary/i.test(category.name))
            .map(category => category.id)
    );
};

/** Dates on which salary arrived, given the salary categories. */
export const salaryDaysFor = (
    transactions: Transaction[],
    categories: Category[],
    settings: UserSettings | null
): string[] => {
    const salaryIds = salaryCategoryIds(categories, settings);
    if (salaryIds.size === 0) return [];

    const days = transactions
        .filter(tx => tx.type === 'Income' && tx.categoryId && salaryIds.has(tx.categoryId))
        .map(tx => toDay(tx.date))
        .filter(isDay);

    return Array.from(new Set(days)).sort();
};
