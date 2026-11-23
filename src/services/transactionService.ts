import { sqliteService } from './sqliteService';
import { accountService } from './accountService';
import { settingsService } from './settingsService';
import { receiptService } from './receiptService';
import { accountDeltas, computeAmounts } from './ledgerMath';
import { recordAudit } from './auditLog';
import type { Transaction, Account } from '../types';

type Listener = (transactions: Transaction[]) => void;

const INSERT_COLUMNS = `id, amount, currency, categoryId, accountId, toAccountId, date, note, type, fee,
    receiptPath, hidden, externalId, importBatchId,
    accountAmount, accountFee, toAccountAmount, baseAmount, baseCurrency, fxRate, cleared`;
const INSERT_PLACEHOLDERS = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';

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

    async fetchAndNotify(maxLimit = 50) {
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

    async getTransactionById(id: string): Promise<Transaction | null> {
        const result = await sqliteService.query('SELECT * FROM transactions WHERE id = ?', [id]);
        const rows = (result.values || []) as Transaction[];
        return rows[0] || null;
    }

    async findByExternalId(externalId: string): Promise<Transaction | null> {
        const result = await sqliteService.query('SELECT * FROM transactions WHERE externalId = ?', [externalId]);
        const rows = (result.values || []) as Transaction[];
        return rows[0] || null;
    }

    // Count transactions touching an account (as source or transfer destination).
    // Two single-column queries because the web provider only supports a single `WHERE col = ?`.
    async countForAccount(accountId: string): Promise<number> {
        const fromResult = await sqliteService.query('SELECT * FROM transactions WHERE accountId = ?', [accountId]);
        const toResult = await sqliteService.query('SELECT * FROM transactions WHERE toAccountId = ?', [accountId]);
        return (fromResult.values?.length || 0) + (toResult.values?.length || 0);
    }

    private async getAccount(id: string): Promise<Account | null> {
        const result = await sqliteService.query('SELECT * FROM accounts WHERE id = ?', [id]);
        return (result.values?.[0] as Account) || null;
    }

    private insertValues(id: string, tx: Omit<Transaction, 'id'>, amounts: ReturnType<typeof computeAmounts>) {
        return [
            id,
            tx.amount,
            tx.currency,
            tx.categoryId || null,
            tx.accountId,
            tx.toAccountId || null,
            tx.date,
            tx.note || null,
            tx.type,
            tx.fee || null,
            tx.receiptPath || null,
            tx.hidden ? 1 : 0,
            tx.externalId || null,
            tx.importBatchId || null,
            amounts.accountAmount,
            amounts.accountFee,
            amounts.toAccountAmount ?? null,
            amounts.baseAmount,
            amounts.baseCurrency,
            amounts.fxRate,
            tx.cleared ? 1 : 0,
        ];
    }

    // Add a transaction and reconcile balances once.
    // Pass { recalculate: false } when creating a batch (e.g. recurring catch-up)
    // and call recalculateBalances() once at the end.
    async createTransaction(tx: Omit<Transaction, 'id'>, options: { recalculate?: boolean } = {}) {
        const id = crypto.randomUUID();
        const settings = await settingsService.getSettings();

        const source = await this.getAccount(tx.accountId);
        if (!source) throw new Error('Source account does not exist!');

        let destination: Account | null = null;
        if (tx.type === 'Transfer' && tx.toAccountId) {
            destination = await this.getAccount(tx.toAccountId);
            if (!destination) throw new Error('Destination account does not exist!');
        }

        const amounts = computeAmounts(tx, source, destination, settings);
        await sqliteService.execute(
            `INSERT INTO transactions (${INSERT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
            this.insertValues(id, tx, amounts)
        );
        await recordAudit({ action: 'create', entityId: id, after: { ...tx, id } });

        if (options.recalculate !== false) {
            await this.recalculateBalances();
        }
        return id;
    }

    // Insert a validated batch in one SQLite transaction, then reconcile once.
    async createTransactionsBatch(txs: Omit<Transaction, 'id'>[]): Promise<string[]> {
        const settings = await settingsService.getSettings();
        const accountsResult = await sqliteService.query('SELECT * FROM accounts');
        const accountById = new Map(((accountsResult.values || []) as Account[]).map(account => [account.id, account]));

        const prepared = txs.map(tx => {
            const source = accountById.get(tx.accountId);
            if (!source) throw new Error(`Source account does not exist: ${tx.accountId}`);
            const destination = tx.type === 'Transfer' && tx.toAccountId ? accountById.get(tx.toAccountId) : null;
            if (tx.type === 'Transfer' && tx.toAccountId && !destination) {
                throw new Error(`Destination account does not exist: ${tx.toAccountId}`);
            }
            const id = crypto.randomUUID();
            return {
                id,
                values: this.insertValues(id, tx, computeAmounts(tx, source, destination || null, settings)),
            };
        });

        await sqliteService.transaction(async db => {
            for (const row of prepared) {
                await db.run(
                    `INSERT INTO transactions (${INSERT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
                    row.values
                );
            }
        });

        await this.recalculateBalances();
        const batchId = txs.find(tx => tx.importBatchId)?.importBatchId;
        await recordAudit({
            action: 'batch-create',
            entity: 'import',
            entityId: batchId || prepared[0]?.id || 'batch',
            batchId,
            after: { count: prepared.length, ids: prepared.map(row => row.id) },
        });
        return prepared.map(row => row.id);
    }

    // Delete a transaction, clean up its receipt and reconcile balances.
    async deleteTransaction(tx: Transaction) {
        await sqliteService.execute('DELETE FROM transactions WHERE id = ?', [tx.id]);
        await receiptService.remove(tx.receiptPath);
        await recordAudit({ action: 'delete', entityId: tx.id, before: tx });
        await this.recalculateBalances();
    }

    // Delete a set of rows in one SQLite transaction, then reconcile once.
    async deleteTransactionsBatch(txs: Transaction[]): Promise<void> {
        if (txs.length === 0) return;
        const receiptPaths = txs
            .map(t => t.receiptPath)
            .filter((p): p is string => !!p);

        await sqliteService.transaction(async (db) => {
            for (const tx of txs) {
                await db.run('DELETE FROM transactions WHERE id = ?', [tx.id]);
            }
        });

        for (const path of receiptPaths) {
            await receiptService.remove(path);
        }

        await this.recalculateBalances();
    }

    // Edit keeps externalId/importBatchId; the frozen amounts are recomputed
    // because an edit is a new agreement, not a historical rewrite.
    async updateTransaction(oldTx: Transaction, newTxData: Omit<Transaction, 'id'>) {
        const settings = await settingsService.getSettings();

        const source = await this.getAccount(newTxData.accountId);
        if (!source) throw new Error('Source account does not exist!');

        let destination: Account | null = null;
        if (newTxData.type === 'Transfer' && newTxData.toAccountId) {
            destination = await this.getAccount(newTxData.toAccountId);
            if (!destination) throw new Error('Destination account does not exist!');
        }

        const amounts = computeAmounts(newTxData, source, destination, settings);

        await sqliteService.execute(
            `UPDATE transactions SET
                amount = ?, currency = ?, categoryId = ?, accountId = ?, toAccountId = ?, date = ?,
                note = ?, type = ?, fee = ?, receiptPath = ?, hidden = ?,
                accountAmount = ?, accountFee = ?, toAccountAmount = ?, baseAmount = ?, baseCurrency = ?, fxRate = ?,
                cleared = ?
             WHERE id = ?`,
            [
                newTxData.amount,
                newTxData.currency,
                newTxData.categoryId || null,
                newTxData.accountId,
                newTxData.toAccountId || null,
                newTxData.date,
                newTxData.note || null,
                newTxData.type,
                newTxData.fee || null,
                newTxData.receiptPath || null,
                newTxData.hidden ? 1 : 0,
                amounts.accountAmount,
                amounts.accountFee,
                amounts.toAccountAmount ?? null,
                amounts.baseAmount,
                amounts.baseCurrency,
                amounts.fxRate,
                newTxData.cleared ?? oldTx.cleared ?? 0,
                oldTx.id,
            ]
        );

        await recordAudit({
            action: 'update',
            entityId: oldTx.id,
            before: oldTx,
            after: { ...newTxData, id: oldTx.id },
        });

        // If the receipt changed or was removed, delete the old file (no orphans).
        if (oldTx.receiptPath && oldTx.receiptPath !== newTxData.receiptPath) {
            await receiptService.remove(oldTx.receiptPath);
        }

        await this.recalculateBalances();
    }

    // Mark rows reconciled/cleared. Does not move balances, so no recalculation.
    async setCleared(ids: string[], value: 0 | 1, options: { audit?: boolean } = {}): Promise<number> {
        let changed = 0;
        for (const id of ids) {
            const before = await this.getTransactionById(id);
            if (!before) continue;
            if ((before.cleared ?? 0) === value) continue;

            await sqliteService.execute('UPDATE transactions SET cleared = ? WHERE id = ?', [value, id]);
            if (options.audit !== false) {
                await recordAudit({ action: 'clear', entityId: id, before, after: { ...before, cleared: value } });
            }
            changed++;
        }
        if (changed > 0) await this.fetchAndNotify();
        return changed;
    }

    // Re-insert an exact row, used by audit undo. No audit entry is produced.
    async restoreTransaction(tx: Transaction): Promise<void> {
        await sqliteService.transaction(async (db) => {
            await db.run('DELETE FROM transactions WHERE id = ?', [tx.id]);
            await db.run(
                `INSERT INTO transactions (${INSERT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
                [
                    tx.id, tx.amount, tx.currency, tx.categoryId || null, tx.accountId, tx.toAccountId || null,
                    tx.date, tx.note || null, tx.type, tx.fee || null, tx.receiptPath || null,
                    tx.hidden ? 1 : 0, tx.externalId || null, tx.importBatchId || null,
                    tx.accountAmount ?? null, tx.accountFee ?? null, tx.toAccountAmount ?? null,
                    tx.baseAmount ?? null, tx.baseCurrency || null, tx.fxRate ?? null,
                    tx.cleared ? 1 : 0,
                ]
            );
        });
        await this.recalculateBalances();
    }

    // Reconcile every account's balance from scratch:
    // balance = initialBalance + sum of its transactions. Uses frozen amounts
    // where present, so later exchange-rate edits cannot rewrite history.
    async recalculateBalances() {
        const settings = await settingsService.getSettings();

        const accountsResult = await sqliteService.query('SELECT * FROM accounts');
        const accounts = (accountsResult.values || []) as Account[];
        const txResult = await sqliteService.query('SELECT * FROM transactions');
        const txs = (txResult.values || []) as Transaction[];

        const deltas = accountDeltas(txs, accounts, settings);

        await sqliteService.transaction(async (db) => {
            for (const account of accounts) {
                const balance = account.initialBalance + (deltas.get(account.id) ?? 0);
                await db.run('UPDATE accounts SET balance = ? WHERE id = ?', [balance, account.id]);
            }
        });

        await this.fetchAndNotify();
        await accountService.fetchAndNotify();
    }
}

export const transactionService = new TransactionService();
