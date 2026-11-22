import type { Budget } from '../../types';
import { convert, fmtMoney } from '../format';
import type { DesktopStore } from '../store';
import { Card, Empty, Icon } from '../ui';

export const BudgetsView = ({
    store,
    onNew,
    onEdit,
    onDelete,
}: {
    store: DesktopStore;
    onNew: () => void;
    onEdit: (budget: Budget) => void;
    onDelete: (budget: Budget) => void;
}) => {
    const { budgets, budgetSpend, categories, settings } = store;
    const main = (settings?.mainCurrency as Budget['currency']) || 'PKR';
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    if (budgets.length === 0) {
        return (
            <Card>
                <Empty message="No budgets yet" />
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 20 }}>
                    <button className="btn" onClick={onNew}><Icon name="plus" /> Add the first budget</button>
                </div>
            </Card>
        );
    }

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="section-title">Spend this month · {monthLabel}</div>
                <button className="btn sm" onClick={onNew}><Icon name="plus" /> New budget</button>
            </div>
            <Card>
                {budgets.map(budget => {
                    const category = categories.find(entry => entry.id === budget.categoryId);
                    const spent = budgetSpend[budget.categoryId] || 0;
                    const limit = convert(budget.amount, budget.currency, main, settings);
                    const percent = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const over = spent > limit;
                    return (
                        <div className="budget-row" key={budget.id}>
                            <div>
                                <div className="budget-name">
                                    {category ? category.icon || '🏷️' : '🏷️'} {category ? category.name : 'Unknown category'}
                                    {over ? <span className="badge Expense">Over budget</span> : null}
                                </div>
                                <div className="budget-sub">
                                    {fmtMoney(spent, main)} of {fmtMoney(limit, main)} · {Math.round(percent)}% used
                                </div>
                                <div className="progress" style={{ marginTop: 8 }}>
                                    <span style={{ width: `${percent}%`, background: over ? 'var(--expense)' : 'var(--primary)' }} />
                                </div>
                            </div>
                            <div className="budget-right">
                                <b className={over ? 'neg' : ''}>{fmtMoney(Math.max(0, limit - spent), main)}</b>
                                <small>{over ? 'over' : 'remaining'}</small>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 6 }}>
                                    <button className="btn sm ghost" onClick={() => onEdit(budget)} title="Edit budget"><Icon name="edit" /></button>
                                    <button className="btn sm ghost" onClick={() => onDelete(budget)} title="Delete budget"><Icon name="trash" /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </Card>
        </>
    );
};
