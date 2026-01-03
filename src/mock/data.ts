import type { Account, Category, Transaction, UserSettings } from '../types';

export const mockSettings: UserSettings = {
    mainCurrency: 'PKR',
    monthStartDay: 1,
};

export const mockCategories: Category[] = [
    { id: 'cat-1', name: 'Salary', icon: 'Coins', color: '#10b981', type: 'Income' },
    { id: 'cat-2', name: 'Freelance', icon: 'Briefcase', color: '#3b82f6', type: 'Income' },
    { id: 'cat-3', name: 'Groceries', icon: 'ShoppingCart', color: '#f59e0b', type: 'Expense' },
    { id: 'cat-4', name: 'Rent', icon: 'Home', color: '#6366f1', type: 'Expense' },
    { id: 'cat-5', name: 'Dining', icon: 'Utensils', color: '#f43f5e', type: 'Expense' },
    { id: 'cat-6', name: 'Transport', icon: 'Car', color: '#06b6d4', type: 'Expense' },
    { id: 'cat-7', name: 'Shopping', icon: 'ShoppingBag', color: '#d946ef', type: 'Expense' },
    { id: 'cat-8', name: 'Entertainment', icon: 'Gamepad2', color: '#8b5cf6', type: 'Expense' },
    { id: 'cat-9', name: 'Bills', icon: 'Zap', color: '#ef4444', type: 'Expense' },
    { id: 'cat-10', name: 'Investments', icon: 'TrendingUp', color: '#10b981', type: 'Expense' },
];

export const mockAccounts: Account[] = [
    { id: 'acc-1', name: 'HBL Bank', type: 'Bank', currency: 'PKR', balance: 145000, initialBalance: 100000, color: '#1e3a8a' },
    { id: 'acc-2', name: 'Emirates NBD', type: 'Bank', currency: 'AED', balance: 5200, initialBalance: 5000, color: '#0f172a' },
    { id: 'acc-3', name: 'Cash Wallet', type: 'Cash', currency: 'PKR', balance: 12500, initialBalance: 10000, color: '#10b981' },
    { id: 'acc-4', name: 'Crypto Portfolio', type: 'Investment', currency: 'USD', balance: 850, initialBalance: 500, color: '#f59e0b' },
];

// Conversion rates for UI (Mocked)
export const mockRates: Record<string, number> = {
    'USD': 280,
    'AED': 76,
    'PKR': 1,
};

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const lastWeek = new Date(today);
lastWeek.setDate(lastWeek.getDate() - 7);

export const mockTransactions: Transaction[] = [
    {
        id: 'tx-1',
        amount: 150000,
        currency: 'PKR',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        date: today.toISOString(),
        note: 'Monthly Salary',
        type: 'Income',
    },
    {
        id: 'tx-2',
        amount: 4500,
        currency: 'PKR',
        categoryId: 'cat-3',
        accountId: 'acc-3',
        date: today.toISOString(),
        note: 'Weekly groceries',
        type: 'Expense',
    },
    {
        id: 'tx-3',
        amount: 200,
        currency: 'AED',
        categoryId: 'cat-5',
        accountId: 'acc-2',
        date: yesterday.toISOString(),
        note: 'Dinner with friends',
        type: 'Expense',
    },
    {
        id: 'tx-4',
        amount: 5000,
        currency: 'PKR',
        categoryId: 'cat-6',
        accountId: 'acc-3',
        date: lastWeek.toISOString(),
        note: 'Fuel refill',
        type: 'Expense',
    },
    {
        id: 'tx-5',
        amount: 300,
        currency: 'USD',
        categoryId: 'cat-2',
        accountId: 'acc-4',
        date: lastWeek.toISOString(),
        note: 'Freelance project final payment',
        type: 'Income',
    },
];
