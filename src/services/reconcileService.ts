import { accountService } from './accountService';
import { transactionService } from './transactionService';
import { settingsService } from './settingsService';
import { accountDeltas } from './ledgerMath';
import type { Account } from '../types';

export interface ReconcileState {
    accountId: string;
    accountName: string;
    currency: Account['currency'];
    ledgerBalance: number;
    clearedBalance: number;
    unclearedCount: number;
    unclearedDelta: number;
}

export const reconcileService = {
    async getState(accountId: string): Promise<ReconcileState> {
        const [accounts, transactions, settings] = await Promise.all([
            accountService.getAllAccounts(),
            transactionService.getAllTransactions(),
            settingsService.getSettings(),
        ]);

        const account = accounts.find(item => item.id === accountId);
        if (!account) throw new Error('Account not found.');

        const touching = transactions.filter(tx => tx.accountId === accountId || tx.toAccountId === accountId);
        const cleared = touching.filter(tx => tx.cleared === 1);
        const uncleared = touching.filter(tx => !tx.cleared);

        const clearedDeltas = accountDeltas(cleared, accounts, settings);
        const unclearedDeltas = accountDeltas(uncleared, accounts, settings);

        return {
            accountId,
            accountName: account.name,
            currency: account.currency,
            ledgerBalance: account.balance,
            clearedBalance: account.initialBalance + (clearedDeltas.get(accountId) ?? 0),
            unclearedCount: uncleared.length,
            unclearedDelta: unclearedDeltas.get(accountId) ?? 0,
        };
    },
};
