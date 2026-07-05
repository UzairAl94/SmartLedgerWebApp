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
                'INSERT INTO categories (id, name, icon, color, type, hidden) VALUES (?, ?, ?, ?, ?, ?)',
                [cat.id, cat.name, cat.icon, cat.color, cat.type, cat.hidden ? 1 : 0]
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
                'INSERT INTO transactions (id, amount, currency, categoryId, accountId, toAccountId, date, note, type, fee, receiptPath, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [tx.id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null, tx.date, tx.note || null, tx.type, tx.fee || null, tx.receiptPath || null, tx.hidden ? 1 : 0]
            );
        }

        if (data.settings) {
            await db.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ['user_preferences', JSON.stringify(data.settings)]);
        }

        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['categories_seeded', 'true']);
    });
};

const BACKUP_PREFIX = 'SmartLedger_Backup_';
const BACKUP_DIR = 'SmartLedger';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const isWeb = () => Capacitor.getPlatform() === 'web';

// Assemble the backup ZIP (data.json + receipt images).
const buildBackupZip = async (): Promise<JSZip> => {
    const transactions = await transactionService.getAllTransactions();
    const data: BackupData = {
        version: 2,
        timestamp: new Date().toISOString(),
        accounts: await accountService.getAllAccounts(),
        transactions,
        categories: await categoryService.getAllCategories(),
        settings: await settingsService.getSettings(),
    };
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
    return zip;
};

const backupFileName = (): string => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
    return `${BACKUP_PREFIX}${stamp}.zip`;
};

// Manual export / "Back up to Drive": build ZIP and hand to the share sheet
// (web downloads the file directly).
const shareBackupZip = async (): Promise<void> => {
    const zip = await buildBackupZip();
    const fileName = backupFileName();
    if (isWeb()) {
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
    const base64Zip = await zip.generateAsync({ type: 'base64' });
    const result = await Filesystem.writeFile({ path: fileName, data: base64Zip, directory: Directory.Cache });
    await Share.share({
        title: 'Smart Ledger Backup',
        text: 'Your financial record backup (includes receipts).',
        url: result.uri,
        dialogTitle: 'Save your backup',
    });
};

// Delete backup files older than one week from the Documents backup folder.
const pruneOldBackups = async (): Promise<void> => {
    if (isWeb()) return;
    try {
        const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
        const now = Date.now();
        for (const f of files) {
            const name = typeof f === 'string' ? f : f.name;
            if (!name.startsWith(BACKUP_PREFIX)) continue;
            const path = `${BACKUP_DIR}/${name}`;
            const st = await Filesystem.stat({ path, directory: Directory.Documents });
            if (now - st.mtime > WEEK_MS) {
                await Filesystem.deleteFile({ path, directory: Directory.Documents });
            }
        }
    } catch {
        // backup dir doesn't exist yet — nothing to prune
    }
};

// Silent local backup into Documents/SmartLedger, then prune old files.
const runAutoBackup = async (): Promise<void> => {
    if (isWeb()) return; // no silent file writes on web
    const zip = await buildBackupZip();
    const base64Zip = await zip.generateAsync({ type: 'base64' });
    await Filesystem.writeFile({
        path: `${BACKUP_DIR}/${backupFileName()}`,
        data: base64Zip,
        directory: Directory.Documents,
        recursive: true,
    });
    await settingsService.updateSettings({ lastBackupAt: new Date().toISOString() });
    await pruneOldBackups();
};

// Launch/resume due-check: run a backup if enough time has elapsed and the
// configured time-of-day has been reached. Always prunes old files.
const maybeRunScheduledBackup = async (): Promise<void> => {
    if (isWeb()) return;
    await pruneOldBackups();

    const s = await settingsService.getSettings();
    if (!s.autoBackupEnabled) return;

    const now = new Date();
    const intervalDays = s.backupFrequency === 'daily' ? 1 : s.backupFrequency === 'weekly' ? 7 : 30;

    let due = false;
    if (!s.lastBackupAt) {
        due = true;
    } else {
        due = now.getTime() - new Date(s.lastBackupAt).getTime() >= intervalDays * DAY_MS;
    }

    // Soft time-of-day gate: don't run before the configured time on the due day.
    if (due && s.backupTime) {
        const [h, m] = s.backupTime.split(':').map(Number);
        const threshold = new Date(now);
        threshold.setHours(h || 0, m || 0, 0, 0);
        if (now < threshold) due = false;
    }

    if (due) {
        try {
            await runAutoBackup();
        } catch (e) {
            console.error('Auto-backup failed:', e);
        }
    }
};

export const backupService = {
    // Manual export via the share sheet.
    exportBackup: shareBackupZip,

    // Same share sheet — the user picks Google Drive as the target.
    backupToDrive: shareBackupZip,

    // Silent local backup + prune (used by the scheduler; exposed for manual runs).
    runAutoBackup,
    pruneOldBackups,
    maybeRunScheduledBackup,

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
