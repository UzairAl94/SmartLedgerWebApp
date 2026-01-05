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
    'AED': 75.8,
    'USD': 278.5,
    'MYR': 62.0, // Malaysian Ringgit
};

export const convertCurrency = (amount: number, from: Currency, to: Currency) => {
    if (from === to) return amount;

    // Convert from 'from' to PKR
    const inPKR = amount * exchangeRates[from];
    // Convert from PKR to 'to'
    return inPKR / exchangeRates[to];
};
