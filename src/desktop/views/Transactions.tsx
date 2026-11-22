import type { DesktopStore } from '../store';
import { DatePicker } from '../DatePicker';
import { TransactionTable } from './Dashboard';
import { Card, Empty, Icon } from '../ui';
import type { TransactionView } from '../types';

export const TransactionsView = ({
    store,
    onEdit,
    onDelete,
}: {
    store: DesktopStore;
    onEdit: (row: TransactionView) => void;
    onDelete: (row: TransactionView) => void;
}) => {
    const { filters, accounts, categories, transactions, transactionTotal, transactionOffset } = store;
    const totalPages = Math.max(1, Math.ceil(transactionTotal / 25));
    const page = Math.floor(transactionOffset / 25) + 1;

    return (
        <Card>
            <div className="toolbar">
                <div className="field field-search">
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
                        <Icon name="search" className="icon" />
                    </span>
                    <input
                        type="text"
                        value={filters.q}
                        placeholder="Search notes, accounts, categories"
                        onChange={event => store.setFilters({ q: event.target.value })}
                        aria-label="Search transactions"
                    />
                </div>
                <label className="field">
                    <span>Type</span>
                    <select value={filters.type} onChange={event => store.setFilters({ type: event.target.value })}>
                        <option value="">All types</option>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                        <option value="transfer">Transfer</option>
                    </select>
                </label>
                <label className="field">
                    <span>Account</span>
                    <select value={filters.accountId} onChange={event => store.setFilters({ accountId: event.target.value })}>
                        <option value="">All accounts</option>
                        {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                </label>
                <label className="field">
                    <span>Category</span>
                    <select value={filters.categoryId} onChange={event => store.setFilters({ categoryId: event.target.value })}>
                        <option value="">All categories</option>
                        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                </label>
                <div className="field">
                    <span>From</span>
                    <DatePicker
                        value={filters.from}
                        onChange={value => store.setFilters({ from: value })}
                        placeholder="Any date"
                        clearable
                        label="From date"
                    />
                </div>
                <div className="field">
                    <span>To</span>
                    <DatePicker
                        value={filters.to}
                        onChange={value => store.setFilters({ to: value })}
                        placeholder="Any date"
                        clearable
                        label="To date"
                    />
                </div>
                <button
                    className="btn ghost"
                    onClick={() =>
                        store.setFilters({ q: '', type: '', accountId: '', categoryId: '', from: '', to: '', order: 'desc' })
                    }
                >
                    Clear
                </button>
            </div>

            {transactions.length
                ? <TransactionTable rows={transactions} withActions onEdit={onEdit} onDelete={onDelete} />
                : <Empty message="No transactions match these filters" />}

            <div className="pager">
                <span>{transactionTotal} transactions · page {page} of {totalPages}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="t-muted">Sort</span>
                    <select
                        value={filters.order}
                        onChange={event => store.setFilters({ order: event.target.value as 'asc' | 'desc' })}
                        aria-label="Sort order"
                        style={{ width: 130 }}
                    >
                        <option value="desc">Newest first</option>
                        <option value="asc">Oldest first</option>
                    </select>
                    <button className="btn sm" disabled={page <= 1} onClick={() => store.setPage(Math.max(0, transactionOffset - 25))}>
                        Previous
                    </button>
                    <button className="btn sm" disabled={page >= totalPages} onClick={() => store.setPage(transactionOffset + 25)}>
                        Next
                    </button>
                </div>
            </div>
        </Card>
    );
};
