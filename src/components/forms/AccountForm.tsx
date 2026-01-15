import React, { useState } from 'react';
import { accountService } from '../../services/accountService';
import type { Account, AccountType, Currency } from '../../types';

interface AccountFormProps {
    onSuccess: () => void;
    accounts: Account[];
}

const AccountForm: React.FC<AccountFormProps> = ({ onSuccess, accounts }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<AccountType>('Bank');
    const [currency, setCurrency] = useState<Currency>('PKR');
    const [balance, setBalance] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name || !balance) return;

        // Duplicate check
        const isDuplicate = accounts.some(acc => acc.name.toLowerCase() === name.toLowerCase());
        if (isDuplicate) {
            setError("Account name already exists");
            return;
        }

        setIsSaving(true);
        try {
            await accountService.addAccount({
                name,
                type,
                currency,
                balance: parseFloat(balance),
                initialBalance: parseFloat(balance),
                color: '#4f46e5' // Default color
            });
            onSuccess();
        } catch (error) {
            console.error("Error adding account:", error);
            setError("Failed to add account");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Account Name</label>
                <input
                    type="text"
                    placeholder="e.g. HBL Savings"
                    className={`w-full bg-white border ${error?.includes('name') || error === 'Account name already exists' ? 'border-expense ring-2 ring-expense/10' : 'border-black/5'} p-4 rounded-2xl text-[15px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none transition-all`}
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

            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Type</label>
                    <select
                        className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                        value={type}
                        onChange={(e) => setType(e.target.value as AccountType)}
                    >
                        <option value="Bank">Bank</option>
                        <option value="Cash">Cash</option>
                        <option value="Investment">Investment</option>
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Currency</label>
                    <select
                        className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as Currency)}
                    >
                        <option value="PKR">PKR</option>
                        <option value="USD">USD</option>
                        <option value="AED">AED</option>
                        <option value="MYR">MYR</option>
                    </select>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Initial Balance</label>
                <input
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-white border border-black/5 p-4 rounded-2xl text-[20px] font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    required
                />
            </div>

            <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-95 transition-all mt-4 ${isSaving ? 'opacity-70 grayscale cursor-not-allowed' : ''}`}
            >
                {isSaving ? 'Adding...' : 'Add Account'}
            </button>
        </form>
    );
};

export default AccountForm;
