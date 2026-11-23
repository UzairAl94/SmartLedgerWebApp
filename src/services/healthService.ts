import { accountService } from './accountService';
import { categoryService } from './categoryService';
import { transactionService } from './transactionService';
import { budgetService } from './budgetService';
import { settingsService } from './settingsService';
import { accountDeltas } from './ledgerMath';
import { analyzeLedger, type HealthReport } from './healthCheck';

export type { HealthReport, HealthIssue } from './healthCheck';

export const healthService = {
    async runChecks(): Promise<HealthReport> {
        const [accounts, categories, transactions, budgets, settings] = await Promise.all([
            accountService.getAllAccounts(),
            categoryService.getAllCategories(),
            transactionService.getAllTransactions(),
            budgetService.getAllBudgets(),
            settingsService.getSettings(),
        ]);

        const deltas = accountDeltas(transactions, accounts, settings);
        const expectedBalances = new Map(
            accounts.map(account => [account.id, account.initialBalance + (deltas.get(account.id) ?? 0)])
        );

        return analyzeLedger({ accounts, categories, transactions, budgets, expectedBalances });
    },
};
