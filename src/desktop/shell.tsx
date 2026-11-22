import { useEffect, useState } from 'react';
import { Icon } from './ui';
import { PAGE_META, RANGE_OPTIONS, type Connection, type PageKey } from './types';
import type { DesktopStore } from './store';

const NAV: Array<{ page: PageKey; icon: string; label: string }> = [
    { page: 'dashboard', icon: 'grid', label: 'Overview' },
    { page: 'transactions', icon: 'list', label: 'Transactions' },
    { page: 'accounts', icon: 'wallet', label: 'Accounts' },
    { page: 'budgets', icon: 'target', label: 'Budgets' },
    { page: 'recurring', icon: 'repeat', label: 'Recurring' },
    { page: 'imports', icon: 'import', label: 'Imports' },
];

const TOOLS: Array<{ page: PageKey; icon: string; label: string }> = [
    { page: 'api', icon: 'plug', label: 'API & Sync' },
    { page: 'settings', icon: 'gear', label: 'Settings' },
];

export const Sidebar = ({
    store,
    onConnect,
}: {
    store: DesktopStore;
    onConnect: () => void;
}) => {
    const { page, connection, navigate, transactions, transactionTotal } = store;
    const items = NAV.map(item => (
        <button
            key={item.page}
            className={`nav-item ${page === item.page ? 'active' : ''}`.trim()}
            onClick={() => navigate(item.page)}
        >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.page === 'transactions' && transactionTotal > 0 ? <span className="nav-badge">{transactionTotal}</span> : null}
        </button>
    ));

    return (
        <aside className="sidebar">
            <div className="brand">
                <div className="brand-mark">S</div>
                <div className="brand-text">
                    <div className="brand-name">Smart Ledger</div>
                    <div className="brand-sub">Desktop client</div>
                </div>
            </div>
            <div className="nav-group">
                <div className="nav-label">Ledger</div>
                {items}
            </div>
            <div className="nav-group">
                <div className="nav-label">System</div>
                {TOOLS.map(item => (
                    <button
                        key={item.page}
                        className={`nav-item ${page === item.page ? 'active' : ''}`.trim()}
                        onClick={() => navigate(item.page)}
                    >
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
            <div className="sidebar-foot">
                <div className="conn-card">
                    <div className="conn-row">
                        <span className={`dot ${connection ? 'live' : 'demo'}`} />
                        {connection ? 'Phone connected' : 'Not connected'}
                    </div>
                    <div className="conn-meta">{connection ? connection.baseUrl.replace(/^https?:\/\//, '') : 'no server'}</div>
                    <button className="btn sm conn-btn" style={{ marginTop: 8, width: '100%' }} onClick={onConnect}>
                        {connection ? 'Connection settings' : 'Connect to phone'}
                    </button>
                </div>
                <div className="conn-meta" style={{ textAlign: 'center' }}>
                    {transactions.length ? 'desktop web client' : 'desktop web client'}
                </div>
            </div>
        </aside>
    );
};

export const Topbar = ({
    store,
    onRefresh,
    onNewTransaction,
}: {
    store: DesktopStore;
    onRefresh: () => void;
    onNewTransaction: () => void;
}) => {
    const { page, range, setRange, theme, setTheme, connection } = store;
    const showRange = page === 'dashboard';
    const showNew = page === 'dashboard' || page === 'transactions';
    const [title, subtitle] = PAGE_META[page];

    return (
        <header className="topbar">
            <div className="tb-title">
                <h1>{title}</h1>
                <p>{subtitle}</p>
            </div>
            <div className="tb-actions">
                <span className={`chip ${connection ? 'live' : 'demo'}`}>
                    <Icon name={connection ? 'link' : 'alert'} />
                    {connection ? 'Live' : 'Offline'}
                </span>
                {showRange ? (
                    <select value={range} onChange={event => setRange(event.target.value as typeof range)} aria-label="Date range">
                        {RANGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                ) : null}
                <select value={theme} onChange={event => setTheme(event.target.value as typeof theme)} aria-label="Theme">
                    <option value="system">system</option>
                    <option value="light">light</option>
                    <option value="dark">dark</option>
                </select>
                <button className="icon-btn" onClick={onRefresh} title="Refresh"><Icon name="refresh" /></button>
                {showNew ? <button className="btn primary" onClick={onNewTransaction}><Icon name="plus" /> New transaction</button> : null}
            </div>
        </header>
    );
};

export const Toasts = ({ store }: { store: DesktopStore }) => (
    <div className="toast-root">
        {store.toasts.map(toast => (
            <div key={toast.id} className={`toast ${toast.kind}`.trim()}>{toast.text}</div>
        ))}
    </div>
);

export const ConnectGate = ({ store, onClose }: { store: DesktopStore; onClose: () => void }) => {
    const [baseUrl, setBaseUrl] = useState(store.connection ? store.connection.baseUrl : '');
    const [token, setToken] = useState(store.connection ? store.connection.token : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (store.connection) {
            setBaseUrl(store.connection.baseUrl);
            setToken(store.connection.token);
        }
    }, [store.connection]);

    // If this page is already being served by the phone, its own origin is the
    // API. Probe once (an unauthenticated call answers 401 JSON) and prefill it.
    useEffect(() => {
        if (store.connection) return;
        let cancelled = false;
        fetch(`${window.location.origin}/api/health`)
            .then(response => {
                const json = (response.headers.get('content-type') || '').includes('application/json');
                if (!cancelled && json && (response.status === 401 || response.ok)) {
                    setBaseUrl(current => current || window.location.origin);
                }
            })
            .catch(() => {
                /* not served by the phone */
            });
        return () => {
            cancelled = true;
        };
    }, [store.connection]);

    const submit = async () => {
        setError(null);
        if (!baseUrl.trim() || !token.trim()) return setError('Base URL and access token are required.');
        setBusy(true);
        try {
            await store.connect({ baseUrl: baseUrl.trim(), token: token.trim() } as Connection);
            onClose();
            store.notify('Connected to your ledger', 'ok');
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="gate">
            <div className="gate-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div className="brand-mark">S</div>
                    <div>
                        <div className="brand-name">Smart Ledger</div>
                        <div className="brand-sub">Desktop web client</div>
                    </div>
                </div>
                <h2>Connect to your ledger</h2>
                <p>
                    Point this page at the local API running in the Android app. The ledger stays on the phone; this is
                    just a window into it.
                </p>
                <div className="gate-form">
                    <label className="field">
                        <span>Base URL</span>
                        <input type="text" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="http://192.168.1.23:8765" />
                    </label>
                    <label className="field">
                        <span>Access token</span>
                        <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Settings → Local API → Copy connection details" />
                    </label>
                    <div className="row">
                        <button className="btn primary grow" onClick={submit} disabled={busy}>
                            {busy ? <Icon name="refresh" /> : null} Connect
                        </button>
                        <button className="btn grow" onClick={onClose}>Cancel</button>
                    </div>
                </div>
                {error ? <div className="banner" style={{ marginTop: 14 }}><Icon name="alert" />{error}</div> : null}
                <p className="gate-note" style={{ marginTop: 16 }}>
                    Keep the phone awake with the server started (the “Smart Ledger API is running” notification). Plain
                    HTTP is blocked inside some sandboxed previews — open this page directly in your browser if the
                    connection fails.
                </p>
            </div>
        </div>
    );
};
