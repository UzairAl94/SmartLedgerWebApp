import { sqliteService } from './sqliteService';
import { accountService } from './accountService';
import { convertCurrency } from '../utils/format';
import type { Transaction, Account } from '../types';

type Listener = (transactions: Transaction[]) => void;

class TransactionService {
    private listeners: Listener[] = [];

    // Subscribe to transactions
    subscribeToTransactions(onUpdate: Listener, maxLimit = 50) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify(maxLimit); // Initial fetch

        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify(maxLimit = 50) {
        try {
            const transactions = await this.getRecentTransactions(maxLimit);
            this.listeners.forEach(listener => listener(transactions));
        } catch (error) {
            console.error('Error fetching and notifying transactions:', error);
        }
    }

    async getRecentTransactions(limit = 50): Promise<Transaction[]> {
        const result = await sqliteService.query(
            'SELECT * FROM transactions ORDER BY date DESC LIMIT ?',
            [limit]
        );
        return (result.values || []) as Transaction[];
    }

    // Add transaction and update account balance atomically
    async createTransaction(tx: Omit<Transaction, 'id'>) {
        const id = crypto.randomUUID();

        await sqliteService.transaction(async (db) => {
            const accountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [tx.accountId]);
            if (!accountResult.values || accountResult.values.length === 0) {
                throw new Error("Source account does not exist!");
            }
            const accountData = accountResult.values[0] as Account;

            // Convert transaction amount to account currency for balance update
            const amountInAccountCurrency = convertCurrency(tx.amount, tx.currency, accountData.currency);
            const feeInAccountCurrency = tx.fee ? convertCurrency(tx.fee, tx.currency, accountData.currency) : 0;

            let newBalance = accountData.balance;
            if (tx.type === 'Income') {
                newBalance = accountData.balance + amountInAccountCurrency - feeInAccountCurrency;
            } else {
                newBalance = accountData.balance - amountInAccountCurrency - feeInAccountCurrency;
            }

            // Create the transaction record
            await db.run(
                'INSERT INTO transactions (id, amount, currency, categoryId, accountId, toAccountId, date, note, type, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null, tx.date, tx.note || null, tx.type, tx.fee || null]
            );

            // Update source account balance
            await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, tx.accountId]);

            // Handle Transfer destination account
            if (tx.type === 'Transfer' && tx.toAccountId) {
                const toAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [tx.toAccountId]);
                if (!toAccountResult.values || toAccountResult.values.length === 0) {
                    throw new Error("Destination account does not exist!");
                }
                const toAccountData = toAccountResult.values[0] as Account;
                const amountInToAccountCurrency = convertCurrency(tx.amount, tx.currency, toAccountData.currency);
                const newToBalance = toAccountData.balance + amountInToAccountCurrency;
                await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newToBalance, tx.toAccountId]);
            }
        });

        await this.fetchAndNotify();
        await (accountService as any).fetchAndNotify(); // Refresh accounts too
        return id;
    }

    // Delete transaction and revert account balance atomically
    async deleteTransaction(tx: Transaction) {
        await sqliteService.transaction(async (db) => {
            const accountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [tx.accountId]);
            if (!accountResult.values || accountResult.values.length === 0) {
                throw new Error("Source account does not exist!");
            }
            const accountData = accountResult.values[0] as Account;

            const amountInAccountCurrency = convertCurrency(tx.amount, tx.currency, accountData.currency);
            const feeInAccountCurrency = tx.fee ? convertCurrency(tx.fee, tx.currency, accountData.currency) : 0;

            let newBalance = accountData.balance;
            if (tx.type === 'Income') {
                newBalance = accountData.balance - amountInAccountCurrency + feeInAccountCurrency;
            } else {
                newBalance = accountData.balance + amountInAccountCurrency + feeInAccountCurrency;
            }

            // Delete the transaction record
            await db.run('DELETE FROM transactions WHERE id = ?', [tx.id]);

            // Update the source account balance
            await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, tx.accountId]);

            // Handle Transfer destination account revert
            if (tx.type === 'Transfer' && tx.toAccountId) {
                const toAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [tx.toAccountId]);
                if (toAccountResult.values && toAccountResult.values.length > 0) {
                    const toAccountData = toAccountResult.values[0] as Account;
                    const amountInToAccountCurrency = convertCurrency(tx.amount, tx.currency, toAccountData.currency);
                    const newToBalance = toAccountData.balance - amountInToAccountCurrency;
                    await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newToBalance, tx.toAccountId]);
                }
            }
        });

        await this.fetchAndNotify();
        await (accountService as any).fetchAndNotify(); // Refresh accounts too
    }
}

export const transactionService = new TransactionService();
