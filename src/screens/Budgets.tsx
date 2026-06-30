import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Target } from 'lucide-react';
import { setDate, subMonths, startOfDay, isAfter, parseISO } from 'date-fns';
import { budgetService } from '../services/budgetService';
import { transactionService } from '../services/transactionService';
import { formatCurrency, convertCurrency } from '../utils/format';
import BottomSheet from '../components/ui/BottomSheet';
import type { Budget, Category, Transaction, UserSettings, Currency } from '../types';

interface BudgetsProps {
    budgets: Budget[];
    categories: Category[];
    settings: UserSettings | null;
}

const Budgets: React.FC<BudgetsProps> = ({ budgets, categories, settings }) => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const mainCurrency = settings?.mainCurrency || 'PKR';

    useEffect(() => {
        const load = () => transactionService.getAllTransactions().then(setTransactions);
        load();
        const unsub = transactionService.subscribeToTransactions(() => load());
        return unsub;
    }, []);

    // Start of the current budget period, respecting monthStartDay.
    const periodStart = useMemo(() => {
        const now = new Date();
        const day = settings?.monthStartDay || 1;
        let start = startOfDay(setDate(now, day));
        if (isAfter(start, now)) start = subMonths(start, 1);
        return start;
    }, [settings?.monthStartDay]);

    const expenseCategories = categories.filter(c => c.type === 'Expense');
    const budgetedCategoryIds = new Set(budgets.map(b => b.categoryId));

    const rows = budgets.map(budget => {
        const category = categories.find(c => c.id === budget.categoryId);
        const spent = transactions
            .filter(t => t.type === 'Expense' && t.categoryId === budget.categoryId)
            .filter(t => isAfter(parseISO(t.date), periodStart))
            .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, budget.currency, settings?.customRates, settings?.useCustomRates), 0);
        const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        return { budget, category, spent, pct, over: spent > budget.amount };
    });

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-[20px] font-bold">Budgets</h3>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform"
                >
                    <Plus size={18} />
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center text-text-muted">
                    <Target size={48} className="mb-3 opacity-20" />
                    <p className="text-[15px] font-medium">No budgets yet</p>
                    <p className="text-[13px]">Set a monthly limit per category</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {rows.map(({ budget, category, spent, pct, over }) => (
                        <div key={budget.id} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                    <span className="font-semibold text-[14px]">{category?.name || 'Unknown'}</span>
                                </div>
                                <button
                                    onClick={() => budgetService.deleteBudget(budget.id)}
                                    className="text-text-muted hover:text-expense transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-bg-primary overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${over ? 'bg-expense' : 'bg-primary'}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center text-[12px]">
                                <span className={`font-bold ${over ? 'text-expense' : 'text-text-secondary'}`}>
                                    {formatCurrency(spent, budget.currency)} of {formatCurrency(budget.amount, budget.currency)}
                                </span>
                                <span className={`font-bold ${over ? 'text-expense' : 'text-text-muted'}`}>
                                    {over ? 'Over budget' : `${pct.toFixed(0)}%`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="New Budget">
                <BudgetForm
                    categories={expenseCategories.filter(c => !budgetedCategoryIds.has(c.id))}
                    defaultCurrency={mainCurrency}
                    onSuccess={() => setIsAddOpen(false)}
                />
            </BottomSheet>
        </div>
    );
};

interface BudgetFormProps {
    categories: Category[];
    defaultCurrency: Currency;
    onSuccess: () => void;
}

const BudgetForm: React.FC<BudgetFormProps> = ({ categories, defaultCurrency, onSuccess }) => {
    const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<Currency>(defaultCurrency);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!categoryId || !amount) return;
        setSaving(true);
        try {
            await budgetService.addBudget({
                categoryId,
                amount: parseFloat(amount),
                currency,
                period: 'monthly',
            });
            onSuccess();
        } finally {
            setSaving(false);
        }
    };

    if (categories.length === 0) {
        return <p className="py-6 text-center text-text-muted text-[14px]">All expense categories already have a budget.</p>;
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Category</label>
                <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                >
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Monthly Limit</label>
                    <input
                        type="number"
                        placeholder="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="bg-white border border-black/5 p-4 rounded-2xl text-[18px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Currency</label>
                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as Currency)}
                        className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                    >
                        <option value="PKR">PKR</option>
                        <option value="USD">USD</option>
                        <option value="AED">AED</option>
                        <option value="MYR">MYR</option>
                    </select>
                </div>
            </div>
            <button
                onClick={handleSave}
                disabled={saving || !amount}
                className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
            >
                {saving ? 'Saving...' : 'Add Budget'}
            </button>
        </div>
    );
};

export default Budgets;
