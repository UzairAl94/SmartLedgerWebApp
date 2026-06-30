import React, { useState, useEffect } from 'react';
import { Pencil, Download, X, Paperclip } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../utils/format';
import { receiptService } from '../../services/receiptService';
import BottomSheet from '../ui/BottomSheet';
import type { Transaction, Category, Account } from '../../types';

interface TransactionDetailsProps {
    tx: Transaction | null;
    categories: Category[];
    accounts: Account[];
    onClose: () => void;
    onEdit: (tx: Transaction) => void;
}

const TransactionDetails: React.FC<TransactionDetailsProps> = ({ tx, categories, accounts, onClose, onEdit }) => {
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [receiptSrc, setReceiptSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!tx?.receiptPath) { setReceiptSrc(null); return; }
        let cancelled = false;
        receiptService.displaySrc(tx.receiptPath).then(src => { if (!cancelled) setReceiptSrc(src); }).catch(() => {});
        return () => { cancelled = true; };
    }, [tx]);

    const cat = tx?.categoryId ? categories.find(c => c.id === tx.categoryId) : null;
    const acc = tx ? accounts.find(a => a.id === tx.accountId) : null;
    const toAcc = tx?.toAccountId ? accounts.find(a => a.id === tx.toAccountId) : null;
    const sign = tx?.type === 'Income' ? '+' : tx?.type === 'Expense' ? '-' : '';
    const amountColor = tx?.type === 'Income' ? 'text-income' : tx?.type === 'Transfer' ? 'text-blue-600' : 'text-text-primary';

    const Row = ({ label, value }: { label: string; value: string }) => (
        <div className="flex justify-between items-center py-3 border-b border-black/5 last:border-0">
            <span className="text-[13px] font-medium text-text-muted">{label}</span>
            <span className="text-[14px] font-semibold text-text-primary text-right">{value}</span>
        </div>
    );

    return (
        <>
            <BottomSheet isOpen={!!tx} onClose={onClose} title="Transaction Details">
                {tx && (
                    <div className="flex flex-col gap-5 pb-2">
                        <div className="bg-bg-primary p-6 rounded-2xl flex flex-col items-center gap-1 border border-black/5">
                            <span className={`text-[28px] font-bold ${amountColor}`}>{sign} {formatCurrency(tx.amount, tx.currency)}</span>
                            <span className="text-[12px] font-bold uppercase tracking-widest text-text-muted">{tx.type}</span>
                        </div>

                        <div className="bg-white rounded-2xl border border-black/5 px-4">
                            {tx.type !== 'Transfer' && <Row label="Category" value={cat?.name || 'Uncategorized'} />}
                            <Row label={tx.type === 'Transfer' ? 'From' : 'Account'} value={acc?.name || 'Unknown'} />
                            {toAcc && <Row label="To" value={toAcc.name} />}
                            <Row label="Date" value={format(parseISO(tx.date), 'EEE, dd MMM yyyy')} />
                            {tx.fee ? <Row label="Fee" value={formatCurrency(tx.fee, tx.currency)} /> : null}
                            {tx.note ? <Row label="Note" value={tx.note} /> : null}
                        </div>

                        {tx.receiptPath && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Receipt</span>
                                <div className="flex items-center gap-3 bg-white border border-black/5 p-3 rounded-2xl">
                                    {receiptSrc ? (
                                        <img
                                            src={receiptSrc}
                                            alt="Receipt"
                                            onClick={() => setLightbox(receiptSrc)}
                                            className="w-16 h-16 rounded-xl object-cover border border-black/5 cursor-pointer active:scale-95 transition-transform"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 rounded-xl bg-bg-primary flex items-center justify-center text-text-muted">
                                            <Paperclip size={20} />
                                        </div>
                                    )}
                                    <span className="flex-1 text-[13px] font-semibold text-text-secondary">Tap image to view</span>
                                    <button
                                        onClick={() => receiptService.download(tx.receiptPath!)}
                                        className="w-10 h-10 rounded-xl bg-bg-primary flex items-center justify-center text-primary active:scale-95 transition-all"
                                        title="Download receipt"
                                    >
                                        <Download size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => onEdit(tx)}
                            className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Pencil size={18} /> Edit Transaction
                        </button>
                    </div>
                )}
            </BottomSheet>

            {lightbox && (
                <div
                    onClick={() => setLightbox(null)}
                    className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4"
                >
                    <button
                        onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
                    >
                        <X size={22} />
                    </button>
                    <img src={lightbox} alt="Receipt" className="max-w-full max-h-full object-contain rounded-xl" />
                </div>
            )}
        </>
    );
};

export default TransactionDetails;
