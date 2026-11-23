import {
    subDays,
    startOfMonth,
    endOfMonth,
    subMonths,
    startOfYear,
    endOfYear,
    startOfDay,
    endOfDay,
} from 'date-fns';

export type Timeframe = '7days' | '30days' | 'thisMonth' | 'lastMonth' | '6Months' | 'Year';
export type TimeframePeriod = 'daily' | 'monthly';

export const TIMEFRAME_OPTIONS: Array<{ value: Timeframe; label: string }> = [
    { value: '7days', label: 'Last 7 Days' },
    { value: '30days', label: 'Last 30 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: '6Months', label: 'Last 6 Months' },
    { value: 'Year', label: 'This Year' },
];

export const DEFAULT_TIMEFRAME: Timeframe = 'thisMonth';

export const timeframeBounds = (range: Timeframe): { start: Date; end: Date; periodType: TimeframePeriod } => {
    const now = new Date();

    switch (range) {
        case '7days':
            return { start: subDays(now, 6), end: now, periodType: 'daily' };
        case '30days':
            return { start: subDays(now, 29), end: now, periodType: 'daily' };
        case 'thisMonth':
            return { start: startOfMonth(now), end: endOfMonth(now), periodType: 'daily' };
        case 'lastMonth': {
            const lastMonth = subMonths(now, 1);
            return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth), periodType: 'daily' };
        }
        case '6Months':
            return { start: subMonths(now, 5), end: endOfMonth(now), periodType: 'monthly' };
        case 'Year':
            return { start: startOfYear(now), end: endOfYear(now), periodType: 'monthly' };
    }
};

export const isWithinTimeframe = (iso: string, range: Timeframe): boolean => {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return false;

    const { start, end } = timeframeBounds(range);
    return ms >= startOfDay(start).getTime() && ms <= endOfDay(end).getTime();
};
