import type { Category, Currency } from '../types';
import type { Summary } from '../services/analyticsService';
import { fmtCompact, fmtMoney } from './format';

interface PeriodRow {
    period: string;
    income: number;
    expense: number;
    net: number;
}

const monthLabel = (period: string): string => {
    const date = new Date(`${period}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString('en-GB', { month: 'short' });
};

export const IncomeExpenseChart = ({ periods, currency }: { periods: PeriodRow[]; currency: Currency }) => {
    const width = 680;
    const height = 220;
    const pad = { top: 18, right: 12, bottom: 30, left: 44 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...periods.map(row => Math.max(row.income, row.expense)));
    const ticks = 4;
    const y = (value: number) => pad.top + innerH - (value / max) * innerH;
    const slot = innerW / periods.length;
    const barW = Math.min(20, Math.max(6, slot / 3.2));

    const grid = Array.from({ length: ticks + 1 }, (_unused, index) => {
        const value = (max / ticks) * index;
        return (
            <g key={index}>
                <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeDasharray="3 4" />
                <text x={pad.left - 8} y={y(value) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--muted)">
                    {fmtCompact(value)}
                </text>
            </g>
        );
    });

    return (
        <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Income and expenses by month">
            {grid}
            {periods.map((row, index) => {
                const cx = pad.left + slot * index + slot / 2;
                const incomeHeight = Math.max(1, pad.top + innerH - y(row.income));
                const expenseHeight = Math.max(1, pad.top + innerH - y(row.expense));
                return (
                    <g key={row.period}>
                        <rect x={cx - barW - 1} y={y(row.income)} width={barW} height={incomeHeight} rx="3" fill="var(--income)">
                            <title>{`${monthLabel(row.period)} income · ${fmtMoney(row.income, currency)}`}</title>
                        </rect>
                        <rect x={cx + 1} y={y(row.expense)} width={barW} height={expenseHeight} rx="3" fill="var(--expense)">
                            <title>{`${monthLabel(row.period)} expense · ${fmtMoney(row.expense, currency)}`}</title>
                        </rect>
                        <text x={cx} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">
                            {monthLabel(row.period)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const PALETTE = ['#f43f5e', '#fb7185', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

const colorFor = (category: Category | undefined, index: number): string =>
    (category && category.color) || PALETTE[index % PALETTE.length];

export const CategoryDonut = ({
    items,
    total,
    currency,
    categories,
}: {
    items: Summary['byCategory'];
    total: number;
    currency: Currency;
    categories: Category[];
}) => {
    const size = 168;
    const cx = size / 2;
    const cy = size / 2;
    const outer = 72;
    const inner = 48;
    const sum = total || items.reduce((acc, item) => acc + item.total, 0) || 1;

    const point = (radius: number, value: number): [number, number] => [
        cx + radius * Math.cos(value),
        cy + radius * Math.sin(value),
    ];

    // Build cumulative angles purely, so nothing is mutated during render.
    const arcs = items.reduce<Array<{ item: Summary['byCategory'][number]; start: number; sweep: number; end: number }>>(
        (acc, item) => {
            const start = acc.length ? acc[acc.length - 1].end : -Math.PI / 2;
            const sweep = (item.total / sum) * Math.PI * 2;
            return [...acc, { item, start, sweep, end: start + sweep }];
        },
        []
    );

    const segments = arcs.map(({ item, start, sweep, end }, index) => {
        const [x1, y1] = point(outer, start);
        const [x2, y2] = point(outer, end);
        const [x3, y3] = point(inner, end);
        const [x4, y4] = point(inner, start);
        const category = categories.find(entry => entry.id === item.categoryId);
        return (
            <path
                key={`${item.categoryId || 'none'}-${index}`}
                d={`M${x1},${y1} A${outer},${outer} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${sweep > Math.PI ? 1 : 0} 0 ${x4},${y4} Z`}
                fill={colorFor(category, index)}
                opacity=".9"
            >
                <title>{`${item.name} · ${fmtMoney(item.total, currency)}`}</title>
            </path>
        );
    });

    return (
        <div className="donut-wrap">
            <div className="donut">
                <svg viewBox={`0 0 ${size} ${size}`} className="chart" role="img" aria-label="Expenses by category">
                    {segments}
                    <text x={cx} y={cy - 2} textAnchor="middle" fontSize="10" fill="var(--muted)">
                        TOTAL
                    </text>
                    <text x={cx} y={cy + 13} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">
                        {fmtCompact(sum)}
                    </text>
                </svg>
            </div>
            <div className="legend" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: 0, gap: 8 }}>
                {items.map((item, index) => {
                    const category = categories.find(entry => entry.id === item.categoryId);
                    return (
                        <span key={`${item.categoryId || 'none'}-${index}`}>
                            <i style={{ background: colorFor(category, index) }} />
                            {item.name} <b>{Math.round((item.total / sum) * 100)}%</b>
                        </span>
                    );
                })}
            </div>
        </div>
    );
};
