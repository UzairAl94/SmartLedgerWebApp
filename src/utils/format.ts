import type { Currency } from '../types';

export const formatCurrency = (amount: number, currency: Currency) => {
    if (currency === 'PKR') {
        return 'Rs ' + amount.toLocaleString('en-PK', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    }

    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    return formatter.format(amount);
};

const exchangeRates: Record<Currency, number> = {
    'PKR': 1,
    'USD': 278.5,
    'AED': 75.8,
    'MYR': 62.0, // Malaysian Ringgit
};

export const convertCurrency = (
    amount: number,
    from: Currency,
    to: Currency,
    customRates?: Record<string, number>,
    useCustomRates?: boolean
) => {
    if (from === to) return amount;

    // Use custom rates if provided and enabled
    const rates = (useCustomRates && customRates)
        ? { ...exchangeRates, ...customRates }
        : exchangeRates;

    // Convert from 'from' to PKR
    const inPKR = amount * rates[from];
    // Convert from PKR to 'to'
    return inPKR / rates[to];
};
