import type { Currency, UserSettings } from '../types';
import { formatCurrency } from '../utils/format';
import { convert as convertMoney } from '../utils/money';
import type { RangeKey } from './types';

export const fmtMoney = (amount: number, currency: Currency): string =>
    formatCurrency(Number.isFinite(amount) ? amount : 0, currency);

export const convert = (amount: number, from: Currency, to: Currency, settings: UserSettings | null): number =>
    convertMoney(amount, from, to, settings);

export const isoDay = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const fmtDate = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time}`;
};

export const fmtCompact = (amount: number): string => {
    const absolute = Math.abs(amount);
    if (absolute >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    if (absolute >= 1000) return `${(amount / 1000).toFixed(0)}k`;
    return String(Math.round(amount));
};

export const rangeBounds = (range: RangeKey): { from?: string; to?: string } => {
    const now = new Date();
    const to = isoDay(now);
    const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

    if (range === 'all') return {};
    if (range === 'this-month') return { from: isoDay(startOfMonth(now)), to };
    if (range === 'last-month') {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: isoDay(first), to: isoDay(last) };
    }
    if (range === '3m') return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
    if (range === '6m') return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to };
    if (range === 'ytd') return { from: `${now.getFullYear()}-01-01`, to };
    return {};
};

export const toQuery = (params: Record<string, string | number | undefined | null>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
};
