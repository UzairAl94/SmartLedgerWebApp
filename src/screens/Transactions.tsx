import React, { useState, useEffect } from 'react';
import { Search, Pencil, ChevronDown, Calendar, Filter, SlidersHorizontal, Download, X, Paperclip } from 'lucide-react';
import { transactionService } from '../services/transactionService';
import { receiptService } from '../services/receiptService';
import { formatCurrency, convertCurrency } from '../utils/format';
import BottomSheet from '../components/ui/BottomSheet';
import type { Transaction, Category, Account, UserSettings } from '../types';
import { isToday, isYesterday, format, subDays, isAfter, parseISO } from 'date-fns';

interface TransactionsProps {
    categories: Category[];
    accounts: Account[];
    accountFilter?: string | null;
    setAccountFilter?: (id: string | null) => void;
    settings: UserSettings | null;
    onEditTx: (tx: Transaction) => void;
}

type DateRange = '7days' | '30days' | 'all';

const Transactions: React.FC<TransactionsProps> = ({ categories, accounts, accountFilter, setAccountFilter, settings, onEditTx }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'All' | 'Income' | 'Expense' | 'Transfer'>('All');
    const [dateRange, setDateRange] = useState<DateRange>('7days');
    const [detailTx, setDetailTx] = useState<Transaction | null>(null);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const mainCurrency = settings?.mainCurrency || 'PKR';

    // Operate on the FULL transaction list, not the 50-capped subscription.
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    useEffect(() => {
        const load = () => transactionService.getAllTransactions().then(setTransactions);
        load();
        const unsub = transactionService.subscribeToTransactions(() => load());
        return unsub;
    }, []);

    // Load the receipt preview for the open details dialog.
    const [detailReceiptSrc, setDetailReceiptSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!detailTx?.receiptPath) { setDetailReceiptSrc(null); return; }
        let cancelled = false;
        receiptService.displaySrc(detailTx.receiptPath).then(src => { if (!cancelled) setDetailReceiptSrc(src); }).catch(() => {});
        return () => { cancelled = true; };
    }, [detailTx]);

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

    // 3. Filter by Type, Category, Amount & Search
    const min = parseFloat(minAmount);
    const max = parseFloat(maxAmount);
    const finalTransactions = accountFilteredTransactions.filter(tx => {
        if (filterType !== 'All' && tx.type !== filterType) return false;
        if (categoryFilter && tx.categoryId !== categoryFilter) return false;
        if (!isNaN(min) && tx.amount < min) return false;
        if (!isNaN(max) && tx.amount > max) return false;

        const q = searchQuery.toLowerCase();
        if (!q) return true;
        return (
            tx.note?.toLowerCase().includes(q) ||
            (tx.type !== 'Transfer' && categories.find((c: Category) => c.id === tx.categoryId)?.name.toLowerCase().includes(q)) ||
            (tx.type === 'Transfer' && 'transfer'.includes(q))
        );
    });

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
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0);

    const expenseTotal = finalTransactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0);

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

                <div className="flex gap-2 items-center">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar flex-1">
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
                    <button
                        onClick={() => setShowAdvanced(s => !s)}
                        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-all ${showAdvanced || categoryFilter || minAmount || maxAmount ? 'bg-primary text-white border-primary' : 'bg-bg-secondary text-text-muted border-black/5'}`}
                        title="More filters"
                    >
                        <SlidersHorizontal size={16} />
                    </button>
                </div>

                {showAdvanced && (
                    <div className="flex flex-col gap-3 p-3 bg-bg-secondary rounded-2xl border border-black/5">
                        <div className="relative">
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="w-full appearance-none bg-bg-primary border border-black/5 pl-3 pr-8 py-2.5 rounded-xl text-[13px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">All Categories</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                        <div className="flex gap-2 items-center">
                            <input
                                type="number"
                                placeholder="Min amount"
                                value={minAmount}
                                onChange={(e) => setMinAmount(e.target.value)}
                                className="flex-1 bg-bg-primary border border-black/5 p-2.5 rounded-xl text-[13px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <span className="text-text-muted text-[13px]">–</span>
                            <input
                                type="number"
                                placeholder="Max amount"
                                value={maxAmount}
                                onChange={(e) => setMaxAmount(e.target.value)}
                                className="flex-1 bg-bg-primary border border-black/5 p-2.5 rounded-xl text-[13px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        {(categoryFilter || minAmount || maxAmount) && (
                            <button
                                onClick={() => { setCategoryFilter(''); setMinAmount(''); setMaxAmount(''); }}
                                className="text-[12px] font-semibold text-primary self-start"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                )}

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
                                        <div
                                            key={tx.id}
                                            onClick={() => setDetailTx(tx)}
                                            className="flex items-center p-4 bg-bg-secondary rounded-2xl gap-4 border border-black/5 shadow-sm active:scale-[0.98] transition-all cursor-pointer hover:border-primary/20"
                                        >
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
                                                    {tx.fee ? (
                                                        <span className="text-[10px] text-expense font-bold">
                                                            Fee: {formatCurrency(tx.fee, tx.currency)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className={`font-bold text-[15px] ${tx.type === 'Income' ? 'text-income' : tx.type === 'Expense' ? 'text-text-primary' : 'text-blue-600'}`}>
                                                {tx.type === 'Income' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEditTx(tx);
                                                }}
                                                className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-text-muted hover:text-primary transition-all border border-black/5 shadow-xs"
                                                title="Edit transaction"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <BottomSheet isOpen={!!detailTx} onClose={() => setDetailTx(null)} title="Transaction Details">
                {detailTx && (() => {
                    const cat = detailTx.categoryId ? categories.find(c => c.id === detailTx.categoryId) : null;
                    const acc = accounts.find(a => a.id === detailTx.accountId);
                    const toAcc = detailTx.toAccountId ? accounts.find(a => a.id === detailTx.toAccountId) : null;
                    const sign = detailTx.type === 'Income' ? '+' : detailTx.type === 'Expense' ? '-' : '';
                    const amountColor = detailTx.type === 'Income' ? 'text-income' : detailTx.type === 'Transfer' ? 'text-blue-600' : 'text-text-primary';

                    const Row = ({ label, value }: { label: string; value: string }) => (
                        <div className="flex justify-between items-center py-3 border-b border-black/5 last:border-0">
                            <span className="text-[13px] font-medium text-text-muted">{label}</span>
                            <span className="text-[14px] font-semibold text-text-primary text-right">{value}</span>
                        </div>
                    );

                    return (
                        <div className="flex flex-col gap-5 pb-2">
                            <div className="bg-bg-primary p-6 rounded-2xl flex flex-col items-center gap-1 border border-black/5">
                                <span className={`text-[28px] font-bold ${amountColor}`}>{sign} {formatCurrency(detailTx.amount, detailTx.currency)}</span>
                                <span className="text-[12px] font-bold uppercase tracking-widest text-text-muted">{detailTx.type}</span>
                            </div>

                            <div className="bg-white rounded-2xl border border-black/5 px-4">
                                {detailTx.type !== 'Transfer' && <Row label="Category" value={cat?.name || 'Uncategorized'} />}
                                <Row label={detailTx.type === 'Transfer' ? 'From' : 'Account'} value={acc?.name || 'Unknown'} />
                                {toAcc && <Row label="To" value={toAcc.name} />}
                                <Row label="Date" value={format(parseISO(detailTx.date), 'EEE, dd MMM yyyy')} />
                                {detailTx.fee ? <Row label="Fee" value={formatCurrency(detailTx.fee, detailTx.currency)} /> : null}
                                {detailTx.note ? <Row label="Note" value={detailTx.note} /> : null}
                            </div>

                            {detailTx.receiptPath && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Receipt</span>
                                    <div className="flex items-center gap-3 bg-white border border-black/5 p-3 rounded-2xl">
                                        {detailReceiptSrc ? (
                                            <img
                                                src={detailReceiptSrc}
                                                alt="Receipt"
                                                onClick={() => setLightbox(detailReceiptSrc)}
                                                className="w-16 h-16 rounded-xl object-cover border border-black/5 cursor-pointer active:scale-95 transition-transform"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 rounded-xl bg-bg-primary flex items-center justify-center text-text-muted">
                                                <Paperclip size={20} />
                                            </div>
                                        )}
                                        <span className="flex-1 text-[13px] font-semibold text-text-secondary">Tap image to view</span>
                                        <button
                                            onClick={() => receiptService.download(detailTx.receiptPath!)}
                                            className="w-10 h-10 rounded-xl bg-bg-primary flex items-center justify-center text-primary active:scale-95 transition-all"
                                            title="Download receipt"
                                        >
                                            <Download size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => { const t = detailTx; setDetailTx(null); onEditTx(t); }}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Pencil size={18} /> Edit Transaction
                            </button>
                        </div>
                    );
                })()}
            </BottomSheet>

            {lightbox && (
                <div
                    onClick={() => setLightbox(null)}
                    className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4"
                >
                    <button
                        onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
                    >
                        <X size={22} />
                    </button>
                    <img src={lightbox} alt="Receipt" className="max-w-full max-h-full object-contain rounded-xl" />
                </div>
            )}
        </div>
    );
};

export default Transactions;
