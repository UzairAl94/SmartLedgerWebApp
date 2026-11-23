import { useState } from 'react';
import type { DesktopStore } from '../store';
import { fmtDate, fmtMoney } from '../format';
import { Card, CardHead, Empty, Icon } from '../ui';

export const ReconcileView = ({ store }: { store: DesktopStore }) => {
    const { reconcile, reconcileRows, reconcileAccountId, accounts, client } = store;
    const [statement, setStatement] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const toggle = async (id: string, cleared: boolean) => {
        if (!client) return;
        setBusyId(id);
        try {
            await client.setCleared(id, cleared);
            await store.refresh();
        } catch (error) {
            store.notify(error instanceof Error ? error.message : String(error), 'error');
        } finally {
            setBusyId(null);
        }
    };

    const parsed = statement.trim() === '' ? null : Number(statement);
    const difference = parsed !== null && Number.isFinite(parsed) && reconcile
        ? parsed - reconcile.clearedBalance
        : null;

    return (
        <>
            <Card>
                <CardHead
                    title="Reconciliation"
                    subtitle="Tick rows as they appear on your statement"
                    action={
                        <label className="field" style={{ minWidth: 220 }}>
                            <span>Account</span>
                            <select value={reconcileAccountId} onChange={event => store.setReconcileAccount(event.target.value)}>
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                                ))}
                            </select>
                        </label>
                    }
                />
                {reconcile ? (
                    <div className="grid kpis" style={{ padding: '0 18px 18px' }}>
                        <div className="card kpi">
                            <span className="k-label">Ledger balance</span>
                            <span className="k-value">{fmtMoney(reconcile.ledgerBalance, reconcile.currency)}</span>
                            <span className="k-sub">stored balance</span>
                        </div>
                        <div className="card kpi">
                            <span className="k-label">Cleared balance</span>
                            <span className="k-value">{fmtMoney(reconcile.clearedBalance, reconcile.currency)}</span>
                            <span className="k-sub">opening + cleared rows</span>
                        </div>
                        <div className="card kpi">
                            <span className="k-label">Uncleared</span>
                            <span className="k-value">{reconcile.unclearedCount}</span>
                            <span className="k-sub">{fmtMoney(reconcile.unclearedDelta, reconcile.currency)} net</span>
                        </div>
                        <div className="card kpi">
                            <span className="k-label">Statement balance</span>
                            <input
                                type="number"
                                step="0.01"
                                value={statement}
                                onChange={event => setStatement(event.target.value)}
                                placeholder="0.00"
                                aria-label="Statement closing balance"
                            />
                            <span className={`k-sub ${difference === 0 ? 'pos' : ''}`.trim()}>
                                {difference === null
                                    ? 'enter the closing balance'
                                    : difference === 0
                                        ? 'Matched'
                                        : `${fmtMoney(difference, reconcile.currency)} difference`}
                            </span>
                        </div>
                    </div>
                ) : <Empty message="Pick an account to start" />}
            </Card>

            <Card style={{ marginTop: 16 }}>
                <CardHead
                    title="Rows in this account"
                    subtitle={`${reconcileRows.length} transactions · cleared rows count toward the cleared balance`}
                    action={
                        <button className="btn sm" onClick={() => store.refresh()}>
                            <Icon name="refresh" /> Refresh
                        </button>
                    }
                />
                {reconcileRows.length ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>Cleared</th>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Note</th>
                                    <th className="t-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reconcileRows.map(row => (
                                    <tr key={row.id} className={row.cleared === 1 ? '' : 't-muted'}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={row.cleared === 1}
                                                disabled={busyId === row.id}
                                                onChange={event => toggle(row.id, event.target.checked)}
                                                aria-label={`Mark ${row.note || row.id} as cleared`}
                                            />
                                        </td>
                                        <td className="t-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                                        <td><span className={`badge ${row.type}`}>{row.type}</span></td>
                                        <td className="t-note">{row.note || '—'}</td>
                                        <td className="t-right t-num">
                                            {row.type === 'Income' ? '+' : row.type === 'Expense' ? '−' : ''}
                                            {fmtMoney(row.amount, row.currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty message="No transactions in this account" />}
            </Card>
        </>
    );
};
