import React, { useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { categoryService } from '../services/categoryService';
import type { Category, Transaction } from '../types';

interface CategoriesProps {
    categories: Category[];
    transactions: Transaction[];
    onAddCategory: (type: 'Expense' | 'Income') => void;
}

const Categories: React.FC<CategoriesProps> = ({ categories, transactions, onAddCategory }) => {
    const [activeType, setActiveType] = useState<'Expense' | 'Income'>('Expense');

    const filtered = categories.filter((c: Category) => c.type === activeType);

    const [deletingId, setDeletingId] = useState<string | null>(null);

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
                    <button
                        onClick={() => onAddCategory(activeType)}
                        className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform"
                    >
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
                            <button
                                disabled={!!deletingId}
                                onClick={async (e) => {
                                    e.stopPropagation();

                                    // Check if category is in use
                                    const isInUse = transactions.some(tx => tx.categoryId === cat.id);
                                    if (isInUse) {
                                        alert(`Cannot delete "${cat.name}" because it is being used in existing transactions. Please delete or reassing those transactions first.`);
                                        return;
                                    }

                                    if (window.confirm(`Delete ${cat.name} category?`)) {
                                        setDeletingId(cat.id);
                                        try {
                                            await categoryService.deleteCategory(cat.id);
                                        } catch (e) {
                                            console.error(e);
                                            alert("Failed to delete category");
                                        } finally {
                                            setDeletingId(null);
                                        }
                                    }
                                }}
                                className="w-9 h-9 rounded-xl bg-bg-primary border border-black/5 flex items-center justify-center text-text-muted hover:text-expense hover:bg-expense/5 transition-all disabled:opacity-50"
                            >
                                {deletingId === cat.id ? <div className="w-4 h-4 border-2 border-expense/20 border-t-expense rounded-full animate-spin"></div> : <Trash2 size={16} />}
                            </button>
                            <div className="w-9 h-9 rounded-xl bg-bg-primary border border-black/5 flex items-center justify-center text-text-muted">
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
