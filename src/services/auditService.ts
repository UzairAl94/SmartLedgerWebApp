import { transactionService } from './transactionService';
import { getAuditEntry, listAudit, markAuditUndone, type AuditEntry } from './auditLog';
import type { Transaction } from '../types';

export type { AuditEntry } from './auditLog';

export const auditService = {
    list: (limit = 50): Promise<AuditEntry[]> => listAudit(limit),

    /**
     * Apply the inverse of a recorded change, then mark the entry as undone.
     * Refuses when the current data no longer matches what was recorded.
     */
    async undo(id: string): Promise<void> {
        const entry = await getAuditEntry(id);
        if (!entry) throw new Error('Audit entry not found.');
        if (entry.undoneAt) throw new Error('This change has already been undone.');

        switch (entry.action) {
            case 'create': {
                const tx = await transactionService.getTransactionById(entry.entityId);
                if (!tx) throw new Error('That transaction no longer exists.');
                await transactionService.deleteTransaction(tx);
                break;
            }

            case 'delete':
            case 'update': {
                const before = entry.before as Transaction | null;
                if (!before || !before.id) throw new Error('The audit entry has no previous state to restore.');
                await transactionService.restoreTransaction(before);
                break;
            }

            case 'clear': {
                const before = entry.before as Transaction | null;
                if (!before || !before.id) throw new Error('The audit entry has no previous state to restore.');
                await transactionService.setCleared([before.id], (before.cleared ? 1 : 0) as 0 | 1, { audit: false });
                break;
            }

            case 'batch-create': {
                const all = await transactionService.getAllTransactions();
                const rows = all.filter(tx => tx.importBatchId === entry.entityId);
                if (rows.length === 0) throw new Error('That import batch no longer exists.');
                await transactionService.deleteTransactionsBatch(rows);
                break;
            }

            default:
                throw new Error(`Cannot undo action "${entry.action}".`);
        }

        await markAuditUndone(id);
    },
};
