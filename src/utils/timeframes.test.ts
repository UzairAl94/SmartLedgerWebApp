import { describe, expect, it } from 'vitest';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { describeRange, DEFAULT_TIMEFRAME, isWithinTimeframe, timeframeBounds } from './timeframes';
import { parseISO } from 'date-fns';

const now = new Date();

describe('timeframeBounds', () => {
    it('defaults to this month', () => {
        expect(DEFAULT_TIMEFRAME).toBe('thisMonth');
    });

    it('spans the current calendar month', () => {
        const { start, end, periodType } = timeframeBounds('thisMonth');
        expect(start.getTime()).toBe(startOfMonth(now).getTime());
        expect(end.getTime()).toBe(endOfMonth(now).getTime());
        expect(periodType).toBe('daily');
    });

    it('spans the previous calendar month', () => {
        const lastMonth = subMonths(now, 1);
        const { start, end } = timeframeBounds('lastMonth');
        expect(start.getTime()).toBe(startOfMonth(lastMonth).getTime());
        expect(end.getTime()).toBe(endOfMonth(lastMonth).getTime());
    });

    it('uses monthly periods for multi-month ranges', () => {
        expect(timeframeBounds('6Months').periodType).toBe('monthly');
        expect(timeframeBounds('Year').periodType).toBe('monthly');
        expect(timeframeBounds('Year').start.getTime()).toBe(startOfYear(now).getTime());
        expect(timeframeBounds('Year').end.getTime()).toBe(endOfYear(now).getTime());
    });
});

describe('describeRange', () => {
    it('shows inclusive start, end and day count', () => {
        expect(describeRange(parseISO('2026-08-29T00:00:00'), parseISO('2026-09-28T00:00:00'))).toBe('29 Aug – 28 Sep · 31 days');
    });

    it('includes years when the range crosses one', () => {
        expect(describeRange(parseISO('2025-12-28T00:00:00'), parseISO('2026-01-27T00:00:00'))).toContain('2025');
    });

    it('handles a single day', () => {
        expect(describeRange(parseISO('2026-11-01T00:00:00'), parseISO('2026-11-01T00:00:00'))).toContain('1 day');
    });
});

describe('isWithinTimeframe', () => {
    it('accepts a date inside the current month and rejects one outside it', () => {
        const inside = new Date(now.getFullYear(), now.getMonth(), 2, 12).toISOString();
        const outside = new Date(now.getFullYear(), now.getMonth() - 2, 15, 12).toISOString();
        expect(isWithinTimeframe(inside, 'thisMonth')).toBe(true);
        expect(isWithinTimeframe(outside, 'thisMonth')).toBe(false);
    });

    it('rejects invalid dates without throwing', () => {
        expect(isWithinTimeframe('not-a-date', 'thisMonth')).toBe(false);
    });
});
