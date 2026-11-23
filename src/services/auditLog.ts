import { sqliteService } from './sqliteService';
import type { Transaction } from '../types';

export type AuditAction = 'create' | 'update' | 'delete' | 'clear' | 'batch-create';

export interface AuditEntry {
    id: string;
    at: string;
    action: AuditAction;
    entity: 'transaction' | 'import';
    entityId: string;
    before: unknown;
    after: unknown;
    batchId: string | null;
    undoneAt: string | null;
}

const MAX_ENTRIES = 500;

export interface AuditInput {
    action: AuditAction;
    entity?: AuditEntry['entity'];
    entityId: string;
    before?: unknown;
    after?: unknown;
    batchId?: string;
}

// Audit writes must never break a ledger mutation.
export const recordAudit = async (input: AuditInput): Promise<void> => {
    try {
        await sqliteService.execute(
            `INSERT INTO audit_log (id, at, action, entity, entityId, before, after, batchId, undoneAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                crypto.randomUUID(),
                new Date().toISOString(),
                input.action,
                input.entity || 'transaction',
                input.entityId,
                input.before === undefined || input.before === null ? null : JSON.stringify(input.before),
                input.after === undefined || input.after === null ? null : JSON.stringify(input.after),
                input.batchId || null,
                null,
            ]
        );
        await prune();
    } catch (error) {
        console.warn('Could not write audit entry:', error);
    }
};

const prune = async (): Promise<void> => {
    const result = await sqliteService.query('SELECT id FROM audit_log ORDER BY at ASC');
    const rows = (result.values || []) as Array<{ id: string }>;
    const excess = rows.length - MAX_ENTRIES;
    if (excess <= 0) return;
    for (const row of rows.slice(0, excess)) {
        await sqliteService.execute('DELETE FROM audit_log WHERE id = ?', [row.id]);
    }
};

const parseEntry = (row: Record<string, unknown>): AuditEntry => ({
    id: String(row.id),
    at: String(row.at),
    action: row.action as AuditAction,
    entity: row.entity as AuditEntry['entity'],
    entityId: String(row.entityId),
    before: row.before ? JSON.parse(String(row.before)) : null,
    after: row.after ? JSON.parse(String(row.after)) : null,
    batchId: row.batchId ? String(row.batchId) : null,
    undoneAt: row.undoneAt ? String(row.undoneAt) : null,
});

export const listAudit = async (limit = 50): Promise<AuditEntry[]> => {
    const result = await sqliteService.query('SELECT * FROM audit_log ORDER BY at DESC LIMIT ?', [limit]);
    return (result.values || []).map(row => parseEntry(row as Record<string, unknown>));
};

export const getAuditEntry = async (id: string): Promise<AuditEntry | null> => {
    const result = await sqliteService.query('SELECT * FROM audit_log WHERE id = ?', [id]);
    const row = result.values?.[0];
    return row ? parseEntry(row as Record<string, unknown>) : null;
};

export const markAuditUndone = async (id: string): Promise<void> => {
    await sqliteService.execute('UPDATE audit_log SET undoneAt = ? WHERE id = ?', [new Date().toISOString(), id]);
};

export const auditBefore = (tx: Transaction | null | undefined): Transaction | null => tx || null;
