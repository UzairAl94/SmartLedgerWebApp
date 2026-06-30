import React, { useState, useEffect } from 'react';
import { accountService } from '../../services/accountService';
import { transactionService } from '../../services/transactionService';
import { convertCurrency } from '../../utils/format';
import type { Account, AccountType, Currency } from '../../types';

interface AccountFormProps {
    onSuccess: () => void;
    accounts: Account[];
    accountToEdit?: Account | null;
}

const AccountForm: React.FC<AccountFormProps> = ({ onSuccess, accounts, accountToEdit }) => {
    const isEditMode = !!accountToEdit;

    const [name, setName] = useState(accountToEdit?.name || '');
    const [type, setType] = useState<AccountType>(accountToEdit?.type || 'Bank');
    const [currency, setCurrency] = useState<Currency>(accountToEdit?.currency || 'PKR');
    const [balance, setBalance] = useState(accountToEdit ? accountToEdit.initialBalance.toString() : '');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // Initial balance can only be edited when the account has no transactions.
    const [canEditInitial, setCanEditInitial] = useState(!isEditMode);

    useEffect(() => {
        if (!accountToEdit) return;
        transactionService.countForAccount(accountToEdit.id)
            .then(count => setCanEditInitial(count === 0))
            .catch(() => setCanEditInitial(false));
    }, [accountToEdit]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!name || !balance) return;

        // Duplicate check (exclude self when editing)
        const isDuplicate = accounts.some(acc =>
            acc.name.toLowerCase() === name.toLowerCase() && acc.id !== accountToEdit?.id
        );
        if (isDuplicate) {
            setError("Account name already exists");
            return;
        }

        setIsSaving(true);
        try {
            if (isEditMode && accountToEdit) {
                const updates: Partial<Account> = { name, type, currency };

                // Convert stored balances when currency changes so values aren't corrupted.
                if (currency !== accountToEdit.currency) {
                    updates.balance = convertCurrency(accountToEdit.balance, accountToEdit.currency, currency);
                    updates.initialBalance = convertCurrency(accountToEdit.initialBalance, accountToEdit.currency, currency);
                }

                // No transactions => balance tracks initialBalance; honor the entered value (already in selected currency).
                if (canEditInitial) {
                    const newInitial = parseFloat(balance);
                    updates.initialBalance = newInitial;
                    updates.balance = newInitial;
                }

                await accountService.updateAccount(accountToEdit.id, updates);
            } else {
                await accountService.addAccount({
                    name,
                    type,
                    currency,
                    balance: parseFloat(balance),
                    initialBalance: parseFloat(balance),
                    color: '#4f46e5' // Default color
                });
            }
            onSuccess();
        } catch (error) {
            console.error("Error saving account:", error);
            setError(isEditMode ? "Failed to update account" : "Failed to add account");
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
                    disabled={!canEditInitial}
                    className={`w-full bg-white border border-black/5 p-4 rounded-2xl text-[20px] font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all ${!canEditInitial ? 'opacity-60 cursor-not-allowed bg-bg-primary' : ''}`}
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    required
                />
                {isEditMode && !canEditInitial && (
                    <span className="text-[11px] font-semibold text-text-muted px-1">
                        Locked — account has transactions
                    </span>
                )}
            </div>

            <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-95 transition-all mt-4 ${isSaving ? 'opacity-70 grayscale cursor-not-allowed' : ''}`}
            >
                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Add Account'}
            </button>
        </form>
    );
};

export default AccountForm;
