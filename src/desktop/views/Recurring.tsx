import type { RecurringTransaction } from '../../types';
import { fmtDate, fmtMoney } from '../format';
import type { DesktopStore } from '../store';
import { Card, Empty, Icon } from '../ui';

export const RecurringView = ({
    store,
    onNew,
    onToggle,
    onDelete,
}: {
    store: DesktopStore;
    onNew: () => void;
    onToggle: (rule: RecurringTransaction, active: boolean) => void;
    onDelete: (rule: RecurringTransaction) => void;
}) => {
    const { recurring, accounts, categories } = store;

    if (recurring.length === 0) {
        return (
            <Card>
                <Empty message="No recurring rules yet" />
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 20 }}>
                    <button className="btn" onClick={onNew}><Icon name="plus" /> Add a rule</button>
                </div>
            </Card>
        );
    }

    const accountName = (id: string) => (accounts.find(account => account.id === id) || { name: 'Unknown' }).name;
    const categoryName = (id?: string) => (id ? (categories.find(category => category.id === id) || { name: '—' }).name : '—');

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title">
                    {recurring.filter(rule => rule.active).length} active of {recurring.length}
                </div>
                <button className="btn sm" onClick={onNew}><Icon name="plus" /> New rule</button>
            </div>
            <Card className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Next run</th>
                            <th>Type</th>
                            <th>Account</th>
                            <th>Category</th>
                            <th>Frequency</th>
                            <th>Note</th>
                            <th className="t-right">Amount</th>
                            <th className="t-right">Active</th>
                            <th className="t-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recurring.map(rule => (
                            <tr key={rule.id}>
                                <td className="t-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(rule.nextRunDate)}</td>
                                <td><span className={`badge ${rule.type}`}>{rule.type}</span></td>
                                <td>
                                    {accountName(rule.accountId)}
                                    {rule.toAccountId ? ` → ${accountName(rule.toAccountId)}` : ''}
                                </td>
                                <td>{categoryName(rule.categoryId)}</td>
                                <td className="t-muted">{rule.frequency}</td>
                                <td className="t-note">{rule.note || '—'}</td>
                                <td className="t-right t-num">{fmtMoney(rule.amount, rule.currency)}</td>
                                <td className="t-right">
                                    <button
                                        className={`btn sm ${rule.active ? '' : 'ghost'}`.trim()}
                                        onClick={() => onToggle(rule, rule.active === 1)}
                                    >
                                        {rule.active ? <><Icon name="check" /> On</> : 'Paused'}
                                    </button>
                                </td>
                                <td>
                                    <div className="t-actions">
                                        <button className="btn sm ghost" onClick={() => onDelete(rule)} title="Delete rule"><Icon name="trash" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </>
    );
};
