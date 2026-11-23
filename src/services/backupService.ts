import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';
import { accountService } from './accountService';
import { transactionService } from './transactionService';
import { categoryService } from './categoryService';
import { budgetService } from './budgetService';
import { recurringService } from './recurringService';
import { settingsService } from './settingsService';
import { sqliteService } from './sqliteService';
import { receiptService } from './receiptService';
import { secretsService, SECRET_KEYS } from './secretsService';
import { decryptBackup, encryptBackup, isEncryptedBackup } from '../utils/backupCrypto';
import { verifyBackupData, type BackupData, type BackupVerification } from './backupVerify';

export type { BackupVerification } from './backupVerify';

interface ParsedBackup {
    data: BackupData;
    receipts: Map<string, string> | null;
    warnings: string[];
    encrypted: boolean;
}

// Re-seed all tables from a parsed backup payload.
const restoreData = async (data: BackupData) => {
    await sqliteService.transaction(async (db) => {
        // Delete children before parents (FKs are ON on native).
        await db.run('DELETE FROM transactions');
        await db.run('DELETE FROM recurring_transactions');
        await db.run('DELETE FROM budgets');
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
                `INSERT INTO transactions (id, amount, currency, categoryId, accountId, toAccountId, date, note,
                    type, fee, receiptPath, hidden, externalId, importBatchId,
                    accountAmount, accountFee, toAccountAmount, baseAmount, baseCurrency, fxRate, cleared)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tx.id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null,
                    tx.date, tx.note || null, tx.type, tx.fee || null, tx.receiptPath || null,
                    tx.hidden ? 1 : 0, tx.externalId || null, tx.importBatchId || null,
                    tx.accountAmount ?? null, tx.accountFee ?? null, tx.toAccountAmount ?? null,
                    tx.baseAmount ?? null, tx.baseCurrency || null, tx.fxRate ?? null,
                    tx.cleared ? 1 : 0,
                ]
            );
        }

        for (const budget of data.budgets || []) {
            await db.execute(
                'INSERT INTO budgets (id, categoryId, amount, currency, period) VALUES (?, ?, ?, ?, ?)',
                [budget.id, budget.categoryId, budget.amount, budget.currency, budget.period]
            );
        }

        for (const rule of data.recurring || []) {
            await db.execute(
                'INSERT INTO recurring_transactions (id, amount, currency, categoryId, accountId, toAccountId, note, type, fee, frequency, nextRunDate, active, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [rule.id, rule.amount, rule.currency, rule.categoryId || null, rule.accountId, rule.toAccountId || null, rule.note || null, rule.type, rule.fee || null, rule.frequency, rule.nextRunDate, rule.active, rule.hidden ? 1 : 0]
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

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

// Assemble the backup ZIP (data.json + manifest + receipt images).
const buildBackupZip = async (): Promise<JSZip> => {
    const transactions = await transactionService.getAllTransactions();
    const data: BackupData = {
        version: 4,
        timestamp: new Date().toISOString(),
        accounts: await accountService.getAllAccounts(),
        transactions,
        categories: await categoryService.getAllCategories(),
        budgets: await budgetService.getAllBudgets(),
        recurring: await recurringService.getAll(),
        settings: await settingsService.getSettings(),
    };

    const json = JSON.stringify(data, null, 2);
    const zip = new JSZip();
    zip.file('data.json', json);
    zip.file('manifest.json', JSON.stringify({
        format: 1,
        sha256: await sha256Hex(new TextEncoder().encode(json)),
        createdAt: data.timestamp,
    }, null, 2));

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

const backupFileName = (encrypted: boolean): string => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
    return `${BACKUP_PREFIX}${stamp}.${encrypted ? 'slbk' : 'zip'}`;
};

const storedPassphrase = (): Promise<string | null> => secretsService.getKey(SECRET_KEYS.backupPassphrase);

// Build the archive and, when enabled, encrypt it with the stored passphrase.
const buildBackupBytes = async (): Promise<{ bytes: Uint8Array; encrypted: boolean }> => {
    const zip = await buildBackupZip();
    const settings = await settingsService.getSettings();
    let bytes = await zip.generateAsync({ type: 'uint8array' });

    if (!settings.backupEncryptionEnabled) return { bytes, encrypted: false };

    const passphrase = await storedPassphrase();
    if (!passphrase) throw new Error('Encrypted backups are enabled but no passphrase is stored. Set one in Settings.');
    bytes = await encryptBackup(bytes, passphrase);
    return { bytes, encrypted: true };
};

// Manual export / "Back up to Drive": build the archive and hand it to the
// share sheet (web downloads the file directly).
const shareBackupZip = async (): Promise<void> => {
    const { bytes, encrypted } = await buildBackupBytes();
    const fileName = backupFileName(encrypted);

    if (isWeb()) {
        const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
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

    const result = await Filesystem.writeFile({
        path: fileName,
        data: bytesToBase64(bytes),
        directory: Directory.Cache,
    });
    await Share.share({
        title: 'Smart Ledger Backup',
        text: encrypted
            ? 'Encrypted Smart Ledger backup. Keep the passphrase safe — it cannot be recovered.'
            : 'Your financial record backup (includes receipts).',
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
    const { bytes, encrypted } = await buildBackupBytes();
    await Filesystem.writeFile({
        path: `${BACKUP_DIR}/${backupFileName(encrypted)}`,
        data: bytesToBase64(bytes),
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

const isValidBackupData = (data: BackupData | null | undefined): data is BackupData =>
    !!data
    && Array.isArray(data.accounts)
    && Array.isArray(data.transactions)
    && Array.isArray(data.categories);

const parseBackupJson = (text: string): BackupData => {
    let data: BackupData;
    try {
        data = JSON.parse(text) as BackupData;
    } catch {
        throw new Error('Invalid backup file: expected a Smart Ledger .zip, .slbk or .json backup.');
    }
    if (!isValidBackupData(data)) {
        throw new Error('Invalid backup file format.');
    }
    return data;
};

// ZIP files always start with "PK\x03\x04". Detect by content because Android's
// document picker sometimes returns a ZIP without a .zip extension.
const isZipBuffer = (buffer: Uint8Array): boolean => {
    if (buffer.byteLength < 4) return false;
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
};

const toBytes = (input: string | ArrayBuffer | Uint8Array): Uint8Array => {
    if (typeof input === 'string') {
        const trimmed = input.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) return new TextEncoder().encode(input);
        if (trimmed.startsWith('PK')) {
            // Binary ZIP that was read as text (older callers).
            const bytes = new Uint8Array(input.length);
            for (let index = 0; index < input.length; index++) bytes[index] = input.charCodeAt(index) & 0xff;
            return bytes;
        }
        throw new Error('Invalid backup file: expected a Smart Ledger .zip, .slbk or .json backup.');
    }
    if (input instanceof Uint8Array) return input;
    return new Uint8Array(input);
};

/**
 * Decode a backup from any supported input. Encrypted archives need the
 * passphrase; nothing is written here.
 */
const readBackup = async (
    input: string | ArrayBuffer | Uint8Array,
    passphrase?: string
): Promise<ParsedBackup> => {
    let bytes = toBytes(input);
    let encrypted = false;

    if (isEncryptedBackup(bytes)) {
        encrypted = true;
        if (!passphrase) throw new Error('This backup is encrypted. Enter its passphrase to continue.');
        bytes = await decryptBackup(bytes, passphrase);
    }

    const warnings: string[] = [];

    if (isZipBuffer(bytes)) {
        const zip = await JSZip.loadAsync(bytes);
        const dataFile = zip.file('data.json');
        if (!dataFile) throw new Error('Invalid backup: data.json missing.');
        const text = await dataFile.async('string');

        const manifestFile = zip.file('manifest.json');
        if (manifestFile) {
            try {
                const manifest = JSON.parse(await manifestFile.async('string')) as { sha256?: string };
                if (manifest.sha256) {
                    const actual = await sha256Hex(new TextEncoder().encode(text));
                    if (actual !== manifest.sha256) warnings.push('data.json does not match the archive manifest.');
                }
            } catch {
                warnings.push('manifest.json could not be read.');
            }
        }

        const data = parseBackupJson(text);
        const receipts = new Map<string, string>();
        for (const tx of data.transactions) {
            if (!tx.receiptPath) continue;
            const file = zip.file(tx.receiptPath);
            if (file) receipts.set(tx.receiptPath, await file.async('base64'));
        }
        return { data, receipts, warnings, encrypted };
    }

    return { data: parseBackupJson(new TextDecoder().decode(bytes)), receipts: null, warnings, encrypted };
};

const verifyParsed = (parsed: ParsedBackup): BackupVerification =>
    verifyBackupData({
        data: parsed.data,
        receiptPaths: parsed.receipts ? new Set(parsed.receipts.keys()) : null,
        warnings: parsed.warnings,
        encrypted: parsed.encrypted,
    });

const restoreParsed = async (parsed: ParsedBackup): Promise<void> => {
    const report = verifyParsed(parsed);
    if (report.issues.length > 0) {
        throw new Error(`Backup failed verification:\n- ${report.issues.slice(0, 5).join('\n- ')}`);
    }

    if (parsed.receipts) {
        await receiptService.clearAll();
        for (const [path, base64] of parsed.receipts) {
            await receiptService.writeBase64(path, base64);
        }
    }

    await restoreData(parsed.data);
    window.location.reload();
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

    /** True when the selected file is an encrypted (.slbk) backup. */
    isEncrypted: (input: string | ArrayBuffer | Uint8Array): boolean => {
        try {
            return isEncryptedBackup(toBytes(input));
        } catch {
            return false;
        }
    },

    /** Parse and validate a backup without writing anything. */
    verifyBackup: async (
        input: string | ArrayBuffer | Uint8Array,
        passphrase?: string
    ): Promise<BackupVerification> => verifyParsed(await readBackup(input, passphrase)),

    /**
     * Restore from a ZIP, encrypted .slbk, or legacy JSON backup.
     * The format is detected from the content, not the file extension.
     */
    restoreBackup: async (input: string | ArrayBuffer | Uint8Array, passphrase?: string): Promise<void> => {
        try {
            await restoreParsed(await readBackup(input, passphrase));
        } catch (error) {
            console.error('Restore failed:', error);
            throw error;
        }
    },
};
