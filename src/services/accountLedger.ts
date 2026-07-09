import type { ParsedAccount } from './deepSeekService';
import type { Account } from '../types';
import { accountService } from './accountService';
import { transactionService } from './transactionService';
import { LedgerValidationError } from './ledgerEngine';
import { resolveByName } from '../utils/match';

export const accountLedger = {
    /**
     * Apply a parsed voice command to accounts (add or update).
     * @throws LedgerValidationError on validation problems.
     */
    processAccount: async (parsed: ParsedAccount, accounts: Account[]): Promise<void> => {
        if (parsed.action === 'add') {
            const name = (parsed.name || '').trim();
            if (!name) throw new LedgerValidationError("Account name is required.");

            const isDuplicate = accounts.some(a => a.name.toLowerCase() === name.toLowerCase());
            if (isDuplicate) throw new LedgerValidationError(`An account named "${name}" already exists.`);

            const initialBalance = parsed.initialBalance ?? 0;
            await accountService.addAccount({
                name,
                type: parsed.type || 'Bank',
                currency: parsed.currency || 'PKR',
                balance: initialBalance,
                initialBalance,
                color: '#4f46e5',
            });
            return;
        }

        if (parsed.action === 'update') {
            const target = resolveByName(accounts, parsed.targetAccount);
            if (!target) {
                throw new LedgerValidationError(
                    `Couldn't find an account matching "${parsed.targetAccount || ''}".`
                );
            }

            const updates: Partial<Account> = {};

            // Name / type — always allowed.
            if (parsed.name && parsed.name.trim() && parsed.name.trim().toLowerCase() !== target.name.toLowerCase()) {
                const dup = accounts.some(a => a.id !== target.id && a.name.toLowerCase() === parsed.name!.trim().toLowerCase());
                if (dup) throw new LedgerValidationError(`An account named "${parsed.name!.trim()}" already exists.`);
                updates.name = parsed.name.trim();
            }
            if (parsed.type && parsed.type !== target.type) updates.type = parsed.type;

            // Currency / initial balance — blocked once the account has transactions.
            const wantsCurrency = !!parsed.currency && parsed.currency !== target.currency;
            const wantsBalance = parsed.initialBalance != null && parsed.initialBalance !== target.initialBalance;

            if (wantsCurrency || wantsBalance) {
                const txCount = await transactionService.countForAccount(target.id);
                if (txCount > 0) {
                    throw new LedgerValidationError(
                        "Can't change currency or initial balance — this account already has transactions."
                    );
                }
                // No transactions ⇒ balance tracks initialBalance.
                if (wantsCurrency) updates.currency = parsed.currency!;
                if (wantsBalance) {
                    updates.initialBalance = parsed.initialBalance!;
                    updates.balance = parsed.initialBalance!;
                }
            }

            if (Object.keys(updates).length === 0) {
                throw new LedgerValidationError("Nothing to update on that account.");
            }

            await accountService.updateAccount(target.id, updates);
            return;
        }

        if (parsed.action === 'delete') {
            const target = resolveByName(accounts, parsed.targetAccount);
            if (!target) {
                throw new LedgerValidationError(
                    `Couldn't find an account matching "${parsed.targetAccount || ''}".`
                );
            }
            await accountService.deleteAccount(target.id);
            return;
        }

        throw new LedgerValidationError("Couldn't tell whether to add, update, or delete an account. Try again.");
    },
};
