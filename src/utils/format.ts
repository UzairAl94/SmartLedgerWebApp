import type { Currency } from '../types';
import { mockRates } from '../mock/data';

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

export const convertCurrency = (amount: number, from: Currency, to: Currency) => {
    if (from === to) return amount;

    // Convert from 'from' to PKR
    const inPKR = amount * mockRates[from];
    // Convert from PKR to 'to'
    return inPKR / mockRates[to];
};
