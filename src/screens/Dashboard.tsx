import React from 'react';
import { Mic, ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
import { mockAccounts, mockTransactions, mockCategories, mockSettings } from '../mock/data';
import { formatCurrency, convertCurrency } from '../utils/format';

import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const Dashboard: React.FC<{ onAddTx: () => void; onVoiceResult: (text: string) => void }> = ({ onAddTx, onVoiceResult }) => {
    const { isListening, transcript, startListening, stopListening, resetTranscript } = useSpeechRecognition();
    const mainCurrency = mockSettings.mainCurrency;

    // Monitor for transcription end
    React.useEffect(() => {
        if (!isListening && transcript) {
            onVoiceResult(transcript);
            resetTranscript();
        }
    }, [isListening, transcript, onVoiceResult, resetTranscript]);

    // Calculate Total Balance
    const totalBalance = mockAccounts.reduce((acc, account) => {
        return acc + convertCurrency(account.balance, account.currency, mainCurrency);
    }, 0);

    // Recent Transactions
    const recentTransactions = [...mockTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 4);

    return (
        <div className="flex flex-col gap-8 pb-8">
            <section className="bg-linear-to-br from-primary to-[#312e81] p-6 rounded-[2rem] text-white flex flex-col gap-2 shadow-[0_10_25_-5_rgba(79,70,229,0.4)]">
                <span className="text-[14px] opacity-80 font-medium tracking-wide">Total Balance</span>
                <h2 className="text-[32px] font-bold tracking-tight mb-4">{formatCurrency(totalBalance, mainCurrency)}</h2>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex items-center gap-2 border border-white/10">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-income/20 text-income">
                            <ArrowDownLeft size={16} />
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase tracking-wider opacity-70">Income</span>
                            <strong className="text-[14px] block">{formatCurrency(150000, 'PKR')}</strong>
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex items-center gap-2 border border-white/10">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-expense/20 text-expense">
                            <ArrowUpRight size={16} />
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase tracking-wider opacity-70">Expenses</span>
                            <strong className="text-[14px] block">{formatCurrency(24500, 'PKR')}</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-base font-semibold mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        className="flex flex-col items-center justify-center p-6 bg-primary-light text-primary rounded-2xl gap-2 font-semibold text-[14px] active:scale-95 transition-transform"
                        onClick={onAddTx}
                    >
                        <Plus size={24} />
                        <span>Add Transaction</span>
                    </button>
                    <button
                        onClick={isListening ? stopListening : startListening}
                        className={`flex flex-col items-center justify-center p-6 rounded-2xl gap-2 font-semibold text-[14px] active:scale-95 transition-all border border-black/5 ${isListening ? 'bg-expense text-white shadow-lg shadow-expense/20 animate-pulse' : 'bg-slate-50 text-text-secondary shadow-sm'}`}
                    >
                        <Mic size={24} className={isListening ? 'animate-bounce' : ''} />
                        <span>{isListening ? 'Stop' : 'Voice Input'}</span>
                    </button>
                </div>
            </section>

            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-semibold">Recent Transactions</h3>
                    <button className="text-[13px] font-semibold text-primary">View All</button>
                </div>

                <div className="flex flex-col gap-2">
                    {recentTransactions.map(tx => {
                        const category = mockCategories.find(c => c.id === tx.categoryId);
                        return (
                            <div key={tx.id} className="flex items-center p-4 bg-bg-secondary rounded-xl gap-4 shadow-sm">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: category?.color + '20' }}>
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }}></div>
                                </div>
                                <div className="flex-1 flex flex-col">
                                    <span className="font-semibold text-[14px]">{category?.name}</span>
                                    <span className="text-[12px] text-text-secondary">{tx.note}</span>
                                </div>
                                <div className={`font-bold text-[15px] ${tx.type === 'Income' ? 'text-income' : 'text-text-primary'}`}>
                                    {tx.type === 'Income' ? '+' : '-'} {formatCurrency(tx.amount, tx.currency)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
