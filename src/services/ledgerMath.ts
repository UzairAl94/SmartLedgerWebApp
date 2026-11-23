import type { Account, Currency, Transaction, UserSettings } from '../types';
import { convert, rateBetween } from '../utils/money';

export interface FrozenAmounts {
    accountAmount: number;
    accountFee: number;
    toAccountAmount?: number;
    baseAmount: number;
    baseCurrency: Currency;
    fxRate: number;
}

export type MathSettings = Pick<UserSettings, 'mainCurrency' | 'useCustomRates' | 'customRates'>;

/**
 * The amounts a transaction contributes at the moment it is written.
 * Storing these keeps history stable when exchange rates change later.
 */
export const computeAmounts = (
    tx: Pick<Transaction, 'amount' | 'currency' | 'type' | 'fee'>,
    source: Account,
    destination: Account | null | undefined,
    settings: MathSettings
): FrozenAmounts => {
    const amounts: FrozenAmounts = {
        accountAmount: convert(tx.amount, tx.currency, source.currency, settings),
        accountFee: tx.fee ? convert(tx.fee, tx.currency, source.currency, settings) : 0,
        baseAmount: convert(tx.amount, tx.currency, settings.mainCurrency, settings),
        baseCurrency: settings.mainCurrency,
        fxRate: rateBetween(tx.currency, source.currency, settings),
    };

    if (tx.type === 'Transfer' && destination) {
        amounts.toAccountAmount = convert(tx.amount, tx.currency, destination.currency, settings);
    }

    return amounts;
};

const amountFor = (tx: Transaction, account: Account, settings: MathSettings): number => {
    if (tx.accountAmount !== undefined && tx.accountAmount !== null) return tx.accountAmount;
    return convert(tx.amount, tx.currency, account.currency, settings);
};

const feeFor = (tx: Transaction, account: Account, settings: MathSettings): number => {
    if (!tx.fee) return 0;
    if (tx.accountFee !== undefined && tx.accountFee !== null) return tx.accountFee;
    return convert(tx.fee, tx.currency, account.currency, settings);
};

const transferAmountFor = (tx: Transaction, destination: Account, settings: MathSettings): number => {
    if (tx.toAccountAmount !== undefined && tx.toAccountAmount !== null) return tx.toAccountAmount;
    return convert(tx.amount, tx.currency, destination.currency, settings);
};

/**
 * Net change per account for a set of transactions, in each account's own
 * currency. Prefers frozen amounts so later rate edits cannot rewrite history.
 */
export const accountDeltas = (
    transactions: Transaction[],
    accounts: Account[],
    settings: MathSettings
): Map<string, number> => {
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const deltas = new Map<string, number>();

    const add = (accountId: string, delta: number) => {
        if (!Number.isFinite(delta)) return;
        deltas.set(accountId, (deltas.get(accountId) || 0) + delta);
    };

    for (const tx of transactions) {
        const source = accountById.get(tx.accountId);
        if (!source) continue;

        const amount = amountFor(tx, source, settings);
        const fee = feeFor(tx, source, settings);
        add(source.id, tx.type === 'Income' ? amount - fee : -(amount + fee));

        if (tx.type === 'Transfer' && tx.toAccountId) {
            const destination = accountById.get(tx.toAccountId);
            if (destination) add(destination.id, transferAmountFor(tx, destination, settings));
        }
    }

    return deltas;
};
