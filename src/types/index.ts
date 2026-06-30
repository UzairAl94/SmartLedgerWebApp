export type Currency = 'PKR' | 'AED' | 'USD' | 'MYR';

export type AccountType = 'Bank' | 'Cash' | 'Investment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  initialBalance: number;
  color?: string;
  icon?: string;
}

export type TransactionType = 'Income' | 'Expense' | 'Transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: Currency;
  categoryId?: string; // Optional for transfers
  accountId: string; // From Account (for transfers)
  toAccountId?: string; // To Account (for transfers)
  date: string;
  note?: string;
  type: TransactionType;
  fee?: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  currency: Currency;
  period: 'monthly';
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTransaction {
  id: string;
  amount: number;
  currency: Currency;
  categoryId?: string;
  accountId: string;
  toAccountId?: string;
  note?: string;
  type: TransactionType;
  fee?: number;
  frequency: RecurringFrequency;
  nextRunDate: string; // ISO
  active: number; // 1 | 0 (SQLite has no boolean)
}

export type ConversionRates = Record<string, number>;

export interface UserSettings {
  mainCurrency: Currency;
  monthStartDay: number;
  useCustomRates: boolean;
  customRates: ConversionRates;
  appLockEnabled: boolean;
  appPin?: string; // SHA-256 hash of the 4-digit PIN
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
}
