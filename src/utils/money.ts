import type { Currency } from '../types';

export const BASE_CURRENCY: Currency = 'PKR';

/**
 * Canonical rate table. A rate is "how many PKR one unit is worth".
 * This is the only default table in the app; everything else derives from it.
 */
export const DEFAULT_RATES: Record<string, number> = {
    PKR: 1,
    USD: 278.5,
    AED: 75.83,
    MYR: 62.0,
};

export interface MoneySettings {
    mainCurrency?: Currency;
    useCustomRates?: boolean;
    customRates?: Record<string, number>;
}

export const resolveRates = (settings?: MoneySettings | null): Record<string, number> => {
    if (!settings?.useCustomRates || !settings.customRates) return { ...DEFAULT_RATES };

    const merged: Record<string, number> = { ...DEFAULT_RATES };
    for (const [code, value] of Object.entries(settings.customRates)) {
        const rate = Number(value);
        if (Number.isFinite(rate) && rate > 0) merged[String(code).toUpperCase()] = rate;
    }
    return merged;
};

/**
 * Convert an amount between currencies using the settings-aware rate table,
 * with PKR as the pivot: amount * rate[from] / rate[to].
 */
export const convert = (
    amount: number,
    from: Currency | string,
    to: Currency | string,
    settings?: MoneySettings | null
): number => {
    if (!Number.isFinite(amount)) return 0;

    const source = String(from).toUpperCase();
    const target = String(to).toUpperCase();
    if (source === target) return amount;

    const rates = resolveRates(settings);
    const sourceRate = rates[source];
    const targetRate = rates[target];
    if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || targetRate === 0) return 0;

    return (amount * sourceRate) / targetRate;
};

/** The rate applied to move one unit from `from` into `to`. */
export const rateBetween = (from: Currency | string, to: Currency | string, settings?: MoneySettings | null): number =>
    convert(1, from, to, settings);
