import { describe, expect, it } from 'vitest';
import { convert, DEFAULT_RATES, resolveRates, rateBetween } from './money';

describe('resolveRates', () => {
    it('returns the defaults when custom rates are disabled', () => {
        expect(resolveRates({ useCustomRates: false, customRates: { USD: 999 } })).toEqual(DEFAULT_RATES);
    });

    it('merges valid custom rates when enabled and ignores invalid values', () => {
        const rates = resolveRates({ useCustomRates: true, customRates: { USD: 300, AED: -5, MYR: 'abc' as unknown as number } });
        expect(rates.USD).toBe(300);
        expect(rates.AED).toBe(DEFAULT_RATES.AED);
        expect(rates.MYR).toBe(DEFAULT_RATES.MYR);
    });
});

describe('convert', () => {
    it('is the identity for the same currency', () => {
        expect(convert(123.45, 'PKR', 'PKR')).toBe(123.45);
        expect(convert(10, 'USD', 'USD', { useCustomRates: true, customRates: { USD: 300 } })).toBe(10);
    });

    it('uses default rates pivoted through PKR', () => {
        expect(convert(100, 'USD', 'PKR')).toBeCloseTo(27850, 6);
        expect(convert(27850, 'PKR', 'USD')).toBeCloseTo(100, 6);
        expect(convert(1, 'USD', 'AED')).toBeCloseTo(DEFAULT_RATES.USD / DEFAULT_RATES.AED, 8);
    });

    it('applies custom rates only when enabled', () => {
        const custom = { useCustomRates: true, customRates: { USD: 300 } };
        expect(convert(10, 'USD', 'PKR', custom)).toBeCloseTo(3000, 6);

        const disabled = { useCustomRates: false, customRates: { USD: 300 } };
        expect(convert(10, 'USD', 'PKR', disabled)).toBeCloseTo(2785, 6);
    });

    it('knows every supported currency', () => {
        for (const code of ['PKR', 'USD', 'AED', 'MYR']) {
            expect(DEFAULT_RATES[code]).toBeGreaterThan(0);
        }
    });

    it('degrades to zero instead of NaN', () => {
        expect(convert(Number.NaN, 'USD', 'PKR')).toBe(0);
        expect(convert(10, 'XYZ', 'PKR')).toBe(0);
    });

    it('exposes the applied rate', () => {
        expect(rateBetween('USD', 'PKR', { useCustomRates: true, customRates: { USD: 250 } })).toBe(250);
    });
});
