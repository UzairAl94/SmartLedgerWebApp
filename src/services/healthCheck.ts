import type { Account, Budget, Category, Transaction } from '../types';

export interface HealthIssue {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    entityId?: string;
}

export interface HealthReport {
    checkedAt: string;
    counts: {
        accounts: number;
        transactions: number;
        categories: number;
        budgets: number;
    };
    issues: HealthIssue[];
}

export interface LedgerSnapshot {
    accounts: Account[];
    categories: Category[];
    transactions: Transaction[];
    budgets: Budget[];
    /** balance = initialBalance + accountDeltas, computed with frozen amounts. */
    expectedBalances: Map<string, number>;
}

const day = (iso: string): string => String(iso || '').slice(0, 10);

/** Pure, read-only checks. Used by the diagnostics page/API. */
export const analyzeLedger = ({
    accounts,
    categories,
    transactions,
    budgets,
    expectedBalances,
}: LedgerSnapshot): HealthReport => {
    const issues: HealthIssue[] = [];
    const accountIds = new Set(accounts.map(account => account.id));
    const categoryIds = new Set(categories.map(category => category.id));
    const today = new Date().toISOString().slice(0, 10);

    const duplicateKeys = new Map<string, Transaction[]>();
    const externalIds = new Map<string, Transaction[]>();

    for (const tx of transactions) {
        if (!accountIds.has(tx.accountId)) {
            issues.push({ code: 'missing-account', severity: 'error', message: `Transaction ${tx.id} uses a missing account.`, entityId: tx.id });
        }
        if (tx.toAccountId && !accountIds.has(tx.toAccountId)) {
            issues.push({ code: 'missing-account', severity: 'error', message: `Transaction ${tx.id} uses a missing destination account.`, entityId: tx.id });
        }
        if (tx.categoryId && !categoryIds.has(tx.categoryId)) {
            issues.push({ code: 'missing-category', severity: 'error', message: `Transaction ${tx.id} uses a missing category.`, entityId: tx.id });
        }
        if (tx.type === 'Transfer' && tx.toAccountId === tx.accountId) {
            issues.push({ code: 'transfer-self', severity: 'error', message: `Transfer ${tx.id} has the same source and destination.`, entityId: tx.id });
        }
        if (!(tx.amount > 0)) {
            issues.push({ code: 'bad-amount', severity: 'error', message: `Transaction ${tx.id} has a non-positive amount.`, entityId: tx.id });
        }
        if (day(tx.date) > today) {
            issues.push({ code: 'future-date', severity: 'warning', message: `Transaction ${tx.id} is dated in the future.`, entityId: tx.id });
        }

        const duplicateKey = `${day(tx.date)}|${tx.amount}|${tx.accountId}`;
        duplicateKeys.set(duplicateKey, [...(duplicateKeys.get(duplicateKey) || []), tx]);

        if (tx.externalId) {
            externalIds.set(tx.externalId, [...(externalIds.get(tx.externalId) || []), tx]);
        }
    }

    for (const group of duplicateKeys.values()) {
        if (group.length < 2) continue;
        issues.push({
            code: 'possible-duplicate',
            severity: 'warning',
            message: `${group.length} transactions share the same date, amount and account (${day(group[0].date)}).`,
            entityId: group[0].id,
        });
    }

    for (const [externalId, group] of externalIds) {
        if (group.length < 2) continue;
        issues.push({
            code: 'duplicate-external-id',
            severity: 'error',
            message: `${group.length} transactions share externalId "${externalId}".`,
            entityId: group[0].id,
        });
    }

    for (const budget of budgets) {
        if (!categoryIds.has(budget.categoryId)) {
            issues.push({ code: 'budget-missing-category', severity: 'error', message: `Budget ${budget.id} targets a missing category.`, entityId: budget.id });
        }
    }

    for (const account of accounts) {
        const expected = expectedBalances.get(account.id);
        if (expected === undefined) continue;
        if (Math.abs(account.balance - expected) > 0.005) {
            issues.push({
                code: 'balance-drift',
                severity: 'error',
                message: `${account.name} stores ${account.balance.toFixed(2)} but its transactions imply ${expected.toFixed(2)}.`,
                entityId: account.id,
            });
        }
    }

    return {
        checkedAt: new Date().toISOString(),
        counts: {
            accounts: accounts.length,
            transactions: transactions.length,
            categories: categories.length,
            budgets: budgets.length,
        },
        issues,
    };
};
