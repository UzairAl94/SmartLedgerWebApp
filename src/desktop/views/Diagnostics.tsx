import type { DesktopStore } from '../store';
import { fmtDateTime } from '../format';
import { Card, CardHead, Empty, Icon } from '../ui';

export const DiagnosticsView = ({ store }: { store: DesktopStore }) => {
    const report = store.diagnostics;

    if (!report) {
        return <Card><Empty message="Running integrity checks…" /></Card>;
    }

    const errors = report.issues.filter(issue => issue.severity === 'error').length;
    const warnings = report.issues.filter(issue => issue.severity === 'warning').length;

    const stats: Array<[string, number]> = [
        ['Accounts', report.counts.accounts],
        ['Transactions', report.counts.transactions],
        ['Categories', report.counts.categories],
        ['Budgets', report.counts.budgets],
    ];

    return (
        <>
            <Card>
                <CardHead
                    title="Data health"
                    subtitle={`Checked ${fmtDateTime(report.checkedAt)}`}
                    action={<button className="btn sm" onClick={() => store.refresh()}><Icon name="refresh" /> Run again</button>}
                />
                <div className="grid kpis" style={{ padding: '0 18px 18px' }}>
                    {stats.map(([label, value]) => (
                        <div className="card kpi" key={label}>
                            <span className="k-label">{label}</span>
                            <span className="k-value">{value}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card style={{ marginTop: 16 }}>
                <CardHead
                    title="Findings"
                    subtitle={report.issues.length === 0 ? 'No issues found' : `${errors} error(s) · ${warnings} warning(s)`}
                />
                {report.issues.length ? (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 100 }}>Severity</th>
                                    <th style={{ width: 190 }}>Check</th>
                                    <th>Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.issues.map((issue, index) => (
                                    <tr key={`${issue.code}-${index}`}>
                                        <td>
                                            <span
                                                className="chip"
                                                style={{ color: issue.severity === 'error' ? 'var(--expense)' : 'var(--warning)' }}
                                            >
                                                {issue.severity}
                                            </span>
                                        </td>
                                        <td className="mono" style={{ fontSize: 11.5 }}>{issue.code}</td>
                                        <td className="t-note" style={{ maxWidth: 560 }}>{issue.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty message="Every check passed" />}
            </Card>
        </>
    );
};
