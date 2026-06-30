import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';
import { accountService } from './accountService';
import { transactionService } from './transactionService';
import { categoryService } from './categoryService';
import { settingsService } from './settingsService';
import { sqliteService } from './sqliteService';
import { receiptService } from './receiptService';
import type { Account, Transaction, Category, UserSettings } from '../types';

interface BackupData {
    version: number;
    timestamp: string;
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    settings: UserSettings | null;
}

// Re-seed all tables from a parsed backup payload. Shared by ZIP and legacy JSON restore.
const restoreData = async (data: BackupData) => {
    await sqliteService.transaction(async (db) => {
        await db.run('DELETE FROM transactions');
        await db.run('DELETE FROM accounts');
        await db.run('DELETE FROM categories');
        await db.run('DELETE FROM settings');

        for (const cat of data.categories) {
            await db.execute(
                'INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
                [cat.id, cat.name, cat.icon, cat.color, cat.type]
            );
        }

        for (const acc of data.accounts) {
            await db.execute(
                'INSERT INTO accounts (id, name, type, currency, balance, initialBalance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [acc.id, acc.name, acc.type, acc.currency, acc.balance, acc.initialBalance, acc.color || null, acc.icon || null]
            );
        }

        for (const tx of data.transactions) {
            await db.execute(
                'INSERT INTO transactions (id, amount, currency, categoryId, accountId, toAccountId, date, note, type, fee, receiptPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [tx.id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null, tx.date, tx.note || null, tx.type, tx.fee || null, tx.receiptPath || null]
            );
        }

        if (data.settings) {
            await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['user_preferences', JSON.stringify(data.settings)]);
        }

        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['categories_seeded', 'true']);
    });
};

export const backupService = {
    exportBackup: async (): Promise<void> => {
        try {
            const transactions = await transactionService.getAllTransactions();
            const data: BackupData = {
                version: 2,
                timestamp: new Date().toISOString(),
                accounts: await accountService.getAllAccounts(),
                transactions,
                categories: await categoryService.getAllCategories(),
                settings: await settingsService.getSettings(),
            };

            // Bundle JSON + receipt images into a ZIP.
            const zip = new JSZip();
            zip.file('data.json', JSON.stringify(data, null, 2));
            for (const tx of transactions) {
                if (!tx.receiptPath) continue;
                try {
                    const base64 = await receiptService.readBase64(tx.receiptPath);
                    zip.file(tx.receiptPath, base64, { base64: true });
                } catch (e) {
                    console.warn('Skipping missing receipt during backup:', tx.receiptPath, e);
                }
            }

            const fileName = `SmartLedger_Backup_${new Date().toISOString().split('T')[0]}.zip`;

            if (Capacitor.getPlatform() === 'web') {
                const blob = await zip.generateAsync({ type: 'blob' });
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

            // Native: write the zip (base64) to Cache and share it.
            const base64Zip = await zip.generateAsync({ type: 'base64' });
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Zip,
                directory: Directory.Cache,
            });
            await Share.share({
                title: 'Smart Ledger Backup',
                text: 'Your financial record backup (includes receipts).',
                url: result.uri,
                dialogTitle: 'Save your backup',
            });
        } catch (error) {
            console.error('Backup failed:', error);
            throw error;
        }
    },

    /**
     * Restore from a ZIP backup (ArrayBuffer) or a legacy JSON backup (string).
     */
    restoreBackup: async (input: string | ArrayBuffer): Promise<void> => {
        try {
            if (typeof input === 'string') {
                // Legacy v1 JSON backup — no receipts.
                const data: BackupData = JSON.parse(input);
                if (!data.accounts || !data.transactions || !data.categories) {
                    throw new Error('Invalid backup file format.');
                }
                await restoreData(data);
                window.location.reload();
                return;
            }

            // ZIP backup.
            const zip = await JSZip.loadAsync(input);
            const dataFile = zip.file('data.json');
            if (!dataFile) throw new Error('Invalid backup: data.json missing.');
            const data: BackupData = JSON.parse(await dataFile.async('string'));
            if (!data.accounts || !data.transactions || !data.categories) {
                throw new Error('Invalid backup file format.');
            }

            // Clear existing receipt files, then restore the ones from the archive.
            await receiptService.clearAll();
            for (const tx of data.transactions) {
                if (!tx.receiptPath) continue;
                const f = zip.file(tx.receiptPath);
                if (f) await receiptService.writeBase64(tx.receiptPath, await f.async('base64'));
            }

            await restoreData(data);
            window.location.reload();
        } catch (error) {
            console.error('Restore failed:', error);
            throw error;
        }
    },
};
