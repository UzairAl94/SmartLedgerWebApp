import React from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Transaction, Category } from '../types';
import { formatCurrency, convertCurrency } from '../utils/format';

interface AnalyticsProps {
    transactions: Transaction[];
    categories: Category[];
}

const Analytics: React.FC<AnalyticsProps> = ({ transactions, categories }) => {
    const mainCurrency = 'PKR'; // Default for analytics

    const incomeTotal = transactions
        .filter(t => t.type === 'Income')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);

    const expenseTotal = transactions
        .filter(t => t.type === 'Expense')
        .reduce((sum, t) => sum + convertCurrency(t.amount, t.currency, mainCurrency), 0);
    const categoryData = categories
        .filter(c => c.type === 'Expense')
        .map(c => {
            const total = transactions
                .filter(t => t.categoryId === c.id)
                .reduce((sum, t) => sum + t.amount, 0);
            return { name: c.name, value: total, color: c.color };
        })
        .filter(d => d.value > 0);

    const monthlyTrend = [
        { name: 'Dec', income: incomeTotal, expense: expenseTotal },
        { name: 'Nov', income: 0, expense: 0 },
        { name: 'Oct', income: 0, expense: 0 },
    ];

    return (
        <div className="flex flex-col gap-6 pb-8">
            <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[20px] font-bold">Insights</h3>
                <div className="bg-white px-3 py-1.5 rounded-full border border-black/5 shadow-sm text-[12px] font-semibold text-text-secondary">
                    Dec 1 - Dec 31
                </div>
            </div>

            <section className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5">
                <h4 className="text-[14px] font-bold text-text-muted uppercase tracking-wider mb-6">Income vs Expense</h4>
                <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyTrend}>
                            <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#94a3b8' }} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                            <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={16} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <section className="bg-white p-5 rounded-[2rem] shadow-premium border border-black/5">
                <h4 className="text-[14px] font-bold text-text-muted uppercase tracking-wider mb-2">Expense Breakdown</h4>
                <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryData}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={8}
                                dataKey="value"
                                stroke="none"
                            >
                                {categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    {categoryData.map(c => (
                        <div key={c.name} className="flex items-center gap-2 p-2 rounded-xl bg-bg-primary border border-black/5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }}></div>
                            <div className="flex-1 min-w-0">
                                <span className="block text-[11px] font-bold truncate uppercase tracking-tighter text-text-secondary">{c.name}</span>
                                <span className="block text-[13px] font-bold">{formatCurrency(c.value, 'PKR')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default Analytics;
