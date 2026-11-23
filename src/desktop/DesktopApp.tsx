import { useState } from 'react';
import { useDesktopStore } from './store';
import { ConnectGate, Sidebar, Toasts, Topbar } from './shell';
import { AccountModal, BudgetModal, ConfirmModal, RecurringModal, TransactionModal, type ModalActions } from './modals';
import { DashboardView } from './views/Dashboard';
import { TransactionsView } from './views/Transactions';
import { AccountsView } from './views/Accounts';
import { BudgetsView } from './views/Budgets';
import { RecurringView } from './views/Recurring';
import { ImportsView } from './views/Imports';
import { ReconcileView } from './views/Reconcile';
import { ActivityView } from './views/Activity';
import { DiagnosticsView } from './views/Diagnostics';
import { ApiView } from './views/Api';
import { SettingsView } from './views/Settings';
import { Card, Empty, Icon, SkeletonPage } from './ui';
import { IconSprite } from './sprite';
import type { ModalState, TransactionView } from './types';
import type { RecurringTransaction, UserSettings } from '../types';

const copy = async (text: string, label: string, notify: (text: string, kind?: 'ok' | 'error' | '') => void) => {
    try {
        await navigator.clipboard.writeText(text);
        notify(`${label} copied`, 'ok');
    } catch {
        notify('Clipboard blocked — select the text manually', 'error');
    }
};

export const DesktopApp = () => {
    const store = useDesktopStore();
    const [modal, setModal] = useState<ModalState | null>(null);
    const [gateOpen, setGateOpen] = useState(!store.connection);

    const client = store.client;

    const close = () => setModal(null);

    const actions: ModalActions = {
        close,
        createTransaction: async input => {
            if (!client) return;
            await client.createTransaction(input);
            store.notify('Transaction added', 'ok');
            await store.refresh();
        },
        updateTransaction: async (id, input) => {
            if (!client) return;
            await client.updateTransaction(id, input);
            store.notify('Transaction updated', 'ok');
            await store.refresh();
        },
        deleteTransaction: async id => {
            if (!client) return;
            await client.deleteTransaction(id);
            store.notify('Transaction deleted', 'ok');
            await store.refresh();
        },
        createAccount: async input => {
            if (!client) return;
            await client.createAccount(input);
            store.notify('Account created', 'ok');
            await store.refresh();
        },
        updateAccount: async (id, input) => {
            if (!client) return;
            await client.updateAccount(id, input);
            store.notify('Account updated', 'ok');
            await store.refresh();
        },
        deleteAccount: async id => {
            if (!client) return;
            await client.deleteAccount(id);
            store.notify('Account deleted', 'ok');
            await store.refresh();
        },
        createBudget: async input => {
            if (!client) return;
            await client.createBudget(input);
            store.notify('Budget created', 'ok');
            await store.refresh();
        },
        updateBudget: async (id, input) => {
            if (!client) return;
            await client.updateBudget(id, input);
            store.notify('Budget updated', 'ok');
            await store.refresh();
        },
        deleteBudget: async id => {
            if (!client) return;
            await client.deleteBudget(id);
            store.notify('Budget deleted', 'ok');
            await store.refresh();
        },
        createRecurring: async input => {
            if (!client) return;
            await client.createRecurring(input);
            store.notify('Recurring rule created', 'ok');
            await store.refresh();
        },
    };

    const confirmDelete = (kind: 'transaction' | 'account' | 'budget' | 'recurring' | 'import', id: string, label: string) => {
        const titles: Record<string, [string, string]> = {
            transaction: ['Delete transaction?', 'The account balance will be adjusted back.'],
            account: ['Delete account?', 'Its transactions are removed too, and balances recalculate.'],
            budget: ['Delete budget?', 'Spending history is not affected.'],
            recurring: ['Delete recurring rule?', 'Future transactions will not be created.'],
            import: ['Undo this import?', 'Every transaction in the batch is deleted and balances are recalculated.'],
        };
        const [title, message] = titles[kind];
        setModal({
            kind: 'confirm',
            title,
            message,
            confirmLabel: label,
            run: async () => {
                if (!client) return;
                try {
                    if (kind === 'transaction') await client.deleteTransaction(id);
                    else if (kind === 'account') await client.deleteAccount(id);
                    else if (kind === 'budget') await client.deleteBudget(id);
                    else if (kind === 'recurring') await client.deleteRecurring(id);
                    else await client.undoImport(id);
                    store.notify('Deleted', 'ok');
                    await store.refresh();
                } catch (caught) {
                    store.notify(caught instanceof Error ? caught.message : String(caught), 'error');
                }
            },
        });
    };

    const openTransaction = (row: TransactionView | null) => setModal({ kind: 'tx', tx: row });

    const renderView = () => {
        if (!store.connection) return null;
        if (store.error) {
            return (
                <div className="banner">
                    <Icon name="alert" />
                    <span className="grow">{store.error}</span>
                    <button className="btn sm" onClick={() => store.refresh()}>Retry</button>
                    <button className="btn sm ghost" onClick={() => setGateOpen(true)}>Change server</button>
                </div>
            );
        }
        if (store.loading && store.page !== 'transactions') return <SkeletonPage />;

        switch (store.page) {
            case 'dashboard':
                return (
                    <DashboardView
                        store={store}
                        onNewTransaction={() => openTransaction(null)}
                        onEdit={openTransaction}
                        onDelete={row => confirmDelete('transaction', row.id, 'Delete')}
                        onOpenAccounts={() => store.navigate('accounts')}
                        onOpenLedger={() => store.navigate('transactions')}
                    />
                );
            case 'transactions':
                return (
                    <TransactionsView
                        store={store}
                        onEdit={openTransaction}
                        onDelete={row => confirmDelete('transaction', row.id, 'Delete')}
                    />
                );
            case 'accounts':
                return (
                    <AccountsView
                        store={store}
                        onNew={() => setModal({ kind: 'account', account: null })}
                        onEdit={account => setModal({ kind: 'account', account })}
                        onDelete={account => confirmDelete('account', account.id, 'Delete account')}
                        onViewTransactions={account => {
                            store.setFilters({ accountId: account.id });
                            store.navigate('transactions');
                        }}
                    />
                );
            case 'budgets':
                return (
                    <BudgetsView
                        store={store}
                        onNew={() => setModal({ kind: 'budget', budget: null })}
                        onEdit={budget => setModal({ kind: 'budget', budget })}
                        onDelete={budget => confirmDelete('budget', budget.id, 'Delete budget')}
                    />
                );
            case 'recurring':
                return (
                    <RecurringView
                        store={store}
                        onNew={() => setModal({ kind: 'recurring' })}
                        onToggle={async (rule: RecurringTransaction) => {
                            if (!client) return;
                            try {
                                await client.setRecurringActive(rule.id, rule.active !== 1);
                                await store.refresh();
                            } catch (caught) {
                                store.notify(caught instanceof Error ? caught.message : String(caught), 'error');
                            }
                        }}
                        onDelete={rule => confirmDelete('recurring', rule.id, 'Delete rule')}
                    />
                );
            case 'imports':
                return <ImportsView store={store} onUndo={batchId => confirmDelete('import', batchId, 'Undo import')} />;
            case 'reconcile':
                return <ReconcileView store={store} />;
            case 'activity':
                return <ActivityView store={store} />;
            case 'diagnostics':
                return <DiagnosticsView store={store} />;
            case 'api':
                return (
                    <ApiView
                        store={store}
                        onRefresh={() => store.refresh()}
                        onCopyConnection={() =>
                            copy(JSON.stringify({ baseUrl: store.connection?.baseUrl, token: store.connection?.token }, null, 2), 'Connection JSON', store.notify)
                        }
                        onCopyCurl={() =>
                            copy(
                                `curl -s ${store.connection?.baseUrl}/api/health -H "Authorization: Bearer ${store.connection?.token}"`,
                                'curl command',
                                store.notify
                            )
                        }
                        onOpenConnect={() => setGateOpen(true)}
                    />
                );
            case 'settings':
                return (
                    <SettingsView
                        store={store}
                        onSave={async (patch: Partial<UserSettings>) => {
                            if (!client) return;
                            try {
                                await client.updateSettings(patch);
                                store.notify('Preferences saved', 'ok');
                                await store.refresh();
                            } catch (caught) {
                                store.notify(caught instanceof Error ? caught.message : String(caught), 'error');
                            }
                        }}
                        onExport={async () => {
                            if (!client) return;
                            try {
                                const data = await client.exportLedger();
                                await copy(JSON.stringify(data, null, 2), 'Export JSON', store.notify);
                            } catch (caught) {
                                store.notify(caught instanceof Error ? caught.message : String(caught), 'error');
                            }
                        }}
                        onOpenConnect={() => setGateOpen(true)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <>
            <IconSprite />
            <div className="app">
                <Sidebar store={store} onConnect={() => setGateOpen(true)} />
                <div className="main">
                    <Topbar store={store} onRefresh={() => store.refresh()} onNewTransaction={() => openTransaction(null)} />
                    <div className="view">
                        {store.loading ? <div className="loading-bar" /> : null}
                        {store.connection ? renderView() : (
                            <Card>
                                <Empty message="Connect to the phone to see your ledger." />
                                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 22 }}>
                                    <button className="btn primary" onClick={() => setGateOpen(true)}><Icon name="plug" /> Connect to phone</button>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {modal?.kind === 'tx' ? <TransactionModal store={store} tx={modal.tx} actions={actions} /> : null}
            {modal?.kind === 'account' ? <AccountModal store={store} account={modal.account} actions={actions} /> : null}
            {modal?.kind === 'budget' ? <BudgetModal store={store} budget={modal.budget} actions={actions} /> : null}
            {modal?.kind === 'recurring' ? <RecurringModal store={store} actions={actions} /> : null}
            {modal?.kind === 'confirm' ? <ConfirmModal state={modal} onClose={close} /> : null}

            {gateOpen ? <ConnectGate store={store} onClose={() => setGateOpen(false)} /> : null}
            <Toasts store={store} />
        </>
    );
};
