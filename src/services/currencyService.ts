export const currencyService = {
    // Default fallback rates (against PKR base for now, or relative to each other)
    // We will treat PKR as the base for storage for now, as it's the likely default.
    // 1 UNIT = X PKR
    defaultRates: {
        'PKR': 1,
        'USD': 278.50, // Example rate
        'AED': 75.83
    } as Record<string, number>,

    getRates: (settings: { useCustomRates: boolean, customRates: Record<string, number> }) => {
        if (settings.useCustomRates && settings.customRates) {
            // Merge with defaults to ensure all keys exist if some are missing
            return { ...currencyService.defaultRates, ...settings.customRates };
        }
        return currencyService.defaultRates;
    },

    convert: (amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>) => {
        if (fromCurrency === toCurrency) return amount;

        // Convert to Base (PKR) then to Target
        // Rate is "How many PKR is 1 Unit"
        // e.g. 1 USD = 278.5 PKR
        // 10 USD -> 2785 PKR

        const fromRate = rates[fromCurrency] || 1;
        const toRate = rates[toCurrency] || 1;

        // Amount in Base = Amount * FromRate
        const amountInBase = amount * fromRate;

        // Amount in Target = AmountInBase / ToRate
        // e.g. 2785 PKR / 278.5 = 10 USD
        return amountInBase / toRate;
    }
};
