import type { DesktopStore } from '../store';
import type { AuditEntryView } from '../types';
import { fmtDateTime } from '../format';
import { Card, CardHead, Empty, Icon } from '../ui';

const summary = (entry: AuditEntryView): string => {
    const after = entry.after as Record<string, unknown> | null;
    const before = entry.before as Record<string, unknown> | null;

    if (entry.action === 'batch-create') {
        const count = after && typeof after.count === 'number' ? after.count : 0;
        return `Imported ${count} row${count === 1 ? '' : 's'} (${entry.entityId.slice(0, 24)}…)`;
    }

    const tx = (after || before) as Record<string, unknown> | null;
    const amount = tx && typeof tx.amount === 'number' ? tx.amount : null;
    const currency = tx && typeof tx.currency === 'string' ? tx.currency : '';
    const note = tx && typeof tx.note === 'string' ? tx.note : '';
    const amountText = amount === null ? '' : `${amount.toLocaleString('en-US')} ${currency}`;

    if (entry.action === 'clear') {
        const cleared = !!(after && after.cleared);
        return `${cleared ? 'Marked cleared' : 'Marked uncleared'}${amountText ? ` · ${amountText}` : ''}${note ? ` · ${note}` : ''}`;
    }
    return [amountText, note].filter(Boolean).join(' · ') || entry.entityId.slice(0, 12);
};

export const ActivityView = ({ store }: { store: DesktopStore }) => {
    const { audit, client } = store;

    const undo = async (entry: AuditEntryView) => {
        if (!client) return;
        try {
            await client.undoAudit(entry.id);
            store.notify('Change undone', 'ok');
            await store.refresh();
        } catch (error) {
            store.notify(error instanceof Error ? error.message : String(error), 'error');
        }
    };

    return (
        <Card>
            <CardHead
                title="Recent changes"
                subtitle="Every transaction write is recorded. Undo applies the inverse."
                action={<button className="btn sm" onClick={() => store.refresh()}><Icon name="refresh" /> Refresh</button>}
            />
            {audit.length ? (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Action</th>
                                <th>Detail</th>
                                <th className="t-right">Undo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {audit.map(entry => (
                                <tr key={entry.id}>
                                    <td className="t-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(entry.at)}</td>
                                    <td><span className="chip">{entry.action.replace('-', ' ')}</span></td>
                                    <td className="t-note" style={{ maxWidth: 420 }}>{summary(entry)}</td>
                                    <td className="t-right">
                                        {entry.undoneAt ? (
                                            <span className="t-muted" style={{ fontSize: 12 }}>Undone</span>
                                        ) : (
                                            <button className="btn sm" onClick={() => undo(entry)}>Undo</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <Empty message="No recorded changes yet" />}
        </Card>
    );
};
