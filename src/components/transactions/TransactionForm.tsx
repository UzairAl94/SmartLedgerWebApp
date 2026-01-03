import React, { useState } from 'react';
import { mockCategories, mockAccounts } from '../../mock/data';
import type { TransactionType } from '../../types';

interface TransactionFormProps {
    onSuccess: () => void;
}

const TransactionForm: React.FC<TransactionFormProps> = ({ onSuccess }) => {
    const [type, setType] = useState<TransactionType>('Expense');

    return (
        <div className="flex flex-col gap-6">
            <div className="bg-bg-primary p-1 rounded-2xl flex border border-black/5">
                <button
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${type === 'Expense' ? 'bg-white text-expense shadow-sm shadow-expense/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => setType('Expense')}
                >
                    Expense
                </button>
                <button
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${type === 'Income' ? 'bg-white text-income shadow-sm shadow-income/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => setType('Income')}
                >
                    Income
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Amount</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-text-muted">PKR</span>
                    <input
                        type="number"
                        placeholder="0"
                        className="w-full bg-white border border-black/5 p-4 pl-14 rounded-2xl text-[24px] font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-200"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Category</label>
                    <select className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer">
                        {mockCategories.filter(c => c.type === type).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Account</label>
                    <select className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer">
                        {mockAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Note</label>
                <input
                    type="text"
                    placeholder="What was this for?"
                    className="w-full bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300"
                />
            </div>

            <button
                onClick={onSuccess}
                className="w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-95 transition-all mt-4"
            >
                Save Transaction
            </button>
        </div>
    );
};

export default TransactionForm;
