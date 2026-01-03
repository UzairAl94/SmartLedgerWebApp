import React, { useState } from 'react';
import { Plus, Banknote } from 'lucide-react';
import { mockAccounts, mockSettings, mockTransactions, mockCategories } from '../mock/data';
import { formatCurrency, convertCurrency } from '../utils/format';
import type { Account } from '../types';
import BottomSheet from '../components/ui/BottomSheet';

const Accounts: React.FC = () => {
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const mainCurrency = mockSettings.mainCurrency;

    const totalNetWorth = mockAccounts.reduce((sum, acc) => {
        return sum + convertCurrency(acc.balance, acc.currency, mainCurrency);
    }, 0);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <section className="bg-white p-6 rounded-3xl shadow-premium flex flex-col items-center text-center gap-1 border border-black/5">
                <span className="text-[12px] text-text-muted uppercase tracking-widest font-bold">Total Net Worth</span>
                <h2 className="text-[28px] font-bold text-text-primary">{formatCurrency(totalNetWorth, mainCurrency)}</h2>
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-[16px] font-bold">Your Accounts</h3>
                    <button className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform">
                        <Plus size={18} />
                    </button>
                </div>

                <div className="flex flex-col gap-3">
                    {mockAccounts.map((account) => (
                        <div
                            key={account.id}
                            className="bg-bg-secondary p-4 rounded-2xl flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer border border-black/5"
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
                </div>
            </section>

            <BottomSheet
                isOpen={!!selectedAccount}
                onClose={() => setSelectedAccount(null)}
                title="Account Details"
            >
                {selectedAccount && (
                    <div className="flex flex-col gap-6">
                        <div className="bg-bg-primary p-6 rounded-2xl flex flex-col items-center gap-2 border border-black/5">
                            <span className="text-[12px] text-text-muted font-bold tracking-wider uppercase">Current Balance</span>
                            <h3 className="text-[32px] font-bold text-text-primary">{formatCurrency(selectedAccount.balance, selectedAccount.currency)}</h3>
                            <div className="px-3 py-1 bg-white rounded-full text-[12px] font-bold text-text-secondary border border-black/5">
                                Initial: {formatCurrency(selectedAccount.initialBalance, selectedAccount.currency)}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <h4 className="text-[15px] font-bold px-1">Recent Activity</h4>
                            <div className="flex flex-col gap-2">
                                {mockTransactions
                                    .filter(t => t.accountId === selectedAccount.id)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .slice(0, 3)
                                    .map(tx => {
                                        const category = mockCategories.find(c => c.id === tx.categoryId);
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

                        <button className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all">
                            Edit Account
                        </button>
                    </div>
                )}
            </BottomSheet>
        </div>
    );
};

export default Accounts;
