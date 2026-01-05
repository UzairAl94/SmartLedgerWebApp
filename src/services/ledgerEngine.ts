import type { ParsedTransaction } from './deepSeekService';
import type { Account, Category, Transaction } from '../types';
import { transactionService } from './transactionService';

export class LedgerValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LedgerValidationError';
    }
}

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
        // Find account
        const accountName = (parsed.account || '').toLowerCase().trim();
        const account = accounts.find(a => a.name.toLowerCase() === accountName);

        if (!account) {
            throw new LedgerValidationError(
                `Account "${parsed.account}" not found. Please create it first.`
            );
        }

        // Find category
        const categoryName = (parsed.category || '').toLowerCase().trim();
        const category = categories.find(c =>
            c.name.toLowerCase() === categoryName &&
            c.type === (parsed.type === 'income' ? 'Income' : 'Expense')
        );

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
        // Find from account
        const fromAccountName = (parsed.fromAccount || '').toLowerCase().trim();
        const fromAccount = accounts.find(a => a.name.toLowerCase() === fromAccountName);

        if (!fromAccount) {
            throw new LedgerValidationError(
                `Source account "${parsed.fromAccount}" not found. Please create it first.`
            );
        }

        // Find to account
        const toAccountName = (parsed.toAccount || '').toLowerCase().trim();
        const toAccount = accounts.find(a => a.name.toLowerCase() === toAccountName);

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
