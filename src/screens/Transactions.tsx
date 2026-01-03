import React from 'react';
import { Search, Filter } from 'lucide-react';
import { mockTransactions, mockCategories } from '../mock/data';
import { formatCurrency } from '../utils/format';

const Transactions: React.FC = () => {
    return (
        <div className="flex flex-col gap-6 pb-8">
            <header className="flex flex-col gap-4">
                <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-black/5 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <Search size={18} className="text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        className="flex-1 bg-transparent border-none outline-none text-[14px] placeholder:text-text-muted"
                    />
                    <button className="p-1 text-text-secondary active:scale-90 transition-transform">
                        <Filter size={18} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-income/5 p-4 rounded-2xl border border-income/10 block">
                        <span className="text-[10px] uppercase font-bold text-income tracking-wider">Total Income</span>
                        <h4 className="text-[17px] font-bold text-income">{formatCurrency(150000, 'PKR')}</h4>
                    </div>
                    <div className="bg-expense/5 p-4 rounded-2xl border border-expense/10 block">
                        <span className="text-[10px] uppercase font-bold text-expense tracking-wider">Total Spent</span>
                        <h4 className="text-[17px] font-bold text-expense">{formatCurrency(24500, 'PKR')}</h4>
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-6">
                <div>
                    <h5 className="text-[12px] font-bold text-text-muted uppercase tracking-widest mb-3 px-1">Today, Dec 31</h5>
                    <div className="flex flex-col gap-2">
                        {mockTransactions.slice(0, 4).map(tx => {
                            const category = mockCategories.find(c => c.id === tx.categoryId);
                            return (
                                <div key={tx.id} className="flex items-center p-4 bg-bg-secondary rounded-2xl gap-4 border border-black/5 shadow-sm active:scale-[0.99] transition-all">
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-bg-primary border border-black/5">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                    </div>
                                    <div className="flex-1">
                                        <span className="block font-semibold text-[14px]">{category?.name}</span>
                                        <span className="text-[12px] text-text-muted">HBL Bank</span>
                                    </div>
                                    <div className={`font-bold text-[15px] ${tx.type === 'Income' ? 'text-income' : 'text-text-primary'}`}>
                                        {tx.type === 'Income' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Transactions;
