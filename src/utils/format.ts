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
