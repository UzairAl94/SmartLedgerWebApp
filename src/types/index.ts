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
  hidden?: number; // 1 = mask amounts of this category's transactions
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
  receiptPath?: string; // relative path under Filesystem Directory.Data, e.g. receipts/<uuid>.jpg
  hidden?: number; // 1 = mask the amount in the UI (still counted in totals)
  externalId?: string; // caller-supplied idempotency key (e.g. statement row id)
  importBatchId?: string; // groups rows created by one API import; enables undo
  // Frozen conversion at write time. Keeps history stable when rates change.
  accountAmount?: number; // amount in the source account's currency
  accountFee?: number; // fee in the source account's currency
  toAccountAmount?: number; // transfer amount in the destination account's currency
  baseAmount?: number; // amount in the main currency at write time
  baseCurrency?: Currency; // currency that baseAmount is expressed in
  fxRate?: number; // tx currency -> account currency rate used
  cleared?: number; // 1 = reconciled against a statement
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
  hidden?: number; // 1 = generated transactions get their amount masked
}

export type ConversionRates = Record<string, number>;

export interface UserSettings {
  mainCurrency: Currency;
  monthStartDay: number;
  useCustomRates: boolean;
  customRates: ConversionRates;
  appLockEnabled: boolean;
  appPin?: string; // PBKDF2 hash (legacy: SHA-256 hex or plaintext, upgraded on unlock)
  biometricUnlockEnabled?: boolean;
  pinFailedAttempts?: number;
  pinLockedUntil?: string; // ISO timestamp while the PIN is locked out
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  autoBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string; // 'HH:mm' — soft threshold for the launch-time due-check
  backupEncryptionEnabled?: boolean; // encrypt exports and auto-backups with the stored passphrase
  lastBackupAt?: string; // ISO of last successful auto-backup
  apiServerPort: number; // local API port (Android server)
  apiServerAllowLan: boolean; // bind 0.0.0.0 so other devices can reach it
}
