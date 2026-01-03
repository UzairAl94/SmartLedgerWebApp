export type Currency = 'PKR' | 'AED' | 'USD';

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

export type ConversionRates = Record<string, number>;

export interface UserSettings {
  mainCurrency: Currency;
  monthStartDay: number;
  useCustomRates: boolean;
  customRates: ConversionRates;
}
