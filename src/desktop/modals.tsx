import { useState } from 'react';
import type { Account, Budget, Currency, RecurringTransaction, Transaction } from '../types';
import type { AccountInput, RecurringInput, TransactionInput } from './api/client';
import { DatePicker } from './DatePicker';
import { isoDay } from './format';
import type { DesktopStore } from './store';
import { Empty, Field, Icon, Modal } from './ui';
import type { ModalState, TransactionView } from './types';

const CURRENCIES: Currency[] = ['PKR', 'USD', 'AED', 'MYR'];

export interface ModalActions {
    close: () => void;
    createTransaction: (input: TransactionInput) => Promise<void>;
    updateTransaction: (id: string, input: TransactionInput) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
    createAccount: (input: AccountInput) => Promise<void>;
    updateAccount: (id: string, input: Partial<AccountInput>) => Promise<void>;
    deleteAccount: (id: string) => Promise<void>;
    createBudget: (input: { categoryId: string; amount: number; currency: Currency }) => Promise<void>;
    updateBudget: (id: string, input: { amount: number; currency: Currency }) => Promise<void>;
    deleteBudget: (id: string) => Promise<void>;
    createRecurring: (input: RecurringInput) => Promise<void>;
}

const today = () => isoDay(new Date());

export const TransactionModal = ({
    store,
    tx,
    actions,
}: {
    store: DesktopStore;
    tx: TransactionView | null;
    actions: ModalActions;
}) => {
    const { accounts, categories, settings } = store;
    const main = (settings?.mainCurrency as Currency) || 'PKR';
    const [type, setType] = useState<Transaction['type']>(tx ? tx.type : 'Expense');
    const [date, setDate] = useState(tx ? tx.date.slice(0, 10) : today());
    const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
    const [currency, setCurrency] = useState<Currency>(tx ? tx.currency : main);
    const [fee, setFee] = useState(tx && tx.fee ? String(tx.fee) : '');
    const [accountId, setAccountId] = useState(tx ? tx.accountId : accounts[0]?.id || '');
    const [categoryId, setCategoryId] = useState(tx && tx.categoryId ? tx.categoryId : '');
    const [toAccountId, setToAccountId] = useState(tx && tx.toAccountId ? tx.toAccountId : '');
    const [note, setNote] = useState(tx ? tx.note || '' : '');
    const [hidden, setHidden] = useState(tx ? tx.hidden === 1 : false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const visibleCategories = categories.filter(category => category.type === type);
    const selectable = visibleCategories.length > 0 ? visibleCategories : categories;
    const chosenCategory = categoryId || (selectable[0] ? selectable[0].id : '');

    const pickAccount = (nextId: string) => {
        setAccountId(nextId);
        const account = accounts.find(entry => entry.id === nextId);
        if (account) setCurrency(account.currency);
    };

    const submit = async () => {
        setError(null);
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) return setError('Enter an amount greater than zero.');
        if (!accountId) return setError('Choose an account.');
        if (type !== 'Transfer' && !chosenCategory) return setError('Choose a category.');
        if (type === 'Transfer' && (!toAccountId || toAccountId === accountId)) return setError('Choose a different destination account.');

        const input: TransactionInput = {
            type: type.toLowerCase(),
            amount: parsed,
            currency,
            accountId,
            date,
            categoryId: type === 'Transfer' ? undefined : chosenCategory,
            toAccountId: type === 'Transfer' ? toAccountId : undefined,
            fee: fee ? Number(fee) : undefined,
            note: note.trim() || undefined,
            hidden: hidden || undefined,
        };

        setBusy(true);
        try {
            if (tx) await actions.updateTransaction(tx.id, input);
            else await actions.createTransaction(input);
            actions.close();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            wide
            title={tx ? 'Edit transaction' : 'New transaction'}
            subtitle={tx ? 'Changes recalculate account balances' : 'Written to the ledger and synced everywhere'}
            onClose={actions.close}
            footer={
                <>
                    {tx ? (
                        <button
                            className="btn danger"
                            onClick={async () => {
                                await actions.deleteTransaction(tx.id);
                                actions.close();
                            }}
                        >
                            Delete
                        </button>
                    ) : null}
                    <span className="spacer" />
                    <button className="btn" onClick={actions.close}>Cancel</button>
                    <button className="btn primary" onClick={submit} disabled={busy}>{tx ? 'Save changes' : 'Add transaction'}</button>
                </>
            }
        >
            <div className="row">
                <Field label="Type">
                    <select value={type} onChange={event => setType(event.target.value as Transaction['type'])}>
                        <option value="Income">Income</option>
                        <option value="Expense">Expense</option>
                        <option value="Transfer">Transfer</option>
                    </select>
                </Field>
                <Field label="Date">
                    <DatePicker value={date} onChange={setDate} label="Transaction date" />
                </Field>
            </div>
            <div className="row">
                <Field label="Amount">
                    <input type="number" step="0.01" min="0" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Currency">
                    <select value={currency} onChange={event => setCurrency(event.target.value as Currency)}>
                        {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </Field>
                <Field label="Fee (optional)">
                    <input type="number" step="0.01" min="0" value={fee} onChange={event => setFee(event.target.value)} />
                </Field>
            </div>
            <div className="row">
                <Field label={type === 'Transfer' ? 'From account' : 'Account'}>
                    <select value={accountId} onChange={event => pickAccount(event.target.value)}>
                        {accounts.map(account => (
                            <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                        ))}
                    </select>
                </Field>
                {type === 'Transfer' ? (
                    <Field label="To account">
                        <select value={toAccountId} onChange={event => setToAccountId(event.target.value)}>
                            <option value="">Choose…</option>
                            {accounts.filter(account => account.id !== accountId).map(account => (
                                <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                            ))}
                        </select>
                    </Field>
                ) : (
                    <Field label="Category">
                        <select value={chosenCategory} onChange={event => setCategoryId(event.target.value)}>
                            {selectable.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                    </Field>
                )}
            </div>
            <Field label="Note">
                <input type="text" value={note} onChange={event => setNote(event.target.value)} placeholder="What was this for?" />
            </Field>
            <label className="switch">
                <input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} />
                <span>Hide amount in lists</span>
            </label>
            {error ? <div className="banner" style={{ margin: 0 }}><Icon name="alert" />{error}</div> : null}
        </Modal>
    );
};

export const AccountModal = ({
    store,
    account,
    actions,
}: {
    store: DesktopStore;
    account: Account | null;
    actions: ModalActions;
}) => {
    const main = (store.settings?.mainCurrency as Currency) || 'PKR';
    const [name, setName] = useState(account ? account.name : '');
    const [type, setType] = useState<Account['type']>(account ? account.type : 'Bank');
    const [currency, setCurrency] = useState<Currency>(account ? account.currency : main);
    const [initialBalance, setInitialBalance] = useState(account ? String(account.initialBalance) : '0');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setError(null);
        if (!name.trim()) return setError('Give the account a name.');
        setBusy(true);
        try {
            if (account) {
                await actions.updateAccount(account.id, { name: name.trim(), type: type.toLowerCase() });
            } else {
                await actions.createAccount({
                    name: name.trim(),
                    type: type.toLowerCase(),
                    currency,
                    initialBalance: Number(initialBalance) || 0,
                });
            }
            actions.close();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            title={account ? 'Edit account' : 'New account'}
            subtitle={account ? 'Opening balance cannot change once transactions exist' : 'Create an account to track a balance'}
            onClose={actions.close}
            footer={
                <>
                    {account ? (
                        <button
                            className="btn danger"
                            onClick={async () => {
                                await actions.deleteAccount(account.id);
                                actions.close();
                            }}
                        >
                            Delete
                        </button>
                    ) : null}
                    <span className="spacer" />
                    <button className="btn" onClick={actions.close}>Cancel</button>
                    <button className="btn primary" onClick={submit} disabled={busy}>{account ? 'Save' : 'Create account'}</button>
                </>
            }
        >
            <Field label="Name">
                <input type="text" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. HBL Bank" />
            </Field>
            <div className="row">
                <Field label="Type">
                    <select value={type} onChange={event => setType(event.target.value as Account['type'])}>
                        <option value="Bank">Bank</option>
                        <option value="Cash">Cash</option>
                        <option value="Investment">Investment</option>
                    </select>
                </Field>
                <Field label="Currency">
                    <select value={currency} onChange={event => setCurrency(event.target.value as Currency)} disabled={!!account}>
                        {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </Field>
            </div>
            {account ? (
                <Field label="Opening balance" hint="Managed by the app once transactions exist.">
                    <input type="number" value={account.initialBalance} disabled />
                </Field>
            ) : (
                <Field label="Opening balance">
                    <input type="number" step="0.01" value={initialBalance} onChange={event => setInitialBalance(event.target.value)} />
                </Field>
            )}
            {error ? <div className="banner" style={{ margin: 0 }}><Icon name="alert" />{error}</div> : null}
        </Modal>
    );
};

export const BudgetModal = ({
    store,
    budget,
    actions,
}: {
    store: DesktopStore;
    budget: Budget | null;
    actions: ModalActions;
}) => {
    const { categories, budgets, settings } = store;
    const main = (settings?.mainCurrency as Currency) || 'PKR';
    const used = new Set(budgets.map(item => item.categoryId));
    const options = categories.filter(category =>
        category.type === 'Expense' && (budget ? category.id === budget.categoryId : !used.has(category.id))
    );
    const [categoryId, setCategoryId] = useState(budget ? budget.categoryId : options[0]?.id || '');
    const [amount, setAmount] = useState(budget ? String(budget.amount) : '');
    const [currency, setCurrency] = useState<Currency>(budget ? budget.currency : main);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setError(null);
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) return setError('Enter a monthly limit.');
        if (!budget && !categoryId) return setError('Choose a category.');
        setBusy(true);
        try {
            if (budget) await actions.updateBudget(budget.id, { amount: parsed, currency });
            else await actions.createBudget({ categoryId, amount: parsed, currency });
            actions.close();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            title={budget ? 'Edit budget' : 'New budget'}
            subtitle="Monthly limit per expense category"
            onClose={actions.close}
            footer={
                <>
                    {budget ? (
                        <button
                            className="btn danger"
                            onClick={async () => {
                                await actions.deleteBudget(budget.id);
                                actions.close();
                            }}
                        >
                            Delete
                        </button>
                    ) : null}
                    <span className="spacer" />
                    <button className="btn" onClick={actions.close}>Cancel</button>
                    <button className="btn primary" onClick={submit} disabled={busy}>{budget ? 'Save' : 'Create budget'}</button>
                </>
            }
        >
            <Field label="Category">
                {options.length ? (
                    <select value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={!!budget}>
                        {options.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                ) : (
                    <Empty message="Every expense category already has a budget" />
                )}
            </Field>
            <div className="row">
                <Field label="Monthly amount">
                    <input type="number" step="0.01" min="0" value={amount} onChange={event => setAmount(event.target.value)} />
                </Field>
                <Field label="Currency">
                    <select value={currency} onChange={event => setCurrency(event.target.value as Currency)}>
                        {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </Field>
            </div>
            {error ? <div className="banner" style={{ margin: 0 }}><Icon name="alert" />{error}</div> : null}
        </Modal>
    );
};

export const RecurringModal = ({
    store,
    actions,
}: {
    store: DesktopStore;
    actions: ModalActions;
}) => {
    const { accounts, categories, settings } = store;
    const main = (settings?.mainCurrency as Currency) || 'PKR';
    const [type, setType] = useState<Transaction['type']>('Expense');
    const [frequency, setFrequency] = useState<RecurringTransaction['frequency']>('monthly');
    const [nextRunDate, setNextRunDate] = useState(isoDay(new Date(Date.now() + 86400000)));
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<Currency>(main);
    const [accountId, setAccountId] = useState(accounts[0]?.id || '');
    const [categoryId, setCategoryId] = useState('');
    const [toAccountId, setToAccountId] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const visibleCategories = categories.filter(category => category.type === type);
    const chosenCategory = categoryId || (visibleCategories[0] ? visibleCategories[0].id : '');

    const submit = async () => {
        setError(null);
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) return setError('Enter an amount greater than zero.');
        if (!accountId) return setError('Choose an account.');
        if (type === 'Transfer' ? !toAccountId || toAccountId === accountId : !chosenCategory) {
            return setError(type === 'Transfer' ? 'Choose a different destination account.' : 'Choose a category.');
        }
        setBusy(true);
        try {
            await actions.createRecurring({
                type: type.toLowerCase(),
                amount: parsed,
                currency,
                accountId,
                categoryId: type === 'Transfer' ? undefined : chosenCategory,
                toAccountId: type === 'Transfer' ? toAccountId : undefined,
                date: nextRunDate,
                frequency,
                nextRunDate,
                note: note.trim() || undefined,
            });
            actions.close();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            wide
            title="New recurring rule"
            subtitle="The app creates the transaction automatically"
            onClose={actions.close}
            footer={
                <>
                    <span className="spacer" />
                    <button className="btn" onClick={actions.close}>Cancel</button>
                    <button className="btn primary" onClick={submit} disabled={busy}>Create rule</button>
                </>
            }
        >
            <div className="row">
                <Field label="Type">
                    <select value={type} onChange={event => setType(event.target.value as Transaction['type'])}>
                        <option value="Income">Income</option>
                        <option value="Expense">Expense</option>
                        <option value="Transfer">Transfer</option>
                    </select>
                </Field>
                <Field label="Frequency">
                    <select value={frequency} onChange={event => setFrequency(event.target.value as RecurringTransaction['frequency'])}>
                        <option value="daily">daily</option>
                        <option value="weekly">weekly</option>
                        <option value="monthly">monthly</option>
                    </select>
                </Field>
                <Field label="Next run">
                    <DatePicker value={nextRunDate} onChange={setNextRunDate} label="Next run date" />
                </Field>
            </div>
            <div className="row">
                <Field label="Amount">
                    <input type="number" step="0.01" min="0" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Currency">
                    <select value={currency} onChange={event => setCurrency(event.target.value as Currency)}>
                        {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </Field>
            </div>
            <div className="row">
                <Field label={type === 'Transfer' ? 'From account' : 'Account'}>
                    <select value={accountId} onChange={event => setAccountId(event.target.value)}>
                        {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                    </select>
                </Field>
                {type === 'Transfer' ? (
                    <Field label="To account">
                        <select value={toAccountId} onChange={event => setToAccountId(event.target.value)}>
                            <option value="">Choose…</option>
                            {accounts.filter(account => account.id !== accountId).map(account => (
                                <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                        </select>
                    </Field>
                ) : (
                    <Field label="Category">
                        <select value={chosenCategory} onChange={event => setCategoryId(event.target.value)}>
                            {visibleCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                    </Field>
                )}
            </div>
            <Field label="Note">
                <input type="text" value={note} onChange={event => setNote(event.target.value)} placeholder="Rent, salary, subscription…" />
            </Field>
            {error ? <div className="banner" style={{ margin: 0 }}><Icon name="alert" />{error}</div> : null}
        </Modal>
    );
};

export const ConfirmModal = ({ state, onClose }: { state: Extract<ModalState, { kind: 'confirm' }>; onClose: () => void }) => {
    return (
        <Modal
            title={state.title}
            subtitle="This cannot be undone."
            onClose={onClose}
            footer={
                <>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button
                        className="btn danger"
                        onClick={async () => {
                            try {
                                await state.run();
                            } finally {
                                onClose();
                            }
                        }}
                    >
                        {state.confirmLabel}
                    </button>
                </>
            }
        >
            <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{state.message}</p>
        </Modal>
    );
};
