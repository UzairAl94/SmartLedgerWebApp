import type { DesktopStore } from '../store';
import { CategoryDonut, IncomeExpenseChart } from '../charts';
import { fmtDate, fmtMoney } from '../format';
import { Card, CardHead, Empty, Icon, SkeletonPage } from '../ui';
import type { TransactionView } from '../types';

export const TransactionTable = ({
    rows,
    onEdit,
    onDelete,
    withActions,
}: {
    rows: TransactionView[];
    onEdit: (row: TransactionView) => void;
    onDelete: (row: TransactionView) => void;
    withActions?: boolean;
}) => (
    <div className="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th>Note</th>
                    <th className="t-right">Amount</th>
                    {withActions ? <th className="t-right">Actions</th> : null}
                </tr>
            </thead>
            <tbody>
                {rows.map(row => {
                    const masked = row.hidden === 1;
                    const sign = row.type === 'Income' ? '+' : row.type === 'Expense' ? '−' : '';
                    const tone = row.type === 'Income' ? 'pos' : row.type === 'Expense' ? 'neg' : '';
                    return (
                        <tr key={row.id}>
                            <td className="t-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                            <td><span className={`badge ${row.type}`}>{row.type}</span></td>
                            <td>
                                {row.accountName}
                                {row.toAccountName ? <span className="t-muted"> → {row.toAccountName}</span> : null}
                            </td>
                            <td>{row.categoryName || '—'}</td>
                            <td className="t-note" title={row.note || ''}>{row.note || '—'}</td>
                            <td className={`t-right t-num ${tone}`}>
                                {masked ? '•••' : `${sign}${fmtMoney(row.amount, row.currency)}`}
                                {row.fee ? <span className="t-muted"> +{fmtMoney(row.fee, row.currency)} fee</span> : null}
                            </td>
                            {withActions ? (
                                <td>
                                    <div className="t-actions">
                                        <button className="btn sm ghost" onClick={() => onEdit(row)} title="Edit"><Icon name="edit" /></button>
                                        <button className="btn sm ghost" onClick={() => onDelete(row)} title="Delete"><Icon name="trash" /></button>
                                    </div>
                                </td>
                            ) : null}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

export const DashboardView = ({
    store,
    onNewTransaction,
    onEdit,
    onDelete,
    onOpenAccounts,
    onOpenLedger,
}: {
    store: DesktopStore;
    onNewTransaction: () => void;
    onEdit: (row: TransactionView) => void;
    onDelete: (row: TransactionView) => void;
    onOpenAccounts: () => void;
    onOpenLedger: () => void;
}) => {
    const { dashboard, categories, accounts } = store;
    const currency = dashboard?.summary.currency || store.settings?.mainCurrency || 'PKR';

    if (!dashboard) return <SkeletonPage />;

    const { balances, summary, recent } = dashboard;
    const periods = summary.byPeriod.slice(-6);
    const expenseCategories = summary.byCategory.filter(item => item.type === 'Expense').slice(0, 6);
    const donutTotal = expenseCategories.reduce((sum, item) => sum + item.total, 0);

    const kpis: Array<[string, string, string, string, string]> = [
        ['Net worth', fmtMoney(balances.netWorth, balances.currency), `${balances.accounts.length} accounts`, 'wallet2', ''],
        ['Income', fmtMoney(summary.totals.income, currency), `${summary.totals.count} entries in range`, 'arrow-down', 'pos'],
        ['Expenses', fmtMoney(summary.totals.expense, currency), `fees ${fmtMoney(summary.totals.fees, currency)}`, 'arrow-up', 'neg'],
        ['Net flow', fmtMoney(summary.totals.net, currency), summary.totals.net >= 0 ? 'Surplus' : 'Deficit', 'grid', summary.totals.net >= 0 ? 'pos' : 'neg'],
    ];

    return (
        <>
            <div className="grid kpis">
                {kpis.map(([label, value, sub, iconName, tone]) => (
                    <div className="card kpi" key={label}>
                        <span className="k-icon"><Icon name={iconName} /></span>
                        <span className="k-label">{label}</span>
                        <span className={`k-value ${tone}`.trim()}>{value}</span>
                        <span className="k-sub">{sub}</span>
                    </div>
                ))}
            </div>

            <div className="grid two-col" style={{ marginTop: 16 }}>
                <Card>
                    <CardHead
                        title="Income vs expenses"
                        subtitle={periods.length ? `${periods[0].period} – ${periods[periods.length - 1].period}` : 'No data in range'}
                        action={<span className="chip">{currency}</span>}
                    />
                    {periods.length
                        ? <IncomeExpenseChart periods={periods} currency={currency} />
                        : <Empty message="No transactions in this range" />}
                    {periods.length ? (
                        <div className="legend">
                            <span><i style={{ background: 'var(--income)' }} />Income</span>
                            <span><i style={{ background: 'var(--expense)' }} />Expenses</span>
                        </div>
                    ) : null}
                </Card>
                <Card>
                    <CardHead title="Where it goes" subtitle="Expense split by category" />
                    {expenseCategories.length
                        ? <CategoryDonut items={expenseCategories} total={donutTotal} currency={currency} categories={categories} />
                        : <Empty message="No expenses in this range" />}
                </Card>
            </div>

            <Card style={{ marginTop: 16 }}>
                <CardHead
                    title="Accounts"
                    subtitle={`Converted to ${balances.currency}`}
                    action={<button className="btn sm ghost" onClick={onOpenAccounts}>View all <Icon name="arrow-up" /></button>}
                />
                <div className="grid cards-4" style={{ padding: '0 18px 18px' }}>
                    {balances.accounts.map(row => {
                        const account = accounts.find(item => item.id === row.id);
                        return (
                            <div className="acct-mini" key={row.id}>
                                <span className="acct-dot" style={{ color: (account && account.color) || 'var(--primary)' }}><Icon name="wallet" /></span>
                                <div>
                                    <b>{row.name}</b>
                                    <small>{row.currency} · {(account && account.type) || 'Account'}</small>
                                </div>
                                <span className={`amt ${row.balanceConverted < 0 ? 'neg' : ''}`.trim()}>{fmtMoney(row.balanceConverted, balances.currency)}</span>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card style={{ marginTop: 16 }}>
                <CardHead
                    title="Recent transactions"
                    subtitle="Newest entries in range"
                    action={
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn sm ghost" onClick={onOpenLedger}>Open ledger <Icon name="arrow-up" /></button>
                            <button className="btn sm" onClick={onNewTransaction}><Icon name="plus" /> Add</button>
                        </div>
                    }
                />
                {recent.length
                    ? <TransactionTable rows={recent} onEdit={onEdit} onDelete={onDelete} />
                    : <Empty message="No transactions yet" />}
            </Card>
        </>
    );
};
