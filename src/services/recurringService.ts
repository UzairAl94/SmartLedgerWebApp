import { sqliteService } from './sqliteService';
import { transactionService } from './transactionService';
import { addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import type { RecurringTransaction, RecurringFrequency } from '../types';

type Listener = (rules: RecurringTransaction[]) => void;

const advance = (date: Date, frequency: RecurringFrequency): Date => {
    if (frequency === 'daily') return addDays(date, 1);
    if (frequency === 'weekly') return addWeeks(date, 1);
    return addMonths(date, 1);
};

class RecurringService {
    private listeners: Listener[] = [];

    subscribeToRecurring(onUpdate: Listener) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify();
        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify() {
        try {
            const rules = await this.getAll();
            this.listeners.forEach(listener => listener(rules));
        } catch (error) {
            console.error('Error fetching and notifying recurring rules:', error);
        }
    }

    async getAll(): Promise<RecurringTransaction[]> {
        const result = await sqliteService.query('SELECT * FROM recurring_transactions');
        return (result.values || []) as RecurringTransaction[];
    }

    async addRule(rule: Omit<RecurringTransaction, 'id'>) {
        const id = crypto.randomUUID();
        await sqliteService.execute(
            'INSERT INTO recurring_transactions (id, amount, currency, categoryId, accountId, toAccountId, note, type, fee, frequency, nextRunDate, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, rule.amount, rule.currency, rule.categoryId || null, rule.accountId, rule.toAccountId || null, rule.note || null, rule.type, rule.fee || null, rule.frequency, rule.nextRunDate, rule.active]
        );
        await this.fetchAndNotify();
        return id;
    }

    async setActive(id: string, active: number) {
        await sqliteService.execute('UPDATE recurring_transactions SET active = ? WHERE id = ?', [active, id]);
        await this.fetchAndNotify();
    }

    async deleteRule(id: string) {
        await sqliteService.execute('DELETE FROM recurring_transactions WHERE id = ?', [id]);
        await this.fetchAndNotify();
    }

    /**
     * Materialize all due recurring rules. Offline model: runs at app launch.
     * For each active rule with nextRunDate <= now, create the transaction(s)
     * to catch up to the present and advance nextRunDate.
     */
    async materializeDue(): Promise<number> {
        const rules = await this.getAll();
        const now = new Date();
        let created = 0;

        for (const rule of rules) {
            if (!rule.active) continue;

            let next = parseISO(rule.nextRunDate);
            let guard = 0; // cap catch-up iterations
            while (next.getTime() <= now.getTime() && guard < 400) {
                await transactionService.createTransaction({
                    amount: rule.amount,
                    currency: rule.currency,
                    categoryId: rule.type === 'Transfer' ? undefined : (rule.categoryId || undefined),
                    accountId: rule.accountId,
                    toAccountId: rule.type === 'Transfer' ? (rule.toAccountId || undefined) : undefined,
                    note: rule.note || undefined,
                    type: rule.type,
                    fee: rule.fee || undefined,
                    date: next.toISOString(),
                });
                created++;
                next = advance(next, rule.frequency);
                guard++;
            }

            if (guard > 0) {
                await sqliteService.execute(
                    'UPDATE recurring_transactions SET nextRunDate = ? WHERE id = ?',
                    [next.toISOString(), rule.id]
                );
            }
        }

        if (created > 0) await this.fetchAndNotify();
        return created;
    }
}

export const recurringService = new RecurringService();
