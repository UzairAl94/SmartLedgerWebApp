import { sqliteService } from './sqliteService';
import type { Account } from '../types';

type Listener = (accounts: Account[]) => void;

class AccountService {
    private listeners: Listener[] = [];

    // Subscribe to accounts changes
    subscribeToAccounts(onUpdate: Listener) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify(); // Initial fetch

        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify() {
        try {
            const accounts = await this.getAllAccounts();
            this.listeners.forEach(listener => listener(accounts));
        } catch (error) {
            console.error('Error fetching and notifying accounts:', error);
        }
    }

    async getAllAccounts(): Promise<Account[]> {
        const result = await sqliteService.query('SELECT * FROM accounts ORDER BY name ASC');
        return (result.values || []) as Account[];
    }

    // Add a new account
    async addAccount(account: Omit<Account, 'id'>) {
        const id = crypto.randomUUID();
        await sqliteService.execute(
            'INSERT INTO accounts (id, name, type, currency, balance, initialBalance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, account.name, account.type, account.currency, account.balance, account.initialBalance, account.color, account.icon]
        );
        await this.fetchAndNotify();
        return id;
    }

    // Update an existing account
    async updateAccount(id: string, updates: Partial<Account>) {
        const fields = Object.keys(updates);
        if (fields.length === 0) return;

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = Object.values(updates);

        await sqliteService.execute(
            `UPDATE accounts SET ${setClause} WHERE id = ?`,
            [...values, id]
        );
        await this.fetchAndNotify();
    }

    // Delete an account
    async deleteAccount(id: string) {
        await sqliteService.transaction(async (db) => {
            // Manually delete transactions associated with this account to avoid FK constraint errors
            // specifically for cases where ON DELETE CASCADE hasn't been applied to existing DBs.
            await db.execute('DELETE FROM transactions WHERE accountId = ? OR toAccountId = ?', [id, id]);
            await db.execute('DELETE FROM accounts WHERE id = ?', [id]);
        });

        await this.fetchAndNotify();

        // Dynamically import to avoid circular dependency at top-level
        const { transactionService } = await import('./transactionService');
        await transactionService.fetchAndNotify();
    }
}

export const accountService = new AccountService();
