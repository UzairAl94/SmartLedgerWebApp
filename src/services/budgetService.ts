import { sqliteService } from './sqliteService';
import type { Budget } from '../types';

type Listener = (budgets: Budget[]) => void;

class BudgetService {
    private listeners: Listener[] = [];

    subscribeToBudgets(onUpdate: Listener) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify();
        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify() {
        try {
            const budgets = await this.getAllBudgets();
            this.listeners.forEach(listener => listener(budgets));
        } catch (error) {
            console.error('Error fetching and notifying budgets:', error);
        }
    }

    async getAllBudgets(): Promise<Budget[]> {
        const result = await sqliteService.query('SELECT * FROM budgets');
        return (result.values || []) as Budget[];
    }

    async addBudget(budget: Omit<Budget, 'id'>) {
        const id = crypto.randomUUID();
        await sqliteService.execute(
            'INSERT INTO budgets (id, categoryId, amount, currency, period) VALUES (?, ?, ?, ?, ?)',
            [id, budget.categoryId, budget.amount, budget.currency, budget.period]
        );
        await this.fetchAndNotify();
        return id;
    }

    async updateBudget(id: string, amount: number, currency: string) {
        await sqliteService.execute(
            'UPDATE budgets SET amount = ?, currency = ? WHERE id = ?',
            [amount, currency, id]
        );
        await this.fetchAndNotify();
    }

    async deleteBudget(id: string) {
        await sqliteService.execute('DELETE FROM budgets WHERE id = ?', [id]);
        await this.fetchAndNotify();
    }
}

export const budgetService = new BudgetService();
