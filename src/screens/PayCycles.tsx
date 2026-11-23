import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Plus, RefreshCw, Trash2, Pencil } from 'lucide-react';
import { periodService, type PeriodSummary } from '../services/periodService';
import { settingsService } from '../services/settingsService';
import { salaryCategoryIds, type PeriodProposal } from '../services/payPeriodMath';
import { formatCurrency } from '../utils/format';
import BottomSheet from '../components/ui/BottomSheet';
import type { Category, UserSettings } from '../types';

interface PayCyclesProps {
    categories: Category[];
    settings: UserSettings | null;
    onBack: () => void;
}

type SheetState =
    | { kind: 'proposals'; proposals: PeriodProposal[] }
    | { kind: 'edit'; id: string | null; startDate: string; endDate: string }
    | null;

const PayCycles: React.FC<PayCyclesProps> = ({ categories, settings, onBack }) => {
    const [periods, setPeriods] = useState<PeriodSummary[]>([]);
    const [sheet, setSheet] = useState<SheetState>(null);
    const [busy, setBusy] = useState(false);

    const incomeCategories = useMemo(() => categories.filter(category => category.type === 'Income'), [categories]);
    const selectedSalaryIds = useMemo(() => salaryCategoryIds(categories, settings), [categories, settings]);

    const load = () => periodService.summaries().then(setPeriods).catch(() => setPeriods([]));
    useEffect(() => { load(); }, []);

    const toggleSalaryCategory = async (id: string) => {
        const next = new Set(selectedSalaryIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        await settingsService.updateSettings({ salaryCategoryIds: Array.from(next) });
    };

    const detect = async () => {
        setBusy(true);
        try {
            const proposals = await periodService.proposals();
            if (proposals.length === 0) {
                alert('No new salary cycles found. Make sure this month’s salary is recorded in a salary category.');
                return;
            }
            setSheet({ kind: 'proposals', proposals });
        } catch (error) {
            alert('Could not read salary cycles: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setBusy(false);
        }
    };

    const applyProposals = async (proposals: PeriodProposal[]) => {
        setBusy(true);
        try {
            const result = await periodService.applyProposals(proposals);
            setSheet(null);
            await load();
            alert(`Added ${result.created} cycle(s)${result.skipped ? `, skipped ${result.skipped} overlapping` : ''}.`);
        } catch (error) {
            alert('Could not add cycles: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setBusy(false);
        }
    };

    const savePeriod = async () => {
        if (sheet?.kind !== 'edit') return;
        const startDate = sheet.startDate;
        const endDate = sheet.endDate || null;
        if (!startDate) {
            alert('A start date is required.');
            return;
        }
        setBusy(true);
        try {
            if (sheet.id) {
                await periodService.update(sheet.id, { startDate, endDate });
            } else {
                await periodService.create({ startDate, endDate, source: 'manual' });
            }
            setSheet(null);
            await load();
        } catch (error) {
            alert('Could not save the cycle: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setBusy(false);
        }
    };

    const removePeriod = async (period: PeriodSummary) => {
        if (!confirm(`Delete the cycle ${period.label}? Transactions are not affected.`)) return;
        try {
            await periodService.remove(period.id);
            await load();
        } catch (error) {
            alert('Could not delete the cycle: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    return (
        <div className="flex flex-col gap-5 pb-28">
            <header className="flex items-center gap-3 px-1 pt-2">
                <button
                    onClick={onBack}
                    className="w-10 h-10 rounded-xl bg-white border border-black/5 flex items-center justify-center text-text-secondary active:scale-95"
                    aria-label="Back to settings"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h2 className="text-[22px] font-bold tracking-tight">Pay cycles</h2>
                    <p className="text-[12px] text-text-muted">Each cycle starts when your salary lands</p>
                </div>
            </header>

            <section className="bg-white rounded-3xl border border-black/5 p-4 flex flex-col gap-3 shadow-sm">
                <div>
                    <h3 className="text-[14px] font-bold">Which income counts as salary?</h3>
                    <p className="text-[12px] text-text-muted">Used only to suggest boundaries. Every cycle can be edited below.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {incomeCategories.length === 0 ? (
                        <span className="text-[12px] text-text-muted">No income categories yet.</span>
                    ) : incomeCategories.map(category => {
                        const active = selectedSalaryIds.has(category.id);
                        return (
                            <button
                                key={category.id}
                                onClick={() => toggleSalaryCategory(category.id)}
                                className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${active ? 'bg-primary text-white border-primary' : 'bg-bg-primary text-text-secondary border-black/5'}`}
                            >
                                {category.icon} {category.name}
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="flex gap-2">
                <button
                    onClick={detect}
                    disabled={busy}
                    className="flex-1 py-3 rounded-2xl bg-white border border-black/5 text-[13px] font-bold text-primary flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={15} /> Detect from salary
                </button>
                <button
                    onClick={() => setSheet({ kind: 'edit', id: null, startDate: '', endDate: '' })}
                    className="flex-1 py-3 rounded-2xl bg-primary text-white text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95"
                >
                    <Plus size={15} /> Add cycle
                </button>
            </div>

            {periods.length === 0 ? (
                <div className="flex flex-col items-center text-center gap-2 py-12 text-text-muted px-6">
                    <Calendar size={44} className="opacity-20" />
                    <p className="text-[14px] font-semibold">No cycles yet</p>
                    <p className="text-[12px]">Tap “Detect from salary” to propose cycles from the salary rows already in your ledger, then adjust the dates if a salary month landed differently.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {periods.map(period => (
                        <div key={period.id} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[15px] font-bold">{period.label}</span>
                                        {period.isCurrent && <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary-light px-2 py-0.5 rounded-full">Current</span>}
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted bg-black/5 px-2 py-0.5 rounded-full">{period.source}</span>
                                    </div>
                                    <p className="text-[12px] text-text-muted mt-1">{period.transactionCount} transactions · {period.salaryCount} salary credit{period.salaryCount === 1 ? '' : 's'}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setSheet({ kind: 'edit', id: period.id, startDate: period.startDate, endDate: period.endDate || '' })}
                                        className="w-9 h-9 rounded-lg bg-bg-primary text-text-secondary flex items-center justify-center active:scale-95"
                                        aria-label="Edit cycle dates"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        onClick={() => removePeriod(period)}
                                        className="w-9 h-9 rounded-lg bg-bg-primary text-expense flex items-center justify-center active:scale-95"
                                        aria-label="Delete cycle"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                                <div className="bg-income/5 rounded-xl py-2">
                                    <span className="block text-[10px] uppercase font-bold text-income tracking-wider">Income</span>
                                    <span className="text-[13px] font-bold text-income">{formatCurrency(period.income, settings?.mainCurrency || 'PKR')}</span>
                                </div>
                                <div className="bg-expense/5 rounded-xl py-2">
                                    <span className="block text-[10px] uppercase font-bold text-expense tracking-wider">Spent</span>
                                    <span className="text-[13px] font-bold text-expense">{formatCurrency(period.expense, settings?.mainCurrency || 'PKR')}</span>
                                </div>
                                <div className="bg-primary/5 rounded-xl py-2">
                                    <span className="block text-[10px] uppercase font-bold text-primary tracking-wider">Salary</span>
                                    <span className="text-[13px] font-bold text-primary">{formatCurrency(period.salaryTotal, settings?.mainCurrency || 'PKR')}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <BottomSheet
                isOpen={sheet?.kind === 'proposals'}
                onClose={() => setSheet(null)}
                title="Proposed cycles"
            >
                {sheet?.kind === 'proposals' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[12px] text-text-muted">These boundaries come from salary rows in your ledger. Nothing is saved until you tap Add.</p>
                        {sheet.proposals.map(proposal => (
                            <div key={proposal.startDate} className="bg-bg-primary rounded-xl p-3 border border-black/5">
                                <span className="block text-[13px] font-bold">{proposal.startDate} → {proposal.endDate || 'now'}</span>
                                <span className="text-[11px] text-text-muted">{proposal.salaryDays.length} salary day(s)</span>
                            </div>
                        ))}
                        <button
                            onClick={() => applyProposals(sheet.proposals)}
                            disabled={busy}
                            className="py-3 rounded-xl bg-primary text-white font-bold text-[14px] active:scale-95 disabled:opacity-50"
                        >
                            Add {sheet.proposals.length} cycle(s)
                        </button>
                    </div>
                )}
            </BottomSheet>

            <BottomSheet
                isOpen={sheet?.kind === 'edit'}
                onClose={() => setSheet(null)}
                title={sheet?.kind === 'edit' && sheet.id ? 'Edit cycle' : 'Add cycle'}
            >
                {sheet?.kind === 'edit' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Cycle starts</label>
                            <input
                                type="date"
                                value={sheet.startDate}
                                onChange={(event) => setSheet({ ...sheet, startDate: event.target.value })}
                                className="w-full bg-white border border-black/5 p-3 rounded-xl text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[12px] font-bold text-text-muted uppercase tracking-widest px-1">Cycle ends (optional)</label>
                            <input
                                type="date"
                                value={sheet.endDate}
                                onChange={(event) => setSheet({ ...sheet, endDate: event.target.value })}
                                className="w-full bg-white border border-black/5 p-3 rounded-xl text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <span className="text-[11px] text-text-muted px-1">Leave empty for the current, open-ended cycle.</span>
                        </div>
                        <button
                            onClick={savePeriod}
                            disabled={busy}
                            className="py-3 rounded-xl bg-primary text-white font-bold text-[14px] active:scale-95 disabled:opacity-50"
                        >
                            Save cycle
                        </button>
                    </div>
                )}
            </BottomSheet>
        </div>
    );
};

export default PayCycles;
