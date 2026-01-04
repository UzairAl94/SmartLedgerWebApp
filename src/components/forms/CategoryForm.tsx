import React, { useState } from 'react';
import { categoryService } from '../../services/categoryService';
import type { Category, TransactionType } from '../../types';

interface CategoryFormProps {
    onSuccess: () => void;
    categories: Category[];
    initialType?: TransactionType;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ onSuccess, categories, initialType = 'Expense' }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<TransactionType>(initialType);
    const [color, setColor] = useState('#4f46e5');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const colors = [
        '#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#3b82f6',
        '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e', '#f97316'
    ];

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name) return;

        // Duplicate check (case-insensitive, within the same type)
        const isDuplicate = categories.some(
            cat => cat.name.toLowerCase() === name.toLowerCase() && cat.type === type
        );
        if (isDuplicate) {
            setError(`${type} category already exists`);
            return;
        }

        setIsSaving(true);
        try {
            await categoryService.addCategory({
                name,
                type,
                color,
                icon: 'Tag' // Default icon
            });
            onSuccess();
        } catch (error) {
            console.error("Error adding category:", error);
            setError("Failed to add category");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="bg-bg-primary p-1 rounded-2xl flex border border-black/5">
                <button
                    type="button"
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${type === 'Expense' ? 'bg-white text-expense shadow-sm shadow-expense/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => {
                        setType('Expense');
                        setError(null);
                    }}
                >
                    Expense
                </button>
                <button
                    type="button"
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${type === 'Income' ? 'bg-white text-income shadow-sm shadow-income/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => {
                        setType('Income');
                        setError(null);
                    }}
                >
                    Income
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Category Name</label>
                <input
                    type="text"
                    placeholder="e.g. Groceries"
                    className={`w-full bg-white border ${error?.includes('category') ? 'border-expense ring-2 ring-expense/10' : 'border-black/5'} p-4 rounded-2xl text-[15px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none transition-all`}
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        if (error) setError(null);
                    }}
                    required
                />
                {error && (
                    <span className="text-[11px] font-bold text-expense px-1 animate-in fade-in slide-in-from-top-1">
                        {error}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Choose Color</label>
                <div className="grid grid-cols-5 gap-3">
                    {colors.map(c => (
                        <button
                            key={c}
                            type="button"
                            className={`w-full aspect-square rounded-xl border-4 transition-all ${color === c ? 'border-primary/20 scale-110 shadow-lg' : 'border-transparent opacity-60'}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setColor(c)}
                        />
                    ))}
                </div>
            </div>

            <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-95 transition-all mt-4 ${isSaving ? 'opacity-70 grayscale cursor-not-allowed' : ''}`}
            >
                {isSaving ? 'Adding...' : 'Add Category'}
            </button>
        </form>
    );
};

export default CategoryForm;
