import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, ChevronDown } from 'lucide-react';
import type { Transaction, Category, UserSettings } from '../types';
import { formatCurrency, convertCurrency } from '../utils/format';
import {
    subDays,
    startOfMonth,
    endOfMonth,
    format,
    isAfter,
    isBefore,
    parseISO,
    eachDayOfInterval,
    subMonths,
    isSameDay,
    startOfDay,
    endOfDay,
    startOfYear,
    endOfYear,
    eachMonthOfInterval,
    isSameMonth
} from 'date-fns';

interface AnalyticsProps {
    transactions: Transaction[];
    categories: Category[];
    settings: UserSettings | null;
}

type DateRange = '7days' | '30days' | 'thisMonth' | 'lastMonth' | '6Months' | 'Year';

const Analytics: React.FC<AnalyticsProps> = ({ transactions, categories, settings }) => {
    const [dateRange, setDateRange] = useState<DateRange>('7days');
    const mainCurrency = settings?.mainCurrency || 'PKR';

    // 1. Determine Date Range Metadata
    const { startDate, endDate, periodType } = useMemo(() => {
        const now = new Date();
        switch (dateRange) {
            case '7days':
                return { startDate: subDays(now, 6), endDate: now, periodType: 'daily' };
            case '30days':
                return { startDate: subDays(now, 29), endDate: now, periodType: 'daily' };
            case 'thisMonth':
                return { startDate: startOfMonth(now), endDate: endOfMonth(now), periodType: 'daily' };
            case 'lastMonth':
                const lastMonth = subMonths(now, 1);
                return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth), periodType: 'daily' };
            case '6Months':
                return { startDate: subMonths(now, 5), endDate: endOfMonth(now), periodType: 'monthly' };
            case 'Year':
                return { startDate: startOfYear(now), endDate: endOfYear(now), periodType: 'monthly' };
            default:
                return { startDate: subDays(now, 6), endDate: now, periodType: 'daily' };
        }
    }, [dateRange]);

    // 2. Filter Transactions
    const filteredTransactions = useMemo(() => {
        const start = startOfDay(startDate);
        const end = endOfDay(endDate);

        return transactions.filter(t => {
            const txDate = parseISO(t.date);
            return (isAfter(txDate, start) || isSameDay(txDate, start)) &&
                (isBefore(txDate, end) || isSameDay(txDate, end));
        });
    }, [transactions, startDate, endDate]);

    // 3. Generate Chart Data
    const chartData = useMemo(() => {
        let periods: Date[];
        let formatStr: string;
        let isSamePeriod: (dateLeft: Date, dateRight: Date) => boolean;

        if (periodType === 'monthly') {
            periods = eachMonthOfInterval({ start: startDate, end: endDate });
            formatStr = 'MMM';
            isSamePeriod = isSameMonth;
        } else {
            periods = eachDayOfInterval({ start: startDate, end: endDate });
            formatStr = dateRange === '7days' ? 'EEE' : 'dd';
            isSamePeriod = isSameDay;
        }

        return periods.map(date => {
            const label = format(date, formatStr);
            const fullDate = format(date, periodType === 'monthly' ? 'MMMM yyyy' : 'MMM dd, yyyy');

            // Find transactions for this period
            const periodTxs = filteredTransactions.filter(t => isSamePeriod(parseISO(t.date), date));

            const income = periodTxs
                .filter(t => t.type === 'Income')
                .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0);

            const expense = periodTxs
                .filter(t => t.type === 'Expense')
                .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0);

            return {
                name: label,
                fullDate,
                income,
                expense
            };
        });
    }, [filteredTransactions, startDate, endDate, dateRange, periodType, mainCurrency]);

    // 4. Calculate Totals for Display
    const incomeTotal = useMemo(() =>
        filteredTransactions
            .filter(t => t.type === 'Income')
            .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0),
        [filteredTransactions, mainCurrency, settings]);

    const expenseTotal = useMemo(() =>
        filteredTransactions
            .filter(t => t.type === 'Expense')
            .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0),
        [filteredTransactions, mainCurrency, settings]);

    const categoryData = useMemo(() =>
        categories
            .filter(c => c.type === 'Expense')
            .map(c => {
                const total = filteredTransactions
                    .filter(t => t.categoryId === c.id)
                    .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency, settings?.customRates, settings?.useCustomRates), 0); // Normalized to main currency if needed, or keeping raw if single currency
                // Note: Ideally category breakdown should also normalize currency if mixed.
                // Assuming mixed for safety:
                return { name: c.name, value: total, color: c.color };
            })
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value),
        [categories, filteredTransactions, mainCurrency]);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[20px] font-bold">Insights</h3>

                {/* Date Filter Component */}
                <div className="relative group z-20">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as DateRange)}
                        className="appearance-none bg-white border border-black/5 pl-9 pr-8 py-2 rounded-xl text-[13px] font-bold text-text-primary focus:ring-2 focus:ring-primary/20 outline-none shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                        <option value="thisMonth">This Month</option>
                        <option value="lastMonth">Last Month</option>
                        <option value="6Months">Last 6 Months</option>
                        <option value="Year">This Year</option>
                    </select>
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
            </div>

            <section className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5">
                <div className="flex justify-between items-end mb-6">
                    <h4 className="text-[14px] font-bold text-text-muted uppercase tracking-wider">Income vs Expense</h4>
                    <div className="text-right">
                        <span className="text-[10px] text-text-muted font-semibold block uppercase">Net</span>
                        <span className={`text-[14px] font-bold ${incomeTotal - expenseTotal >= 0 ? 'text-income' : 'text-expense'}`}>
                            {formatCurrency(incomeTotal - expenseTotal, mainCurrency)}
                        </span>
                    </div>
                </div>

                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                fontSize={11}
                                tick={{ fill: '#94a3b8', fontWeight: 600 }}
                                dy={10}
                            />
                            <Tooltip
                                cursor={{ fill: '#f1f5f9', radius: 4 }}
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                labelStyle={{ fontWeight: 'bold', color: '#64748b', marginBottom: '8px', fontSize: '12px' }}
                            />
                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 4, 4]} barSize={12} />
                            <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 4, 4]} barSize={12} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-black/5">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-income"></div>
                        <span className="text-[12px] font-semibold text-text-muted">Income</span>
                        <span className="text-[13px] font-bold text-text-primary ml-1">{formatCurrency(incomeTotal, mainCurrency)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-expense"></div>
                        <span className="text-[12px] font-semibold text-text-muted">Expense</span>
                        <span className="text-[13px] font-bold text-text-primary ml-1">{formatCurrency(expenseTotal, mainCurrency)}</span>
                    </div>
                </div>
            </section>

            <section className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5">
                <div className="mb-6">
                    <h4 className="text-[14px] font-bold text-text-muted uppercase tracking-wider mb-1">Expense Breakdown</h4>
                    <span className="text-[12px] text-text-muted">Where your money went</span>
                </div>

                {categoryData.length > 0 ? (
                    <>
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        innerRadius={65}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number | undefined) => [value ? formatCurrency(value, mainCurrency) : '', 'Amount']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-1 gap-3 mt-4">
                            {categoryData.map((c, i) => (
                                <div key={c.name} className="flex items-center gap-3 p-3 rounded-2xl bg-bg-secondary/50 border border-black/5 hover:bg-bg-secondary transition-colors">
                                    <div className="text-[12px] font-bold text-text-muted w-4">{i + 1}</div>
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: c.color }}></div>
                                    <div className="flex-1 min-w-0 flex justify-between items-center">
                                        <span className="text-[13px] font-bold text-text-primary truncate">{c.name}</span>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[13px] font-bold text-text-primary">{formatCurrency(c.value, mainCurrency)}</span>
                                            <span className="text-[10px] text-text-muted font-medium">
                                                {((c.value / expenseTotal) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                        <PieChart className="w-12 h-12 mb-2" />
                        <span className="text-sm font-medium">No expenses in this period</span>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Analytics;
