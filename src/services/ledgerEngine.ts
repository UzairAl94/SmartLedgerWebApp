import type { ParsedTransaction } from './deepSeekService';
import type { Account, Category, Transaction } from '../types';
import { transactionService } from './transactionService';

export class LedgerValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LedgerValidationError';
    }
}

/**
 * Resolve a spoken/parsed name against a list of items by their `name`.
 * 1) exact case-insensitive match, then
 * 2) fuzzy fallback: stored name contains the token or vice-versa.
 * Returns undefined if no match, or if the fuzzy match is ambiguous (multiple hits).
 */
const resolveByName = <T extends { name: string }>(items: T[], rawName: string | null): T | undefined => {
    const token = (rawName || '').toLowerCase().trim();
    if (!token) return undefined;

    // 1. Exact (case-insensitive)
    const exact = items.find(i => i.name.toLowerCase().trim() === token);
    if (exact) return exact;

    // 2. Fuzzy: substring either direction
    const fuzzy = items.filter(i => {
        const name = i.name.toLowerCase().trim();
        return name.includes(token) || token.includes(name);
    });
    return fuzzy.length === 1 ? fuzzy[0] : undefined;
};

export const ledgerEngine = {
    /**
     * Process a parsed transaction and save it to the database
     * @throws LedgerValidationError if validation fails
     */
    processTransaction: async (
        parsed: ParsedTransaction,
        accounts: Account[],
        categories: Category[]
    ): Promise<Transaction> => {
        // Validate type
        if (!parsed.type) {
            throw new LedgerValidationError("Transaction type is required");
        }

        // Validate amount
        if (!parsed.amount || parsed.amount <= 0) {
            throw new LedgerValidationError("Valid amount is required");
        }

        // Handle different transaction types
        if (parsed.type === 'transfer') {
            return ledgerEngine.processTransfer(parsed, accounts);
        } else {
            return ledgerEngine.processIncomeOrExpense(parsed, accounts, categories);
        }
    },

    processIncomeOrExpense: async (
        parsed: ParsedTransaction,
        accounts: Account[],
        categories: Category[]
    ): Promise<Transaction> => {
        // Find account (exact, then fuzzy fallback)
        const account = resolveByName(accounts, parsed.account);

        if (!account) {
            throw new LedgerValidationError(
                `Account "${parsed.account}" not found. Please create it first.`
            );
        }

        // Find category (filter by type, then exact/fuzzy match)
        const expectedType = parsed.type === 'income' ? 'Income' : 'Expense';
        const category = resolveByName(categories.filter(c => c.type === expectedType), parsed.category);

        if (!category) {
            throw new LedgerValidationError(
                `Category "${parsed.category}" not found for ${parsed.type}. Please create it first.`
            );
        }

        // Create transaction
        const transaction: Omit<Transaction, 'id'> = {
            type: parsed.type === 'income' ? 'Income' : 'Expense',
            amount: parsed.amount!,
            currency: parsed.currency || 'PKR', // Use parsed currency or default to PKR
            accountId: account.id,
            categoryId: category.id,
            date: new Date().toISOString(),
            note: parsed.note || undefined
        };

        const txId = await transactionService.createTransaction(transaction);

        return {
            id: txId,
            ...transaction
        } as Transaction;
    },

    processTransfer: async (
        parsed: ParsedTransaction,
        accounts: Account[]
    ): Promise<Transaction> => {
        // Find from account (exact, then fuzzy fallback)
        const fromAccount = resolveByName(accounts, parsed.fromAccount);

        if (!fromAccount) {
            throw new LedgerValidationError(
                `Source account "${parsed.fromAccount}" not found. Please create it first.`
            );
        }

        // Find to account (exact, then fuzzy fallback)
        const toAccount = resolveByName(accounts, parsed.toAccount);

        if (!toAccount) {
            throw new LedgerValidationError(
                `Destination account "${parsed.toAccount}" not found. Please create it first.`
            );
        }

        // Create transfer transaction
        const transaction: Omit<Transaction, 'id'> = {
            type: 'Transfer',
            amount: parsed.amount!,
            currency: parsed.currency || 'PKR', // Use parsed currency or default to PKR
            accountId: fromAccount.id,
            toAccountId: toAccount.id,
            date: new Date().toISOString(),
            note: parsed.note || undefined
        };

        const txId = await transactionService.createTransaction(transaction);

        return {
            id: txId,
            ...transaction
        } as Transaction;
    }
};
