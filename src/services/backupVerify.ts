import type { Account, Budget, Category, RecurringTransaction, Transaction, UserSettings } from '../types';

export interface BackupData {
    version: number;
    timestamp: string;
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    budgets?: Budget[];
    recurring?: RecurringTransaction[];
    settings: UserSettings | null;
}

export interface BackupVerification {
    encrypted: boolean;
    version: number;
    timestamp: string;
    counts: {
        accounts: number;
        transactions: number;
        categories: number;
        budgets: number;
        recurring: number;
    };
    issues: string[];
    warnings: string[];
}

export interface BackupContents {
    data: BackupData;
    receiptPaths: Set<string> | null;
    warnings: string[];
    encrypted: boolean;
}

/**
 * Structural validation for a parsed backup. Pure: it never touches the DB.
 * `issues` block a restore; `warnings` are reported but tolerated.
 */
export const verifyBackupData = ({ data, receiptPaths, warnings, encrypted }: BackupContents): BackupVerification => {
    const issues: string[] = [];
    const notes = [...warnings];

    const accountIds = new Set(data.accounts.map(account => account.id));
    const categoryIds = new Set(data.categories.map(category => category.id));
    const transactionIds = new Set<string>();

    for (const tx of data.transactions) {
        if (transactionIds.has(tx.id)) issues.push(`Duplicate transaction id: ${tx.id}`);
        transactionIds.add(tx.id);

        if (!accountIds.has(tx.accountId)) issues.push(`Transaction ${tx.id} references a missing account (${tx.accountId}).`);
        if (tx.toAccountId && !accountIds.has(tx.toAccountId)) issues.push(`Transaction ${tx.id} references a missing destination account.`);
        if (tx.categoryId && !categoryIds.has(tx.categoryId)) issues.push(`Transaction ${tx.id} references a missing category.`);
        if (tx.type === 'Transfer' && tx.toAccountId === tx.accountId) issues.push(`Transfer ${tx.id} has the same source and destination.`);
        if (!(tx.amount > 0)) issues.push(`Transaction ${tx.id} has a non-positive amount.`);
        if (tx.receiptPath && receiptPaths && !receiptPaths.has(tx.receiptPath)) {
            notes.push(`Receipt missing for transaction ${tx.id}: ${tx.receiptPath}`);
        }
    }

    for (const budget of data.budgets || []) {
        if (!categoryIds.has(budget.categoryId)) issues.push(`Budget ${budget.id} references a missing category.`);
    }

    return {
        encrypted,
        version: data.version,
        timestamp: data.timestamp,
        counts: {
            accounts: data.accounts.length,
            transactions: data.transactions.length,
            categories: data.categories.length,
            budgets: (data.budgets || []).length,
            recurring: (data.recurring || []).length,
        },
        issues,
        warnings: notes,
    };
};
