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

    async getAllTransactions(): Promise<Transaction[]> {
        const result = await sqliteService.query('SELECT * FROM transactions ORDER BY date DESC');
        return (result.values || []) as Transaction[];
    }

    // Add transaction and update account balance atomically
    async createTransaction(tx: Omit<Transaction, 'id'>) {
        const id = crypto.randomUUID();

        console.log('Creating transaction for account:', tx.accountId);

        await sqliteService.transaction(async (db) => {
            console.log('Inside transaction, querying for account:', tx.accountId);
            const accountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [tx.accountId]);
            console.log('Account query result:', accountResult);

            if (!accountResult.values || accountResult.values.length === 0) {
                // Let's also check all accounts to see what's in the DB
                const allAccounts = await db.query('SELECT id, name FROM accounts');
                console.error('No account found with id:', tx.accountId);
                console.error('Available accounts:', allAccounts.values);
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

    async updateTransaction(oldTx: Transaction, newTxData: Omit<Transaction, 'id'>) {
        await sqliteService.transaction(async (db) => {
            // 1. Revert old transaction impact
            const oldAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [oldTx.accountId]);
            if (oldAccountResult.values && oldAccountResult.values.length > 0) {
                const oldAccountData = oldAccountResult.values[0] as Account;
                const oldAmountInAccountCurrency = convertCurrency(oldTx.amount, oldTx.currency, oldAccountData.currency);
                const oldFeeInAccountCurrency = oldTx.fee ? convertCurrency(oldTx.fee, oldTx.currency, oldAccountData.currency) : 0;

                let revertedBalance = oldAccountData.balance;
                if (oldTx.type === 'Income') {
                    revertedBalance = oldAccountData.balance - oldAmountInAccountCurrency + oldFeeInAccountCurrency;
                } else {
                    revertedBalance = oldAccountData.balance + oldAmountInAccountCurrency + oldFeeInAccountCurrency;
                }
                await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [revertedBalance, oldTx.accountId]);

                // Revert destination account if it was a transfer
                if (oldTx.type === 'Transfer' && oldTx.toAccountId) {
                    const oldToAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [oldTx.toAccountId]);
                    if (oldToAccountResult.values && oldToAccountResult.values.length > 0) {
                        const oldToAccountData = oldToAccountResult.values[0] as Account;
                        const oldAmountInToAccountCurrency = convertCurrency(oldTx.amount, oldTx.currency, oldToAccountData.currency);
                        const newToBalance = oldToAccountData.balance - oldAmountInToAccountCurrency;
                        await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newToBalance, oldTx.toAccountId]);
                    }
                }
            }

            // 2. Update the transaction record
            await db.run(
                'UPDATE transactions SET amount = ?, currency = ?, categoryId = ?, accountId = ?, toAccountId = ?, date = ?, note = ?, type = ?, fee = ? WHERE id = ?',
                [newTxData.amount, newTxData.currency, newTxData.categoryId || null, newTxData.accountId, newTxData.toAccountId || null, newTxData.date, newTxData.note || null, newTxData.type, newTxData.fee || null, oldTx.id]
            );

            // 3. Apply new transaction impact
            const newAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [newTxData.accountId]);
            if (newAccountResult.values && newAccountResult.values.length > 0) {
                // IMPORTANT: Fetch the balance AGAIN because it might have changed in step 1 (if it's the same account)
                const refreshedAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [newTxData.accountId]);
                const newAccountData = refreshedAccountResult.values![0] as Account;

                const newAmountInAccountCurrency = convertCurrency(newTxData.amount, newTxData.currency, newAccountData.currency);
                const newFeeInAccountCurrency = newTxData.fee ? convertCurrency(newTxData.fee, newTxData.currency, newAccountData.currency) : 0;

                let finalBalance = newAccountData.balance;
                if (newTxData.type === 'Income') {
                    finalBalance = newAccountData.balance + newAmountInAccountCurrency - newFeeInAccountCurrency;
                } else {
                    finalBalance = newAccountData.balance - newAmountInAccountCurrency - newFeeInAccountCurrency;
                }
                await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [finalBalance, newTxData.accountId]);

                // Apply to destination account if it's a transfer
                if (newTxData.type === 'Transfer' && newTxData.toAccountId) {
                    const newToAccountResult = await db.query('SELECT * FROM accounts WHERE id = ?', [newTxData.toAccountId]);
                    if (newToAccountResult.values && newToAccountResult.values.length > 0) {
                        const newToAccountData = newToAccountResult.values[0] as Account;
                        const newAmountInToAccountCurrency = convertCurrency(newTxData.amount, newTxData.currency, newToAccountData.currency);
                        const finalToBalance = newToAccountData.balance + newAmountInToAccountCurrency;
                        await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [finalToBalance, newTxData.toAccountId]);
                    }
                }
            }
        });

        await this.fetchAndNotify();
        await (accountService as any).fetchAndNotify(); // Refresh accounts too
    }
}

export const transactionService = new TransactionService();
