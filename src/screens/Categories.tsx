import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { mockCategories } from '../mock/data';

const Categories: React.FC = () => {
    const [activeType, setActiveType] = useState<'Expense' | 'Income'>('Expense');

    const filtered = mockCategories.filter(c => c.type === activeType);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="bg-bg-secondary p-1 rounded-2xl flex border border-black/5 shadow-inner">
                <button
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${activeType === 'Expense' ? 'bg-white text-expense shadow-sm shadow-expense/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => setActiveType('Expense')}
                >
                    Expense
                </button>
                <button
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${activeType === 'Income' ? 'bg-white text-income shadow-sm shadow-income/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => setActiveType('Income')}
                >
                    Income
                </button>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-[16px] font-bold">{activeType} Categories</h3>
                    <button className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform">
                        <Plus size={18} />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {filtered.map(cat => (
                        <div key={cat.id} className="bg-white p-4 rounded-2xl flex items-center gap-4 border border-black/5 shadow-sm active:scale-[0.99] transition-all cursor-pointer">
                            <div
                                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                style={{ backgroundColor: cat.color + '20' }}
                            >
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }}></div>
                            </div>
                            <div className="flex-1">
                                <span className="block font-semibold text-[15px]">{cat.name}</span>
                                <span className="text-[12px] text-text-muted font-medium">Standard Category</span>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-bg-primary border border-black/5 flex items-center justify-center text-text-muted">
                                <Search size={14} strokeWidth={2.5} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Categories;
