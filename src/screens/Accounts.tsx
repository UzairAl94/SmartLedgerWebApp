import React, { useState } from 'react';
import { Plus, Banknote, Trash2 } from 'lucide-react';
import { accountService } from '../services/accountService';
import { formatCurrency, convertCurrency } from '../utils/format';
import type { Account, Transaction, Category } from '../types';
import BottomSheet from '../components/ui/BottomSheet';

interface AccountsProps {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    onAddAccount: () => void;
    onViewHistory: (accountId: string) => void;
}

const Accounts: React.FC<AccountsProps> = ({ accounts, transactions, categories, onAddAccount, onViewHistory }) => {
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const mainCurrency = accounts[0]?.currency || 'PKR';

    // Calculate Net Worth
    const netWorth = accounts.reduce((sum: number, acc: Account) => sum + convertCurrency(acc.balance, acc.currency, mainCurrency), 0);

    const [isDeleting, setIsDeleting] = useState(false);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <section className="bg-white p-6 rounded-3xl shadow-premium flex flex-col items-center text-center gap-1 border border-black/5">
                <span className="text-[12px] text-text-muted uppercase tracking-widest font-bold">Total Net Worth</span>
                <h2 className="text-[28px] font-bold text-text-primary">{formatCurrency(netWorth, mainCurrency)}</h2>
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-[16px] font-bold">Your Accounts</h3>
                    <button
                        onClick={onAddAccount}
                        className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <Plus size={18} />
                    </button>
                </div>

                <section className="flex flex-col gap-4">
                    {accounts.map((account: Account) => (
                        <div
                            key={account.id}
                            className="p-5 bg-bg-secondary rounded-[2rem] border border-black/5 flex items-center gap-4 active:scale-98 transition-all shadow-sm"
                            onClick={() => setSelectedAccount(account)}
                        >
                            <div className="w-12 h-12 rounded-xl bg-bg-primary flex items-center justify-center text-primary border border-black/5">
                                <Banknote size={24} strokeWidth={1.5} />
                            </div>
                            <div className="flex-1">
                                <span className="block font-semibold text-[15px]">{account.name}</span>
                                <span className="text-[12px] text-text-muted font-medium">{account.type}</span>
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-[15px]">{formatCurrency(account.balance, account.currency)}</span>
                                {account.currency !== mainCurrency && (
                                    <span className="text-[11px] text-text-muted font-medium">
                                        ≈ {formatCurrency(convertCurrency(account.balance, account.currency, mainCurrency), mainCurrency)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </section>
            </section>

            <BottomSheet
                isOpen={!!selectedAccount}
                onClose={() => !isDeleting && setSelectedAccount(null)}
                title="Account Details"
            >
                {selectedAccount && (
                    <div className="flex flex-col gap-6 font-inter">
                        <div className="bg-bg-primary p-6 rounded-2xl flex flex-col items-center gap-2 border border-black/5">
                            <span className="text-[12px] text-text-muted font-bold tracking-wider uppercase">Current Balance</span>
                            <h3 className="text-[32px] font-bold text-text-primary">{formatCurrency(selectedAccount.balance, selectedAccount.currency)}</h3>
                            <div className="px-3 py-1 bg-white rounded-full text-[12px] font-bold text-text-secondary border border-black/5">
                                Initial: {formatCurrency(selectedAccount.initialBalance, selectedAccount.currency)}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center px-1">
                                <h4 className="text-[15px] font-bold">Recent Activity</h4>
                                <button
                                    onClick={() => {
                                        onViewHistory(selectedAccount.id);
                                        setSelectedAccount(null);
                                    }}
                                    className="text-[13px] font-semibold text-primary active:scale-95 transition-transform"
                                >
                                    View All
                                </button>
                            </div>

                            <div className="flex flex-col gap-3">
                                {transactions
                                    .filter((t: Transaction) => t.accountId === selectedAccount.id)
                                    .sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .slice(0, 5)
                                    .map((tx: Transaction) => {
                                        const category = categories.find((c: Category) => c.id === tx.categoryId);
                                        return (
                                            <div key={tx.id} className="flex items-center p-3 bg-white rounded-xl gap-3 border border-black/5">
                                                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: category?.color + '15' }}>
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                                </div>
                                                <div className="flex-1">
                                                    <span className="block text-[13px] font-semibold">{category?.name}</span>
                                                    <span className="text-[11px] text-text-muted">{tx.date}</span>
                                                </div>
                                                <div className={`text-[13px] font-bold ${tx.type === 'Income' ? 'text-income' : 'text-text-primary'}`}>
                                                    {tx.type === 'Income' ? '+' : '-'} {tx.amount}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                disabled={isDeleting}
                                className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                            >
                                Edit Account
                            </button>
                            <button
                                disabled={isDeleting}
                                onClick={async () => {
                                    if (window.confirm("Are you sure you want to delete this account? All transactions linked to it will remain but may cause calculation issues.")) {
                                        setIsDeleting(true);
                                        try {
                                            await accountService.deleteAccount(selectedAccount.id);
                                            setSelectedAccount(null);
                                        } catch (e) {
                                            console.error(e);
                                            alert("Failed to delete account");
                                        } finally {
                                            setIsDeleting(false);
                                        }
                                    }
                                }}
                                className="w-14 h-14 flex items-center justify-center bg-expense/10 text-expense rounded-2xl active:scale-95 transition-all shadow-sm disabled:opacity-50"
                                title="Delete Account"
                            >
                                {isDeleting ? <div className="w-5 h-5 border-2 border-expense/20 border-t-expense rounded-full animate-spin"></div> : <Trash2 size={24} />}
                            </button>
                        </div>
                    </div>
                )}
            </BottomSheet>
        </div>
    );
};

export default Accounts;
