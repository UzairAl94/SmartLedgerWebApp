import React, { useState } from 'react';
import { Plus, Trash2, Repeat } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { recurringService } from '../services/recurringService';
import { formatCurrency } from '../utils/format';
import BottomSheet from '../components/ui/BottomSheet';
import type { RecurringTransaction, RecurringFrequency, Category, Account, UserSettings, Currency, TransactionType } from '../types';

interface RecurringProps {
    rules: RecurringTransaction[];
    categories: Category[];
    accounts: Account[];
    settings: UserSettings | null;
}

const Recurring: React.FC<RecurringProps> = ({ rules, categories, accounts }) => {
    const [isAddOpen, setIsAddOpen] = useState(false);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-[20px] font-bold">Recurring</h3>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center active:scale-95 transition-transform"
                >
                    <Plus size={18} />
                </button>
            </div>

            {rules.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center text-text-muted">
                    <Repeat size={48} className="mb-3 opacity-20" />
                    <p className="text-[15px] font-medium">No recurring transactions</p>
                    <p className="text-[13px]">Automate rent, salary, subscriptions</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {rules.map(rule => {
                        const category = categories.find(c => c.id === rule.categoryId);
                        const account = accounts.find(a => a.id === rule.accountId);
                        return (
                            <div key={rule.id} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex items-center gap-3">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border border-black/5 ${rule.active ? 'bg-primary-light text-primary' : 'bg-bg-primary text-text-muted'}`}>
                                    <Repeat size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="block font-semibold text-[14px]">
                                        {rule.type === 'Transfer' ? 'Transfer' : category?.name || rule.type}
                                    </span>
                                    <span className="text-[11px] text-text-muted font-medium capitalize">
                                        {rule.frequency} · {account?.name} · next {format(parseISO(rule.nextRunDate), 'dd MMM')}
                                    </span>
                                </div>
                                <span className={`font-bold text-[14px] ${rule.type === 'Income' ? 'text-income' : 'text-text-primary'}`}>
                                    {formatCurrency(rule.amount, rule.currency)}
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!rule.active}
                                        onChange={(e) => recurringService.setActive(rule.id, e.target.checked ? 1 : 0)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                                <button
                                    onClick={() => recurringService.deleteRule(rule.id)}
                                    className="text-text-muted hover:text-expense transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="New Recurring">
                <RecurringForm categories={categories} accounts={accounts} onSuccess={() => setIsAddOpen(false)} />
            </BottomSheet>
        </div>
    );
};

interface RecurringFormProps {
    categories: Category[];
    accounts: Account[];
    onSuccess: () => void;
}

const RecurringForm: React.FC<RecurringFormProps> = ({ categories, accounts, onSuccess }) => {
    const [type, setType] = useState<TransactionType>('Expense');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<Currency>(accounts[0]?.currency || 'PKR');
    const [accountId, setAccountId] = useState(accounts[0]?.id || '');
    const [toAccountId, setToAccountId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [note, setNote] = useState('');
    const [hideAmount, setHideAmount] = useState(false);
    const [saving, setSaving] = useState(false);

    const typeCategories = categories.filter(c => c.type === type);

    const handleSave = async () => {
        if (!amount || !accountId) return;
        if (type === 'Transfer' && !toAccountId) return;
        if (type !== 'Transfer' && !categoryId) return;
        setSaving(true);
        try {
            await recurringService.addRule({
                amount: parseFloat(amount),
                currency,
                accountId,
                toAccountId: type === 'Transfer' ? toAccountId : undefined,
                categoryId: type === 'Transfer' ? undefined : categoryId,
                note: note || undefined,
                type,
                frequency,
                nextRunDate: new Date(startDate).toISOString(),
                active: 1,
                hidden: hideAmount ? 1 : 0,
            });
            onSuccess();
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/20 appearance-none w-full';

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-bg-primary p-1 rounded-2xl flex border border-black/5">
                {(['Expense', 'Income', 'Transfer'] as TransactionType[]).map(t => (
                    <button
                        key={t}
                        onClick={() => { setType(t); setCategoryId(''); }}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${type === t ? 'bg-white text-primary shadow-sm' : 'text-text-muted'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
                <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className={inputCls}>
                    <option value="PKR">PKR</option>
                    <option value="USD">USD</option>
                    <option value="AED">AED</option>
                    <option value="MYR">MYR</option>
                </select>
            </div>

            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={inputCls}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            {type === 'Transfer' ? (
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className={inputCls}>
                    <option value="">To account…</option>
                    {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
            ) : (
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                    <option value="">Category…</option>
                    {typeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            )}

            <div className="grid grid-cols-2 gap-3">
                <select value={frequency} onChange={e => setFrequency(e.target.value as RecurringFrequency)} className={inputCls}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            </div>

            <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className={inputCls} />

            <label className="flex items-center justify-between bg-white border border-black/5 p-3.5 rounded-2xl cursor-pointer">
                <span className="text-[14px] font-semibold">Hide amount</span>
                <input type="checkbox" checked={hideAmount} onChange={e => setHideAmount(e.target.checked)} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>

            <button
                onClick={handleSave}
                disabled={saving || !amount}
                className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
            >
                {saving ? 'Saving...' : 'Add Recurring'}
            </button>
        </div>
    );
};

export default Recurring;
