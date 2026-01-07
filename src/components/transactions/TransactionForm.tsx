import React, { useState } from 'react';
import { transactionService } from '../../services/transactionService';
import type { TransactionType, Category, Account, Currency } from '../../types';

interface TransactionFormProps {
    onSuccess: () => void;
    accounts: Account[];
    categories: Category[];
}

const TransactionForm: React.FC<TransactionFormProps> = ({ onSuccess, accounts, categories }) => {
    const [type, setType] = useState<TransactionType>('Expense');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [toAccountId, setToAccountId] = useState('');
    const [fee, setFee] = useState('');
    const [showFee, setShowFee] = useState(false);
    const [currency, setCurrency] = useState<Currency>('PKR');

    // Log accounts and categories when modal opens
    React.useEffect(() => {
        console.log("--- Transaction Modal Opened ---");
        console.log("Available Accounts:", accounts);
        console.log("Available Categories:", categories);
        console.log("--------------------------------");
    }, []);

    // Set defaults when counts or categories change
    React.useEffect(() => {
        if (!accountId && accounts.length > 0) {
            setAccountId(accounts[0].id);
            setCurrency(accounts[0].currency); // Set currency from first account
        }

        // For transfer, default "to account" to the second account if available
        if (accounts.length > 1 && !toAccountId) {
            const potentialTo = accounts.find(a => a.id !== accountId);
            if (potentialTo) setToAccountId(potentialTo.id);
        }

        const firstCat = categories.find(c => c.type === (type === 'Transfer' ? 'Expense' : type));
        if (!categoryId && firstCat) setCategoryId(firstCat.id);
    }, [accounts, categories, type, accountId]);

    // Update currency when account changes
    const lastAccountId = React.useRef(accountId);
    React.useEffect(() => {
        if (accountId !== lastAccountId.current) {
            const selectedAccount = accounts.find(a => a.id === accountId);
            if (selectedAccount) {
                setCurrency(selectedAccount.currency);
            }
            lastAccountId.current = accountId;
        }
    }, [accountId, accounts]);

    const handleSave = async () => {
        if (!amount || !accountId) return;
        if (type === 'Transfer' && !toAccountId) return;
        if (type !== 'Transfer' && !categoryId) return;

        setIsSaving(true);
        try {
            const txData: any = {
                amount: parseFloat(amount),
                currency: currency, // Use selected currency
                accountId,
                date: new Date().toISOString(),
                note,
                type
            };

            if (type === 'Transfer') {
                txData.toAccountId = toAccountId;
            } else {
                txData.categoryId = categoryId;
            }

            if (showFee && fee) {
                txData.fee = parseFloat(fee);
            }

            await transactionService.createTransaction(txData);
            onSuccess();
        } catch (error) {
            console.error("Error saving transaction:", error);
            alert("Failed to save transaction. Check console.");
        } finally {
            setIsSaving(false);
        }
    };

    const getCurrencySymbol = (curr: string) => {
        switch (curr) {
            case 'USD': return '$';
            case 'AED': return 'Dh';
            case 'MYR': return 'RM';
            case 'PKR': return 'Rs';
            default: return curr;
        }
    };

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
                <button
                    className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all ${type === 'Transfer' ? 'bg-white text-primary shadow-sm shadow-primary/10' : 'text-text-muted hover:text-text-primary'}`}
                    onClick={() => setType('Transfer')}
                >
                    Transfer
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest">Amount</label>
                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as Currency)}
                        className="text-[11px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-lg border border-primary/20 outline-none cursor-pointer hover:bg-primary/10 transition-colors"
                    >
                        <option value="PKR">PKR (Rs)</option>
                        <option value="USD">USD ($)</option>
                        <option value="AED">AED (Dh)</option>
                        <option value="MYR">MYR (RM)</option>
                    </select>
                </div>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-text-muted">{getCurrencySymbol(currency)}</span>
                    <input
                        type="number"
                        placeholder="0"
                        className="w-full bg-white border border-black/5 p-4 pl-14 rounded-2xl text-[24px] font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-200"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>
                {/* Fee Toggle */}
                <div className="flex flex-col gap-2 mt-2">
                    {!showFee ? (
                        <button onClick={() => setShowFee(true)} className="text-[13px] font-semibold text-primary self-start hover:underline px-2">
                            + Add Fee
                        </button>
                    ) : (
                        <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest px-1 mb-1 block">Transaction Fee</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-text-muted text-[13px]">{getCurrencySymbol(currency)}</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        className="w-full bg-white border border-black/5 p-3 pl-12 rounded-xl text-[16px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                                        value={fee}
                                        onChange={(e) => setFee(e.target.value)}
                                    />
                                </div>
                                <button onClick={() => { setShowFee(false); setFee(''); }} className="px-3 text-text-muted hover:text-expense font-medium text-[13px]">
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From Account Logic - Always Shown */}
                <div className="flex flex-col gap-2 order-2 md:order-1">
                    <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">
                        {type === 'Transfer' ? 'From Account' : 'Account'}
                    </label>
                    <select
                        className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>

                {/* Second Field: Category OR To Account */}
                {type === 'Transfer' ? (
                    <div className="flex flex-col gap-2 order-1 md:order-2">
                        <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">To Account</label>
                        <select
                            className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                            value={toAccountId}
                            onChange={(e) => setToAccountId(e.target.value)}
                        >
                            <option value="" disabled>Select Account</option>
                            {accounts.filter(a => a.id !== accountId).map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 order-1 md:order-2">
                        <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Category</label>
                        <select
                            className="bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none appearance-none cursor-pointer"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            {categories.filter(c => c.type === type).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Note</label>
                <input
                    type="text"
                    placeholder="What was this for?"
                    className="w-full bg-white border border-black/5 p-4 rounded-2xl text-[14px] font-semibold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                />
            </div>

            <button
                onClick={handleSave}
                disabled={isSaving || !amount}
                className={`w-full py-5 bg-primary text-white rounded-[1.5rem] font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-95 transition-all mt-4 ${isSaving ? 'opacity-70 grayscale cursor-not-allowed' : ''}`}
            >
                {isSaving ? 'Saving...' : 'Save Transaction'}
            </button>
        </div>
    );
};

export default TransactionForm;
