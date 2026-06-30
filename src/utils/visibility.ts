import type { Transaction, Category } from '../types';

export const MASK = '••••';

// A transaction's amount is masked if the transaction itself is flagged hidden
// or its category is flagged hidden. Masking is display-only — totals still count it.
export const isAmountHidden = (tx: Transaction, categories: Category[]): boolean => {
    if (tx.hidden) return true;
    if (!tx.categoryId) return false;
    return !!categories.find(c => c.id === tx.categoryId)?.hidden;
};
