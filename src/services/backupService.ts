import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { accountService } from './accountService';
import { transactionService } from './transactionService';
import { categoryService } from './categoryService';
import { settingsService } from './settingsService';
import { sqliteService } from './sqliteService';
import type { Account, Transaction, Category, UserSettings } from '../types';

interface BackupData {
    version: number;
    timestamp: string;
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    settings: UserSettings | null;
}

export const backupService = {
    exportBackup: async (): Promise<void> => {
        try {
            const data: BackupData = {
                version: 1,
                timestamp: new Date().toISOString(),
                accounts: await accountService.getAllAccounts(),
                transactions: await transactionService.getAllTransactions(),
                categories: await categoryService.getAllCategories(),
                settings: await settingsService.getSettings()
            };

            const jsonString = JSON.stringify(data, null, 2);
            const fileName = `SmartLedger_Backup_${new Date().toISOString().split('T')[0]}.json`;

            if (Capacitor.getPlatform() === 'web') {
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return;
            }

            // Android/Native
            const result = await Filesystem.writeFile({
                path: fileName,
                data: jsonString,
                directory: Directory.Cache, // Use Cache for temporary sharing
                encoding: Encoding.UTF8,
            });

            await Share.share({
                title: 'Smart Ledger Backup',
                text: 'Your current financial record backup.',
                url: result.uri,
                dialogTitle: 'Save your backup',
            });

        } catch (error) {
            console.error('Backup failed:', error);
            throw error;
        }
    },

    restoreBackup: async (jsonString: string): Promise<void> => {
        try {
            const data: BackupData = JSON.parse(jsonString);

            // Basic validation
            if (!data.accounts || !data.transactions || !data.categories) {
                throw new Error('Invalid backup file format.');
            }

            await sqliteService.transaction(async (db) => {
                // Wipe existing data
                await db.run('DELETE FROM transactions');
                await db.run('DELETE FROM accounts');
                await db.run('DELETE FROM categories');
                await db.run('DELETE FROM settings');

                // Restore Categories
                for (const cat of data.categories) {
                    await db.execute(
                        'INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
                        [cat.id, cat.name, cat.icon, cat.color, cat.type]
                    );
                }

                // Restore Accounts
                for (const acc of data.accounts) {
                    await db.execute(
                        'INSERT INTO accounts (id, name, type, currency, balance, initialBalance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [acc.id, acc.name, acc.type, acc.currency, acc.balance, acc.initialBalance, acc.color || null, acc.icon || null]
                    );
                }

                // Restore Transactions
                for (const tx of data.transactions) {
                    await db.execute(
                        'INSERT INTO transactions (id, amount, currency, categoryId, accountId, toAccountId, date, note, type, fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [tx.id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null, tx.date, tx.note || null, tx.type, tx.fee || null]
                    );
                }

                // Restore Settings
                if (data.settings) {
                    // Re-package into the 'user_preferences' key that settingsService expects
                    const settingsJson = JSON.stringify(data.settings);
                    await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['user_preferences', settingsJson]);
                }

                // Ensure seeder won't run again if categories were restored
                await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['categories_seeded', 'true']);
            });

            // Reload app to refresh all data
            window.location.reload();

        } catch (error) {
            console.error('Restore failed:', error);
            throw error;
        }
    }
};
