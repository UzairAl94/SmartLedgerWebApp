import type { Account } from '../../types';
import { convert, fmtMoney } from '../format';
import type { DesktopStore } from '../store';
import { Card, Empty, Icon } from '../ui';

export const AccountsView = ({
    store,
    onNew,
    onEdit,
    onDelete,
    onViewTransactions,
}: {
    store: DesktopStore;
    onNew: () => void;
    onEdit: (account: Account) => void;
    onDelete: (account: Account) => void;
    onViewTransactions: (account: Account) => void;
}) => {
    const { accounts, settings } = store;
    const main = (settings?.mainCurrency as Account['currency']) || 'PKR';

    return (
        <div className="grid cards-2">
            {accounts.map(account => (
                <Card className="card-pad" key={account.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <span className="acct-dot" style={{ color: account.color || 'var(--primary)', fontSize: 16 }}>
                            <Icon name="wallet" />
                        </span>
                        <div className="grow">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <b style={{ fontSize: 15 }}>{account.name}</b>
                                <span className="chip">{account.type}</span>
                            </div>
                            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                                Opening balance {fmtMoney(account.initialBalance, account.currency)}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 19, fontWeight: 650 }} className={account.balance < 0 ? 'neg' : ''}>
                                {fmtMoney(account.balance, account.currency)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {account.currency === main
                                    ? 'ledger currency'
                                    : `≈ ${fmtMoney(convert(account.balance, account.currency, main, settings), main)}`}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <button className="btn sm" onClick={() => onEdit(account)}><Icon name="edit" /> Edit</button>
                        <button className="btn sm ghost" onClick={() => onViewTransactions(account)}>View transactions</button>
                        <span className="grow" />
                        <button className="btn sm danger" onClick={() => onDelete(account)} title="Delete account"><Icon name="trash" /></button>
                    </div>
                </Card>
            ))}
            <button
                className="card card-pad"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    justifyContent: 'center',
                    borderStyle: 'dashed',
                    color: 'var(--text-2)',
                    background: 'transparent',
                    minHeight: 120,
                }}
                onClick={onNew}
            >
                <Icon name="plus" /> Add account
            </button>
            {accounts.length === 0 ? <Empty message="No accounts yet — add the first one" /> : null}
        </div>
    );
};
