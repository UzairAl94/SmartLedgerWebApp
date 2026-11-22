import { fmtDate } from '../format';
import type { DesktopStore } from '../store';
import { Card, Empty } from '../ui';

export const ImportsView = ({ store, onUndo }: { store: DesktopStore; onUndo: (batchId: string) => void }) => {
    const { imports } = store;

    if (imports.length === 0) return <Card><Empty message="Nothing imported through the API yet" /></Card>;

    return (
        <>
            <div className="section-title" style={{ marginBottom: 12 }}>
                {imports.length} batches written by the import API
            </div>
            <Card className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Batch</th>
                            <th className="t-right">Rows</th>
                            <th>First date</th>
                            <th>Last date</th>
                            <th className="t-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {imports.map(batch => (
                            <tr key={batch.batchId}>
                                <td className="mono" style={{ fontSize: 11.5 }}>{batch.batchId}</td>
                                <td className="t-right t-num">{batch.count}</td>
                                <td className="t-muted">{fmtDate(batch.firstDate)}</td>
                                <td className="t-muted">{fmtDate(batch.lastDate)}</td>
                                <td>
                                    <div className="t-actions">
                                        <button className="btn sm danger" onClick={() => onUndo(batch.batchId)}>Undo batch</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
                Undo deletes every transaction in the batch and recalculates balances once.
            </p>
        </>
    );
};
