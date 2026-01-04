import React, { useState } from 'react';
import { Search, Trash2, ChevronDown, Calendar, Filter } from 'lucide-react';
import { transactionService } from '../services/transactionService';
import { formatCurrency, convertCurrency } from '../utils/format';
import type { Transaction, Category, Account } from '../types';
import { isToday, isYesterday, format, subDays, isAfter, parseISO } from 'date-fns';

interface TransactionsProps {
    transactions: Transaction[];
    categories: Category[];
    accounts: Account[];
    accountFilter?: string | null;
    setAccountFilter?: (id: string | null) => void;
}

type DateRange = '7days' | '30days' | 'all';

const Transactions: React.FC<TransactionsProps> = ({ transactions, categories, accounts, accountFilter, setAccountFilter }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'All' | 'Income' | 'Expense' | 'Transfer'>('All');
    const [dateRange, setDateRange] = useState<DateRange>('7days');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const mainCurrency = 'PKR';

    // 1. Filter by Date Range
    const dateFilteredTransactions = transactions.filter(t => {
        if (dateRange === 'all') return true;
        const txDate = parseISO(t.date);
        const cutoffDate = subDays(new Date(), dateRange === '7days' ? 7 : 30);
        return isAfter(txDate, cutoffDate);
    });

    // 2. Filter by Account
    const accountFilteredTransactions = accountFilter
        ? dateFilteredTransactions.filter(t => t.accountId === accountFilter || t.toAccountId === accountFilter)
        : dateFilteredTransactions;

    // 3. Filter by Type & Search
    const finalTransactions = accountFilteredTransactions.filter(tx =>
        (filterType === 'All' || tx.type === filterType) &&
        (tx.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (tx.type !== 'Transfer' && categories.find((c: Category) => c.id === tx.categoryId)?.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (tx.type === 'Transfer' && 'transfer'.includes(searchQuery.toLowerCase()))
        )
    );

    // Group Transactions by Date
    const groupedTransactions: Record<string, Transaction[]> = {};
    finalTransactions.forEach(tx => {
        const date = parseISO(tx.date);
        let dateKey = format(date, 'EEE, dd MMM yyyy');
        if (isToday(date)) dateKey = 'Today';
        if (isYesterday(date)) dateKey = 'Yesterday';

        if (!groupedTransactions[dateKey]) {
            groupedTransactions[dateKey] = [];
        }
        groupedTransactions[dateKey].push(tx);
    });

    const incomeTotal = finalTransactions
        .filter(t => t.type === 'Income')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);

    const expenseTotal = finalTransactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);

    return (
        <div className="flex flex-col gap-4 pb-8 h-full">
            <header className="flex flex-col gap-4 bg-bg-primary sticky top-0 z-10 pt-2 pb-2">
                <div className="flex gap-2 items-center overflow-x-auto pb-1 scrollbar-none">
                    {/* Account Filter Dropdown */}
                    <div className="relative group shrink-0 p-1">
                        <select
                            value={accountFilter || ''}
                            onChange={(e) => setAccountFilter?.(e.target.value || null)}
                            className="appearance-none bg-white border border-black/5 pl-3 pr-8 py-2 rounded-xl text-[13px] font-bold text-text-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm min-w-[140px]"
                        >
                            <option value="">All Accounts</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>

                    {/* Date Range Dropdown */}
                    <div className="relative group shrink-0 p-1">
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value as DateRange)}
                            className="appearance-none bg-white border border-black/5 pl-9 pr-8 py-2 rounded-xl text-[13px] font-bold text-text-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        >
                            <option value="7days">Last 7 Days</option>
                            <option value="30days">Last 30 Days</option>
                            <option value="all">All Time</option>
                        </select>
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        className="w-full pl-12 pr-4 py-3.5 bg-bg-secondary rounded-2xl border border-black/5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[15px] shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                    {['All', 'Income', 'Expense', 'Transfer'].map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type as any)}
                            className={`px-5 py-2 rounded-full text-[12px] font-bold whitespace-nowrap transition-all border ${filterType === type ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-bg-secondary text-text-muted border-black/5 hover:border-text-muted'}`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-income/5 p-3 rounded-2xl border border-income/10 block">
                        <span className="text-[10px] uppercase font-bold text-income tracking-wider">Income</span>
                        <h4 className="text-[16px] font-bold text-income">{formatCurrency(incomeTotal, mainCurrency)}</h4>
                    </div>
                    <div className="bg-expense/5 p-3 rounded-2xl border border-expense/10 block">
                        <span className="text-[10px] uppercase font-bold text-expense tracking-wider">Spent</span>
                        <h4 className="text-[16px] font-bold text-expense">{formatCurrency(expenseTotal, mainCurrency)}</h4>
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-6">
                {Object.entries(groupedTransactions).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted">
                        <Filter size={48} className="mb-4 opacity-20" />
                        <p className="text-[15px] font-medium">No transactions found</p>
                        <p className="text-[13px]">Try changing your filters</p>
                    </div>
                ) : (
                    Object.entries(groupedTransactions).map(([dateLabel, txs]) => (
                        <div key={dateLabel}>
                            <h5 className="text-[12px] font-bold text-text-muted uppercase tracking-widest mb-3 px-1 sticky top-[240px] z-0">{dateLabel}</h5>
                            <div className="flex flex-col gap-2">
                                {txs.map((tx: Transaction) => {
                                    const category = tx.categoryId ? categories.find((c: Category) => c.id === tx.categoryId) : null;
                                    const account = accounts.find((a: Account) => a.id === tx.accountId);
                                    const toAccount = tx.toAccountId ? accounts.find((a: Account) => a.id === tx.toAccountId) : null;

                                    return (
                                        <div key={tx.id} className="flex items-center p-4 bg-bg-secondary rounded-2xl gap-4 border border-black/5 shadow-sm active:scale-[0.99] transition-all">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border border-black/5 ${tx.type === 'Transfer' ? 'bg-blue-50 text-blue-600' : 'bg-bg-primary'}`}>
                                                {tx.type === 'Transfer' ? (
                                                    <div className="w-5 h-5 flex items-center justify-center">→</div>
                                                ) : (
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <span className="block font-semibold text-[14px]">
                                                    {tx.type === 'Transfer'
                                                        ? `Transfer to ${toAccount?.name || 'Unknown'}`
                                                        : category?.name || 'Uncategorized'}
                                                </span>
                                                <div className="flex gap-1.5 items-center mt-0.5">
                                                    <span className="text-[11px] text-text-muted font-medium bg-black/5 px-1.5 py-0.5 rounded-md">
                                                        {account?.name || 'Unknown'}
                                                    </span>
                                                    {tx.fee ? <span className="text-[10px] text-expense font-bold">Fee: {formatCurrency(tx.fee, tx.currency)}</span> : null}
                                                </div>
                                            </div>
                                            <div className={`font-bold text-[15px] ${tx.type === 'Income' ? 'text-income' : tx.type === 'Expense' ? 'text-text-primary' : 'text-blue-600'}`}>
                                                {tx.type === 'Income' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                            </div>
                                            <button
                                                disabled={!!deletingId}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm("Delete this transaction? This will automatically update your account balance.")) {
                                                        setDeletingId(tx.id);
                                                        try {
                                                            await transactionService.deleteTransaction(tx);
                                                        } catch (e) {
                                                            console.error(e);
                                                            alert("Failed to delete transaction");
                                                        } finally {
                                                            setDeletingId(null);
                                                        }
                                                    }
                                                }}
                                                className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-text-muted hover:text-expense transition-all border border-black/5 shadow-xs disabled:opacity-50"
                                            >
                                                {deletingId === tx.id ? <div className="w-4 h-4 border-2 border-expense/20 border-t-expense rounded-full animate-spin"></div> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Transactions;
