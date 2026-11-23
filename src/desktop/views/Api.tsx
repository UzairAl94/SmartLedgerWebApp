import type { DesktopStore } from '../store';
import { fmtDateTime } from '../format';
import { Card, CardHead, Icon } from '../ui';

const ENDPOINTS = [
    'GET /api/health',
    'GET /api/version',
    'GET /api/logs',
    'GET|POST /api/transactions',
    'GET|PATCH|DELETE /api/transactions/:id',
    'POST /api/import/transactions',
    'GET /api/imports',
    'DELETE /api/imports/:batchId',
    'GET|POST /api/accounts',
    'PATCH|DELETE /api/accounts/:id',
    'GET|POST /api/categories',
    'DELETE /api/categories/:id',
    'GET|POST /api/budgets',
    'PATCH|DELETE /api/budgets/:id',
    'GET|POST /api/recurring',
    'PATCH|DELETE /api/recurring/:id',
    'GET|PATCH /api/settings',
    'GET /api/summary',
    'GET /api/balances',
    'GET /api/reconcile?accountId=…',
    'GET /api/audit',
    'POST /api/audit/:id/undo',
    'GET /api/diagnostics',
    'GET /api/export',
];

export const ApiView = ({
    store,
    onRefresh,
    onCopyConnection,
    onCopyCurl,
    onOpenConnect,
}: {
    store: DesktopStore;
    onRefresh: () => void;
    onCopyConnection: () => void;
    onCopyCurl: () => void;
    onOpenConnect: () => void;
}) => {
    const { api, connection } = store;
    const server = api.health?.server;

    return (
        <>
            <div className="grid two-col">
                <Card>
                    <CardHead title="Connection" subtitle="This page talks to the phone's local API" action={<span className="chip live">connected</span>} />
                    <div className="card-pad">
                        <div className="kv"><span>Base URL</span><b className="mono" style={{ fontSize: 11.5 }}>{connection ? connection.baseUrl : '—'}</b></div>
                        <div className="kv"><span>Latency</span><b>{api.latency != null ? `${api.latency} ms` : '—'}</b></div>
                        <div className="kv"><span>Server running</span><b>{server ? (server.running ? 'yes' : 'no') : '—'}</b></div>
                        <div className="kv"><span>Port</span><b>{server ? server.port : '—'}</b></div>
                        <div className="kv"><span>Addresses</span><b className="mono" style={{ fontSize: 11.5 }}>{server ? (server.addresses.join(', ') || server.host) : '—'}</b></div>
                        <div className="kv"><span>Requests served</span><b>{server ? server.requestCount : '—'}</b></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            <button className="btn" onClick={onRefresh}><Icon name="refresh" /> Refresh</button>
                            <button className="btn" onClick={onCopyConnection}>Copy connection JSON</button>
                            <button className="btn ghost" onClick={onOpenConnect}>Change server</button>
                        </div>
                    </div>
                </Card>
                <Card>
                    <CardHead title="Ledger size" subtitle="Confirmed by /api/health" />
                    <div className="card-pad">
                        {api.health
                            ? Object.entries(api.health.counts).map(([key, value]) => (
                                <div className="kv" key={key}><span>{key}</span><b>{value}</b></div>
                            ))
                            : <div className="skeleton" style={{ height: 120 }} />}
                        <div className="kv"><span>Main currency</span><b>{api.health ? api.health.mainCurrency : '—'}</b></div>
                    </div>
                </Card>
            </div>

            <Card style={{ marginTop: 16 }}>
                <CardHead title="Recent requests" subtitle="Last 50, from /api/logs" />
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Method</th>
                                <th>Path</th>
                                <th className="t-right">Status</th>
                                <th className="t-right">ms</th>
                            </tr>
                        </thead>
                        <tbody>
                            {api.logs.length
                                ? api.logs.map((entry, index) => (
                                    <tr key={`${entry.at}-${index}`} className="req-row">
                                        <td className="t-muted">{fmtDateTime(entry.at)}</td>
                                        <td>{entry.method}</td>
                                        <td>{entry.path}</td>
                                        <td className={`t-right ${entry.status >= 400 ? 'status-err' : 'status-2xx'}`}>{entry.status}</td>
                                        <td className="t-right t-muted">{entry.ms}</td>
                                    </tr>
                                ))
                                : <tr><td colSpan={5} className="list-empty">No requests recorded</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card style={{ marginTop: 16 }}>
                <CardHead
                    title="Endpoints this page uses"
                    subtitle="All require Authorization: Bearer <token>"
                    action={<button className="btn sm ghost" onClick={onCopyCurl}>Copy curl</button>}
                />
                <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 24px' }}>
                    {ENDPOINTS.map(endpoint => <div className="endpoint" key={endpoint}>{endpoint}</div>)}
                </div>
            </Card>
        </>
    );
};
