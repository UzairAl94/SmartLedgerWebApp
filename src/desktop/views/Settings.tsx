import { useEffect, useState } from 'react';
import type { Currency, UserSettings } from '../../types';
import { fmtDateTime } from '../format';
import type { DesktopStore, ThemeChoice } from '../store';
import { Card, CardHead, Field, Icon } from '../ui';

const CURRENCIES: Currency[] = ['PKR', 'USD', 'AED', 'MYR'];

export const SettingsView = ({
    store,
    onSave,
    onExport,
    onOpenConnect,
}: {
    store: DesktopStore;
    onSave: (patch: Partial<UserSettings>) => Promise<void>;
    onExport: () => void;
    onOpenConnect: () => void;
}) => {
    const { settings } = store;
    const [draft, setDraft] = useState<Partial<UserSettings> | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setDraft({
            mainCurrency: settings.mainCurrency,
            monthStartDay: settings.monthStartDay,
            useCustomRates: settings.useCustomRates,
            customRates: settings.customRates,
            theme: settings.theme,
            notificationsEnabled: settings.notificationsEnabled,
            autoBackupEnabled: settings.autoBackupEnabled,
            backupFrequency: settings.backupFrequency,
            backupTime: settings.backupTime,
        });
    }, [settings]);

    if (!settings || !draft) return null;
    const patch = (next: Partial<UserSettings>) => setDraft(current => ({ ...(current || {}), ...next }));

    const save = async () => {
        if (!draft) return;
        setBusy(true);
        try {
            await onSave(draft);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid settings-grid">
            <Card>
                <CardHead title="Money" subtitle="Applies to the API and the mobile app" />
                <div className="card-pad" style={{ display: 'grid', gap: 13 }}>
                    <Field label="Main currency">
                        <select value={draft.mainCurrency} onChange={event => patch({ mainCurrency: event.target.value as Currency })}>
                            {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                        </select>
                    </Field>
                    <Field label="Month starts on day" hint="Budgets and summaries use this boundary.">
                        <input
                            type="number"
                            min={1}
                            max={28}
                            value={draft.monthStartDay ?? 1}
                            onChange={event => patch({ monthStartDay: Number(event.target.value) })}
                        />
                    </Field>
                    <label className="switch">
                        <input type="checkbox" checked={!!draft.useCustomRates} onChange={event => patch({ useCustomRates: event.target.checked })} />
                        <span>Use custom exchange rates</span>
                    </label>
                    <div className="rate-grid">
                        {(['USD', 'AED', 'MYR'] as const).map(code => (
                            <Field key={code} label={`1 ${code} = PKR`}>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={(draft.customRates && draft.customRates[code]) ?? 0}
                                    onChange={event =>
                                        patch({ customRates: { ...(draft.customRates || {}), [code]: Number(event.target.value) } })
                                    }
                                />
                            </Field>
                        ))}
                    </div>
                </div>
            </Card>

            <Card>
                <CardHead title="Appearance & alerts" subtitle="Shared device preferences" />
                <div className="card-pad" style={{ display: 'grid', gap: 13 }}>
                    <Field label="Theme">
                        <select value={draft.theme} onChange={event => patch({ theme: event.target.value as ThemeChoice })}>
                            <option value="system">system</option>
                            <option value="light">light</option>
                            <option value="dark">dark</option>
                        </select>
                    </Field>
                    <label className="switch">
                        <input type="checkbox" checked={!!draft.notificationsEnabled} onChange={event => patch({ notificationsEnabled: event.target.checked })} />
                        <span>Notifications enabled</span>
                    </label>
                    <label className="switch">
                        <input type="checkbox" checked={!!draft.autoBackupEnabled} onChange={event => patch({ autoBackupEnabled: event.target.checked })} />
                        <span>Automatic backup</span>
                    </label>
                    <div className="row">
                        <Field label="Frequency">
                            <select value={draft.backupFrequency} onChange={event => patch({ backupFrequency: event.target.value as UserSettings['backupFrequency'] })}>
                                <option value="daily">daily</option>
                                <option value="weekly">weekly</option>
                                <option value="monthly">monthly</option>
                            </select>
                        </Field>
                        <Field label="Time">
                            <input type="time" value={draft.backupTime ?? '09:00'} onChange={event => patch({ backupTime: event.target.value })} />
                        </Field>
                    </div>
                    <button className="btn primary" onClick={save} disabled={busy}>
                        {busy ? <Icon name="refresh" /> : null} Save preferences
                    </button>
                </div>
            </Card>

            <Card>
                <CardHead title="Security" subtitle="Managed on the phone only" />
                <div className="card-pad">
                    <div className="kv"><span>App lock</span><b>{settings.hasPin ? 'PIN set' : 'Not configured'}</b></div>
                    <div className="kv"><span>PIN change over API</span><b>Blocked</b></div>
                    <div className="kv"><span>Access token</span><b>stored in this browser</b></div>
                    <p className="gate-note" style={{ marginTop: 12 }}>
                        The API deliberately refuses to read or change the PIN. Manage it in Settings on the phone.
                    </p>
                </div>
            </Card>

            <Card>
                <CardHead title="Local API server" subtitle="Hosted by the Android app" />
                <div className="card-pad">
                    <div className="kv"><span>Port</span><b>{settings.apiServerPort}</b></div>
                    <div className="kv"><span>Allow LAN</span><b>{settings.apiServerAllowLan ? 'yes' : 'loopback only'}</b></div>
                    <div className="kv"><span>Last backup</span><b>{settings.lastBackupAt ? fmtDateTime(settings.lastBackupAt) : 'never'}</b></div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button className="btn" onClick={onOpenConnect}>Change connection</button>
                        <button className="btn ghost" onClick={onExport}><Icon name="download" /> Export JSON</button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
