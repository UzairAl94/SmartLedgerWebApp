import React, { useState } from 'react';
import { Mic, ArrowUpRight, ArrowDownLeft, Plus, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { transactionService } from '../services/transactionService';
import { formatCurrency, convertCurrency } from '../utils/format';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { Account, Transaction, Category } from '../types';

interface DashboardProps {
    onAddTx: () => void;
    onViewAll: () => void;
    onVoiceResult: (text: string) => void;
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
}

const Dashboard: React.FC<DashboardProps> = ({ onAddTx, onViewAll, onVoiceResult, accounts, transactions, categories }) => {
    const { isRecording, isProcessing, startRecording, stopRecording } = useVoiceInput(onVoiceResult);
    const [showBalance, setShowBalance] = useState(false);
    // Use the first account's currency or PKR as default for summary
    const mainCurrency = accounts[0]?.currency || 'PKR';

    // Calculate Total Balance
    const totalBalance = accounts.reduce((acc: number, account: Account) => {
        return acc + convertCurrency(account.balance, account.currency, mainCurrency);
    }, 0);

    // Recent Transactions
    const recentTransactions = [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 4);

    // Calculate Income and Expenses
    const incomeTotal = transactions
        .filter(t => t.type === 'Income')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);

    const expenseTotal = transactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);

    return (
        <div className="flex flex-col gap-8 pb-8">
            <section className="bg-linear-to-br from-primary to-[#312e81] p-6 rounded-[2rem] text-white flex flex-col gap-2 shadow-[0_10_25_-5_rgba(79,70,229,0.4)]">
                <div className="flex justify-between items-center">
                    <span className="text-[14px] opacity-80 font-medium tracking-wide">Total Balance</span>
                    <button onClick={() => setShowBalance(!showBalance)} className="opacity-80 hover:opacity-100 active:scale-95 transition-all">
                        {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                <h2 className="text-[32px] font-bold tracking-tight mb-4 text-white">
                    {showBalance ? formatCurrency(totalBalance, mainCurrency) : '••••••••'}
                </h2>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex items-center gap-2 border border-white/10">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-income/20 text-income">
                            <ArrowDownLeft size={16} />
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase tracking-wider opacity-70">Income</span>
                            <strong className="text-[14px] block">
                                {formatCurrency(incomeTotal, mainCurrency)}
                            </strong>
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex items-center gap-2 border border-white/10">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-expense/20 text-expense">
                            <ArrowUpRight size={16} />
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase tracking-wider opacity-70">Expenses</span>
                            <strong className="text-[14px] block">
                                {formatCurrency(expenseTotal, mainCurrency)}
                            </strong>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-base font-semibold mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        className="flex flex-col items-center justify-center p-6 bg-primary-light text-primary rounded-2xl gap-2 font-semibold text-[14px] active:scale-95 transition-transform"
                        onClick={onAddTx}
                    >
                        <Plus size={24} />
                        <span>Add Transaction</span>
                    </button>
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isProcessing}
                        className={`flex flex-col items-center justify-center p-6 rounded-2xl gap-2 font-semibold text-[14px] active:scale-95 transition-all border border-black/5 ${isRecording ? 'bg-expense text-white shadow-lg shadow-expense/20 animate-pulse' : isProcessing ? 'bg-bg-secondary opacity-80' : 'bg-slate-50 text-text-secondary shadow-sm'}`}
                    >
                        {isProcessing ? (
                            <Loader2 size={24} className="animate-spin text-primary" />
                        ) : (
                            <Mic size={24} className={isRecording ? 'animate-bounce' : ''} />
                        )}
                        <span>{isRecording ? 'Stop' : isProcessing ? 'Processing...' : 'Voice Input'}</span>
                    </button>
                </div>
            </section>

            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-semibold">Recent Transactions</h3>
                    <button
                        onClick={onViewAll}
                        className="text-[13px] font-semibold text-primary active:scale-95 transition-transform px-2 py-1"
                    >
                        View All
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    {recentTransactions.map(tx => {
                        const category = tx.categoryId ? categories.find((c: Category) => c.id === tx.categoryId) : null;
                        const toAccount = tx.toAccountId ? accounts.find((a: Account) => a.id === tx.toAccountId) : null;

                        return (
                            <div key={tx.id} className="flex items-center p-4 bg-bg-secondary rounded-xl gap-4 shadow-sm">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tx.type === 'Transfer' ? 'bg-blue-50 text-blue-600' : ''}`} style={tx.type !== 'Transfer' ? { backgroundColor: category?.color + '20' } : undefined}>
                                    {tx.type === 'Transfer' ? (
                                        <div className="w-5 h-5 flex items-center justify-center font-bold">→</div>
                                    ) : (
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                    )}
                                </div>
                                <div className="flex-1 flex flex-col">
                                    <span className="font-semibold text-[14px]">
                                        {tx.type === 'Transfer'
                                            ? `Transfer to ${toAccount?.name || 'Unknown'}`
                                            : category?.name || 'Uncategorized'}
                                    </span>
                                    <span className="text-[12px] text-text-secondary">{tx.note}</span>
                                </div>
                                <div className={`font-bold text-[15px] ${tx.type === 'Income' ? 'text-income' : tx.type === 'Expense' ? 'text-text-primary' : 'text-blue-600'}`}>
                                    {tx.type === 'Income' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm("Delete this transaction? This will automatically update your account balance.")) {
                                            transactionService.deleteTransaction(tx);
                                        }
                                    }}
                                    className="w-9 h-9 rounded-xl bg-bg-primary flex items-center justify-center text-text-muted hover:text-expense transition-all border border-black/5"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
