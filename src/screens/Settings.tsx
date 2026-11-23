import React, { useState, useEffect } from 'react';
import { Globe, Calendar, Bell, Shield, Palette, Download, Lock, KeyRound, RefreshCw, Bot, Mic, Sun, Moon, Monitor, Target, Repeat, Cloud, Clock, Server, Copy, Check, Power, AlertTriangle, Fingerprint } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

import { settingsService } from '../services/settingsService';
import { backupService } from '../services/backupService';
import { transactionService } from '../services/transactionService';
import { secretsService, SECRET_KEYS } from '../services/secretsService';
import { notificationService } from '../services/notificationService';
import { biometricService } from '../services/biometricService';
import { healthService } from '../services/healthService';
import { auditService, type AuditEntry } from '../services/auditService';
import { apiServer } from '../services/apiServer';
import type { ApiServerState } from '../services/apiServer';
import BottomSheet from '../components/ui/BottomSheet';
import PinSetup from '../components/security/PinSetup';
import type { UserSettings } from '../types';

interface SettingsProps {
    onNavigateCategories: () => void;
    onNavigateBudgets: () => void;
    onNavigateRecurring: () => void;
    settings: UserSettings | null;
}

const Settings: React.FC<SettingsProps> = ({ onNavigateCategories, onNavigateBudgets, onNavigateRecurring, settings }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    // App-lock PIN sheet: null = closed, 'set-enable' = set PIN then turn lock on, 'change' = change existing PIN
    const [pinSheet, setPinSheet] = useState<null | 'set-enable' | 'change'>(null);
    const [recomputing, setRecomputing] = useState(false);
    const [driveBusy, setDriveBusy] = useState(false);

    // Local API server
    const [apiState, setApiState] = useState<ApiServerState>(() => apiServer.getState());
    const [apiBusy, setApiBusy] = useState(false);
    const [apiToken, setApiToken] = useState('');
    const [showApiToken, setShowApiToken] = useState(false);
    const [apiPort, setApiPort] = useState('8765');
    const [copied, setCopied] = useState<string | null>(null);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [passphraseSheet, setPassphraseSheet] = useState<null | { mode: 'set' | 'verify' | 'restore' }>(null);
    const [passphraseDraft, setPassphraseDraft] = useState('');
    const [pendingBackup, setPendingBackup] = useState<ArrayBuffer | null>(null);
    const [verifyLines, setVerifyLines] = useState<string[] | null>(null);
    const [recentChanges, setRecentChanges] = useState<AuditEntry[]>([]);

    const refreshRecentChanges = () => {
        auditService.list(5).then(setRecentChanges).catch(() => {});
    };

    useEffect(() => {
        refreshRecentChanges();
    }, []);

    const changeLabel = (entry: AuditEntry): string => {
        if (entry.action === 'batch-create') return 'Imported a batch';
        const payload = (entry.after || entry.before) as { amount?: number; currency?: string } | null;
        const amount = payload && typeof payload.amount === 'number'
            ? ` ${payload.amount.toLocaleString('en-US')} ${payload.currency || ''}`.trimEnd()
            : '';
        const verb = entry.action === 'create'
            ? 'Added'
            : entry.action === 'delete'
                ? 'Deleted'
                : entry.action === 'clear'
                    ? 'Reconciled'
                    : 'Edited';
        return `${verb}${amount ? ` ${amount}` : ' a transaction'}`;
    };

    const handleUndoChange = async (id: string) => {
        try {
            await auditService.undo(id);
            refreshRecentChanges();
        } catch (error) {
            alert('Undo failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleHealthCheck = async () => {
        try {
            const report = await healthService.runChecks();
            if (report.issues.length === 0) {
                alert(`No issues found across ${report.counts.transactions} transactions and ${report.counts.accounts} accounts.`);
                return;
            }
            const errors = report.issues.filter(issue => issue.severity === 'error').length;
            const warnings = report.issues.filter(issue => issue.severity === 'warning').length;
            const preview = report.issues.slice(0, 5).map(issue => `• ${issue.message}`).join('\n');
            const extra = report.issues.length > 5 ? `\n…and ${report.issues.length - 5} more` : '';
            alert(`${errors} error(s), ${warnings} warning(s)\n\n${preview}${extra}`);
        } catch (error) {
            alert('Health check failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    useEffect(() => {
        biometricService.isAvailable().then(result => setBiometricAvailable(result.available)).catch(() => {});
    }, []);

    const handleDriveBackup = async () => {
        setDriveBusy(true);
        try {
            await backupService.backupToDrive();
        } catch (error) {
            alert('Backup failed: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setDriveBusy(false);
        }
    };
    // API keys (secure storage, not part of settings JSON)
    const [deepSeekKey, setDeepSeekKey] = useState('');
    const [elevenKey, setElevenKey] = useState('');
    const [keysSaving, setKeysSaving] = useState(false);
    const [keysLocked, setKeysLocked] = useState(true);

    const loadKeys = () => {
        secretsService.getKey(SECRET_KEYS.deepSeek).then(k => setDeepSeekKey(k || ''));
        secretsService.getKey(SECRET_KEYS.elevenLabs).then(k => setElevenKey(k || ''));
    };

    useEffect(() => { loadKeys(); }, []);

    useEffect(() => {
        const unsubscribe = apiServer.subscribe(setApiState);
        apiServer.refreshStatus().catch(() => { /* not available on web */ });
        apiServer.getToken().then(token => setApiToken(token || '')).catch(() => {});
        return unsubscribe;
    }, []);

    const apiServerPortSetting = settings?.apiServerPort;
    useEffect(() => {
        if (apiServerPortSetting !== undefined) setApiPort(String(apiServerPortSetting));
    }, [apiServerPortSetting]);

    const handleSaveKeys = async () => {
        setKeysSaving(true);
        try {
            await secretsService.setKey(SECRET_KEYS.deepSeek, deepSeekKey.trim());
            await secretsService.setKey(SECRET_KEYS.elevenLabs, elevenKey.trim());
            setKeysLocked(true);
        } finally {
            setKeysSaving(false);
        }
    };

    const handleCancelKeys = () => {
        loadKeys(); // discard edits
        setKeysLocked(true);
    };

    const copyText = async (value: string, key: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const element = document.createElement('textarea');
                element.value = value;
                document.body.appendChild(element);
                element.select();
                document.execCommand('copy');
                document.body.removeChild(element);
            }
            setCopied(key);
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            alert('Could not copy. Select the text and copy it manually.');
        }
    };

    const handleApiToggle = async () => {
        if (apiBusy) return;
        setApiBusy(true);
        try {
            if (apiState.running) {
                await apiServer.stop();
            } else {
                const port = Number.parseInt(apiPort, 10);
                if (Number.isNaN(port) || port < 1024 || port > 65535) {
                    alert('Port must be between 1024 and 65535.');
                    return;
                }
                await settingsService.updateSettings({ apiServerPort: port });
                // The foreground service needs a notification to stay alive.
                await notificationService.requestPermission().catch(() => false);
                await apiServer.start({ port });
                // The token is generated on first start.
                const token = await apiServer.getToken();
                setApiToken(token || '');
            }
        } catch (error) {
            alert('API server: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setApiBusy(false);
        }
    };

    const handleApiLanToggle = async (enabled: boolean) => {
        handleUpdateSettings({ apiServerAllowLan: enabled });
        if (!apiState.running) return;

        setApiBusy(true);
        try {
            const port = Number.parseInt(apiPort, 10) || apiState.port;
            await apiServer.stop();
            await apiServer.start({ port, allowLan: enabled });
        } catch (error) {
            alert('API server: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setApiBusy(false);
        }
    };

    const handleRegenerateApiToken = async () => {
        if (!confirm('Regenerate the API token? Any client using the old token will stop working.')) return;
        setApiBusy(true);
        try {
            const token = await apiServer.regenerateToken();
            setApiToken(token);
        } catch (error) {
            alert('Could not regenerate the token: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setApiBusy(false);
        }
    };

    const apiBaseUrl = apiState.addresses.length > 0
        ? `http://${apiState.addresses[0]}:${apiState.port}`
        : `http://127.0.0.1:${apiState.port}`;

    const connectionJson = JSON.stringify({ baseUrl: apiBaseUrl, token: apiToken }, null, 2);
    const desktopUrl = `${apiBaseUrl}/desktop.html`;

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setIsInstallable(false);
        }
    };

    const handleUpdateSettings = (updates: Partial<UserSettings>) => {
        settingsService.updateSettings(updates);
    };

    const handleRateChange = (currency: string, value: string) => {
        if (!settings) return;
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        handleUpdateSettings({
            customRates: {
                ...settings.customRates,
                [currency]: numValue
            }
        });
    };

    const handleToggleAppLock = (enabled: boolean) => {
        if (!enabled) {
            handleUpdateSettings({ appLockEnabled: false });
            return;
        }
        // Turning on: require a PIN first
        if (settings?.appPin) {
            handleUpdateSettings({ appLockEnabled: true });
        } else {
            setPinSheet('set-enable');
        }
    };

    const handlePinSaved = (pin: string) => {
        if (pinSheet === 'set-enable') {
            handleUpdateSettings({ appPin: pin, appLockEnabled: true });
        } else if (pinSheet === 'change') {
            handleUpdateSettings({ appPin: pin });
        }
        setPinSheet(null);
    };

    const runVerification = async (buffer: ArrayBuffer, passphrase?: string) => {
        try {
            const report = await backupService.verifyBackup(buffer, passphrase);
            setVerifyLines([
                `${report.counts.transactions} transactions · ${report.counts.accounts} accounts · ${report.counts.categories} categories`,
                `format v${report.version} · ${new Date(report.timestamp).toLocaleString()}${report.encrypted ? ' · encrypted' : ''}`,
                ...report.issues.map(issue => `ISSUE: ${issue}`),
                ...report.warnings.map(warning => `Warning: ${warning}`),
            ]);
        } catch (error) {
            setVerifyLines([`Verification failed: ${error instanceof Error ? error.message : String(error)}`]);
        }
    };

    const handleBackupFile = async (file: File, mode: 'verify' | 'restore') => {
        const buffer = await file.arrayBuffer();

        if (backupService.isEncrypted(buffer)) {
            setPendingBackup(buffer);
            setPassphraseDraft('');
            setPassphraseSheet({ mode });
            return;
        }

        if (mode === 'verify') {
            await runVerification(buffer);
            return;
        }

        if (!confirm('Restore Data? This will replace all current data with the backup file. This cannot be undone.')) return;
        try {
            await backupService.restoreBackup(buffer);
        } catch (error) {
            alert('Restore failed: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleToggleEncryption = async (enabled: boolean) => {
        if (!enabled) {
            await secretsService.removeKey(SECRET_KEYS.backupPassphrase);
            handleUpdateSettings({ backupEncryptionEnabled: false });
            return;
        }
        const existing = await secretsService.getKey(SECRET_KEYS.backupPassphrase);
        if (existing) {
            handleUpdateSettings({ backupEncryptionEnabled: true });
            return;
        }
        setPassphraseDraft('');
        setPassphraseSheet({ mode: 'set' });
    };

    const submitPassphrase = async () => {
        const mode = passphraseSheet?.mode;
        if (!mode) return;

        if (mode === 'set') {
            if (passphraseDraft.length < 8) {
                alert('Use at least 8 characters. If you lose this passphrase the backup cannot be recovered.');
                return;
            }
            await secretsService.setKey(SECRET_KEYS.backupPassphrase, passphraseDraft);
            handleUpdateSettings({ backupEncryptionEnabled: true });
            setPassphraseSheet(null);
            setPassphraseDraft('');
            return;
        }

        if (!pendingBackup) return;

        if (mode === 'verify') {
            await runVerification(pendingBackup, passphraseDraft);
            setPassphraseSheet(null);
            setPendingBackup(null);
            setPassphraseDraft('');
            return;
        }

        if (!confirm('Restore Data? This will replace all current data. This cannot be undone.')) {
            setPassphraseSheet(null);
            return;
        }

        try {
            await backupService.restoreBackup(pendingBackup, passphraseDraft);
        } catch (error) {
            alert('Restore failed: ' + (error instanceof Error ? error.message : String(error)));
            return;
        } finally {
            setPassphraseSheet(null);
            setPendingBackup(null);
            setPassphraseDraft('');
        }
    };

    if (!settings) return null;

    return (
        <>
        <div className="flex flex-col gap-6 pb-8 px-1">
            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">General</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <button
                        className="w-full flex items-center justify-between p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0"
                        onClick={onNavigateCategories}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                <Palette size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Categories</span>
                        </div>
                        <span className="text-[13px] text-text-muted font-bold px-3 py-1 bg-slate-100 rounded-full uppercase tracking-tighter">Manage</span>
                    </button>
                    <button
                        className="w-full flex items-center justify-between p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0"
                        onClick={onNavigateBudgets}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Target size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Budgets</span>
                        </div>
                        <span className="text-[13px] text-text-muted font-bold px-3 py-1 bg-slate-100 rounded-full uppercase tracking-tighter">Manage</span>
                    </button>
                    <button
                        className="w-full flex items-center justify-between p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0"
                        onClick={onNavigateRecurring}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Repeat size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Recurring</span>
                        </div>
                        <span className="text-[13px] text-text-muted font-bold px-3 py-1 bg-slate-100 rounded-full uppercase tracking-tighter">Manage</span>
                    </button>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Preferences</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Globe size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Main Currency</span>
                        </div>
                        <select
                            value={settings.mainCurrency}
                            onChange={(e) => handleUpdateSettings({ mainCurrency: e.target.value as any })}
                            className="text-[14px] font-bold text-primary bg-transparent text-right outline-none cursor-pointer"
                        >
                            <option value="PKR">PKR (Rs)</option>
                            <option value="USD">USD ($)</option>
                            <option value="AED">AED (Dh)</option>
                            <option value="MYR">MYR (RM)</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                <Calendar size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Month Start Day</span>
                        </div>
                        <select
                            value={settings.monthStartDay}
                            onChange={(e) => handleUpdateSettings({ monthStartDay: parseInt(e.target.value) })}
                            className="text-[14px] font-bold text-text-primary bg-transparent text-right outline-none cursor-pointer"
                        >
                            {[...Array(28)].map((_, i) => (
                                <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                            ))}
                        </select>
                    </div>

                    <div className="p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                            <span className="font-semibold text-[14px] text-text-secondary">Custom Conversion Rates</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.useCustomRates}
                                    onChange={(e) => handleUpdateSettings({ useCustomRates: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        {settings.useCustomRates && (
                            <div className="flex flex-col gap-3 pl-2 border-l-2 border-primary/10 ml-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-medium text-text-muted">1 USD = ? PKR</span>
                                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-black/5 shadow-sm w-32 focus-within:ring-2 ring-primary/20 transition-all">
                                        <span className="text-[12px] font-bold text-text-muted">Rs.</span>
                                        <input
                                            type="number"
                                            value={settings.customRates?.['USD'] || ''}
                                            onChange={(e) => handleRateChange('USD', e.target.value)}
                                            className="w-full text-[13px] font-bold text-right outline-none"
                                            placeholder="278.5"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-medium text-text-muted">1 AED = ? PKR</span>
                                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-black/5 shadow-sm w-32 focus-within:ring-2 ring-primary/20 transition-all">
                                        <span className="text-[12px] font-bold text-text-muted">Rs.</span>
                                        <input
                                            type="number"
                                            value={settings.customRates?.['AED'] || ''}
                                            onChange={(e) => handleRateChange('AED', e.target.value)}
                                            className="w-full text-[13px] font-bold text-right outline-none"
                                            placeholder="75.8"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-medium text-text-muted">1 MYR = ? PKR</span>
                                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-black/5 shadow-sm w-32 focus-within:ring-2 ring-primary/20 transition-all">
                                        <span className="text-[12px] font-bold text-text-muted">Rs.</span>
                                        <input
                                            type="number"
                                            value={settings.customRates?.['MYR'] || ''}
                                            onChange={(e) => handleRateChange('MYR', e.target.value)}
                                            className="w-full text-[13px] font-bold text-right outline-none"
                                            placeholder="62.0"
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-text-muted mt-1 italic">
                                    * Rates are relative to PKR base.
                                </p>
                            </div>
                        )}
                        {!settings.useCustomRates && (
                            <p className="text-[12px] text-text-muted">
                                Using default internet rates (static for demo).
                            </p>
                        )}
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Appearance</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm p-4 flex flex-col gap-3">
                    <span className="font-semibold text-[15px]">Theme</span>
                    <div className="bg-bg-primary p-1 rounded-2xl flex border border-black/5">
                        {([
                            { id: 'light', label: 'Light', icon: Sun },
                            { id: 'dark', label: 'Dark', icon: Moon },
                            { id: 'system', label: 'System', icon: Monitor },
                        ] as const).map(opt => {
                            const Icon = opt.icon;
                            const active = (settings.theme || 'system') === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => handleUpdateSettings({ theme: opt.id })}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${active ? 'bg-white text-primary shadow-sm' : 'text-text-muted'}`}
                                >
                                    <Icon size={16} /> {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Security</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Lock size={20} />
                            </div>
                            <div>
                                <span className="block font-semibold text-[15px]">App Lock</span>
                                <span className="text-[12px] text-text-muted">Require a 4-digit PIN on launch</span>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.appLockEnabled}
                                onChange={(e) => handleToggleAppLock(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {settings.appPin && (
                        <button
                            onClick={() => setPinSheet('change')}
                            className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0"
                        >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
                                <KeyRound size={20} />
                            </div>
                            <div className="flex-1 text-left">
                                <span className="block font-semibold text-[15px]">Change PIN</span>
                                <span className="text-[12px] text-text-muted">Update your 4-digit PIN</span>
                            </div>
                        </button>
                    )}
                    {settings.appPin && biometricAvailable && (
                        <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Fingerprint size={20} />
                                </div>
                                <div>
                                    <span className="block font-semibold text-[15px]">Unlock with fingerprint</span>
                                    <span className="text-[12px] text-text-muted">Use biometrics instead of typing the PIN</span>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!settings.biometricUnlockEnabled}
                                    onChange={(e) => handleUpdateSettings({ biometricUnlockEnabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>
                    )}
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">API Keys</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
                            <Bot size={16} className="text-primary" /> DeepSeek (AI parsing)
                        </label>
                        <input
                            type="password"
                            placeholder="sk-..."
                            value={deepSeekKey}
                            disabled={keysLocked}
                            onChange={(e) => setDeepSeekKey(e.target.value)}
                            className={`w-full border border-black/5 p-3 rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/20 outline-none ${keysLocked ? 'bg-bg-primary opacity-60' : 'bg-white'}`}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
                            <Mic size={16} className="text-primary" /> ElevenLabs (speech-to-text)
                        </label>
                        <input
                            type="password"
                            placeholder="Enter API key"
                            value={elevenKey}
                            disabled={keysLocked}
                            onChange={(e) => setElevenKey(e.target.value)}
                            className={`w-full border border-black/5 p-3 rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/20 outline-none ${keysLocked ? 'bg-bg-primary opacity-60' : 'bg-white'}`}
                        />
                    </div>
                    {Capacitor.getPlatform() === 'web' && (
                        <p className="text-[11px] text-warning leading-relaxed flex items-start gap-2">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                            In a browser preview, secrets fall back to localStorage and are not protected by the
                            device keystore. Enter API keys in the Android app.
                        </p>
                    )}
                    {keysLocked ? (
                        <button
                            onClick={() => setKeysLocked(false)}
                            className="w-full py-3 bg-bg-primary border border-black/5 text-text-primary rounded-xl font-bold text-[14px] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <KeyRound size={16} /> Edit Keys
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={handleCancelKeys}
                                disabled={keysSaving}
                                className="flex-1 py-3 bg-bg-primary text-text-secondary rounded-xl font-bold text-[14px] active:scale-95 transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveKeys}
                                disabled={keysSaving}
                                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-[14px] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {keysSaving ? 'Saving...' : 'Save Keys'}
                            </button>
                        </div>
                    )}
                    <p className="text-[11px] text-text-muted">
                        Stored in your device's secure storage, never in backups.
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Automatic Backup</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-black/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Clock size={20} />
                            </div>
                            <div>
                                <span className="block font-semibold text-[15px]">Auto Backup</span>
                                <span className="text-[12px] text-text-muted">
                                    {settings.lastBackupAt ? `Last: ${new Date(settings.lastBackupAt).toLocaleString()}` : 'Never backed up'}
                                </span>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoBackupEnabled}
                                onChange={(e) => handleUpdateSettings({ autoBackupEnabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {settings.autoBackupEnabled && (
                        <div className="p-4 flex flex-col gap-4 bg-slate-50/50 border-b border-black/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[14px] font-semibold text-text-secondary">Frequency</span>
                                <select
                                    value={settings.backupFrequency}
                                    onChange={(e) => handleUpdateSettings({ backupFrequency: e.target.value as UserSettings['backupFrequency'] })}
                                    className="text-[14px] font-bold text-text-primary bg-white border border-black/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[14px] font-semibold text-text-secondary">Time</span>
                                <input
                                    type="time"
                                    value={settings.backupTime}
                                    onChange={(e) => handleUpdateSettings({ backupTime: e.target.value })}
                                    className="text-[14px] font-bold text-text-primary bg-white border border-black/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <p className="text-[11px] text-text-muted italic">
                                Runs the next time you open the app after this time. Backups save to Documents/SmartLedger; files older than a week are removed automatically.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleDriveBackup}
                        disabled={driveBusy}
                        className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                            <Cloud size={20} />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="block font-semibold text-[15px]">Back up to Google Drive</span>
                            <span className="text-[12px] text-text-muted">{driveBusy ? 'Preparing…' : 'Choose Drive in the share sheet'}</span>
                        </div>
                    </button>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Local API</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-black/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                                <Server size={20} />
                            </div>
                            <div>
                                <span className="block font-semibold text-[15px]">Local API Server</span>
                                <span className="text-[12px] text-text-muted">
                                    {!apiState.available
                                        ? 'Available in the Android app only'
                                        : apiState.running
                                            ? `Running on port ${apiState.port}`
                                            : 'Stopped'}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={handleApiToggle}
                            disabled={!apiState.available || apiBusy}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] text-white active:scale-95 transition-all disabled:opacity-40 ${apiState.running ? 'bg-expense' : 'bg-primary'}`}
                        >
                            {apiBusy ? <RefreshCw size={15} className="animate-spin" /> : <Power size={15} />}
                            {apiState.running ? 'Stop' : 'Start'}
                        </button>
                    </div>

                    {apiState.error && (
                        <div className="flex items-start gap-2 px-4 py-3 bg-expense/10 border-b border-expense/20">
                            <AlertTriangle size={15} className="text-expense shrink-0 mt-0.5" />
                            <span className="text-[12px] font-semibold text-expense break-words">{apiState.error}</span>
                        </div>
                    )}

                    <div className="p-4 flex flex-col gap-4 border-b border-black/5">
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-semibold text-text-secondary">Port</span>
                            <input
                                type="number"
                                min={1024}
                                max={65535}
                                value={apiPort}
                                disabled={apiState.running}
                                onChange={(e) => setApiPort(e.target.value)}
                                onBlur={() => {
                                    const port = Number.parseInt(apiPort, 10);
                                    if (!Number.isNaN(port) && port >= 1024 && port <= 65535) {
                                        handleUpdateSettings({ apiServerPort: port });
                                    }
                                }}
                                className="w-28 text-[14px] font-bold text-text-primary bg-white border border-black/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-bg-primary disabled:opacity-60"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <span className="block text-[14px] font-semibold text-text-secondary">Allow access from other devices</span>
                                <span className="text-[11px] text-text-muted">Binds 0.0.0.0 on your Wi-Fi network</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                    type="checkbox"
                                    checked={settings.apiServerAllowLan}
                                    onChange={(e) => handleApiLanToggle(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        {apiState.running && (
                            <div className="flex flex-col gap-2 bg-bg-primary rounded-xl p-3 border border-black/5">
                                <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Addresses</span>
                                {apiState.addresses.length === 0 ? (
                                    <span className="text-[12px] text-text-muted">No LAN address detected.</span>
                                ) : apiState.addresses.map(address => {
                                    const url = `http://${address}:${apiState.port}`;
                                    return (
                                        <div key={address} className="flex items-center justify-between gap-2">
                                            <code className="text-[11px] font-mono text-text-primary break-all">{url}</code>
                                            <button
                                                onClick={() => copyText(url, address)}
                                                className="w-8 h-8 shrink-0 rounded-lg bg-white border border-black/5 flex items-center justify-center text-text-muted active:scale-95"
                                            >
                                                {copied === address ? <Check size={14} className="text-income" /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="p-4 flex flex-col gap-3 border-b border-black/5">
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-semibold text-text-secondary">Access token</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowApiToken(value => !value)}
                                    className="text-[12px] font-bold text-primary px-2 py-1"
                                >
                                    {showApiToken ? 'Hide' : 'Show'}
                                </button>
                                <button
                                    onClick={() => copyText(apiToken, 'token')}
                                    disabled={!apiToken}
                                    className="w-8 h-8 rounded-lg bg-bg-primary border border-black/5 flex items-center justify-center text-text-muted active:scale-95 disabled:opacity-40"
                                >
                                    {copied === 'token' ? <Check size={14} className="text-income" /> : <Copy size={14} />}
                                </button>
                                <button
                                    onClick={handleRegenerateApiToken}
                                    disabled={apiBusy}
                                    className="w-8 h-8 rounded-lg bg-bg-primary border border-black/5 flex items-center justify-center text-text-muted active:scale-95 disabled:opacity-40"
                                >
                                    <RefreshCw size={14} className={apiBusy ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                        <code className="block break-all bg-bg-primary border border-black/5 rounded-xl p-3 text-[11px] font-mono text-text-primary">
                            {apiToken ? (showApiToken ? apiToken : '•'.repeat(32)) : 'Not generated yet — start the server.'}
                        </code>
                        <p className="text-[11px] text-text-muted">
                            Keep this secret. Anyone with it can read and change your ledger.
                        </p>
                    </div>

                    <div className="p-4 flex flex-col gap-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => copyText(connectionJson, 'connection')}
                                disabled={!apiToken}
                                className="w-full py-2.5 bg-bg-primary border border-black/5 text-text-primary rounded-xl font-bold text-[13px] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {copied === 'connection' ? <Check size={15} className="text-income" /> : <Copy size={15} />}
                                Copy connection details
                            </button>
                        </div>

                        <button
                            onClick={() => copyText(desktopUrl, 'desktop')}
                            disabled={!apiToken}
                            className="w-full py-2.5 bg-primary-light text-primary rounded-xl font-bold text-[13px] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {copied === 'desktop' ? <Check size={15} /> : <Server size={15} />}
                            Copy desktop UI link
                        </button>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                            Open the copied link on your laptop: it is a wide-screen web client for the same ledger, built for
                            desktop and served by this phone. Sign in with the access token above.
                        </p>

                        {apiState.log.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Recent requests</span>
                                {apiState.log.slice(0, 5).map((entry, index) => (
                                    <div key={`${entry.at}-${index}`} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                        <span className="text-text-secondary truncate">{entry.method} {entry.path}</span>
                                        <span className={entry.status >= 400 ? 'text-expense' : 'text-income'}>{entry.status} · {entry.ms}ms</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="text-[11px] text-text-muted leading-relaxed">
                            The server keeps running in the background behind an ongoing notification until you stop it. Traffic on your Wi-Fi is not encrypted — use this on a trusted network.
                        </p>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Data Management</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <button
                        onClick={async () => {
                            try {
                                await backupService.exportBackup();
                            } catch (error) {
                                alert('Backup failed: ' + (error instanceof Error ? error.message : String(error)));
                            }
                        }}
                        className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5"
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                            <Download size={20} />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="block font-semibold text-[15px]">Backup Data</span>
                            <span className="text-[12px] text-text-muted">Save your ledger to a file</span>
                        </div>
                    </button>

                    <div className="flex items-center justify-between p-4 border-b border-black/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
                                <Lock size={20} />
                            </div>
                            <div>
                                <span className="block font-semibold text-[15px]">Encrypt backups</span>
                                <span className="text-[12px] text-text-muted">Protect exports with a passphrase</span>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.backupEncryptionEnabled}
                                onChange={(e) => handleToggleEncryption(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {settings.backupEncryptionEnabled && (
                        <button
                            onClick={() => {
                                setPassphraseDraft('');
                                setPassphraseSheet({ mode: 'set' });
                            }}
                            className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5"
                        >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600">
                                <KeyRound size={20} />
                            </div>
                            <div className="flex-1 text-left">
                                <span className="block font-semibold text-[15px]">Backup passphrase</span>
                                <span className="text-[12px] text-text-muted">Required to open the backup elsewhere</span>
                            </div>
                        </button>
                    )}

                    <div className="relative">
                        <input
                            type="file"
                            accept="*/*"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) await handleBackupFile(file, 'restore');
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600">
                                <Shield size={20} />
                            </div>
                            <div className="flex-1 text-left">
                                <span className="block font-semibold text-[15px]">Restore Data</span>
                                <span className="text-[12px] text-text-muted">Import ledger from backup</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <input
                            type="file"
                            accept="*/*"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) await handleBackupFile(file, 'verify');
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 text-teal-600">
                                <Check size={20} />
                            </div>
                            <div className="flex-1 text-left">
                                <span className="block font-semibold text-[15px]">Verify Backup</span>
                                <span className="text-[12px] text-text-muted">Check a file without restoring it</span>
                            </div>
                        </div>
                    </div>

                    {verifyLines && (
                        <div className="p-4 border-b border-black/5 bg-bg-primary/60">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Backup check</span>
                                <button onClick={() => setVerifyLines(null)} className="text-[12px] font-bold text-primary">Dismiss</button>
                            </div>
                            {verifyLines.map((line, index) => (
                                <p
                                    key={index}
                                    className={`text-[11px] font-mono leading-relaxed break-words ${
                                        line.startsWith('ISSUE') ? 'text-expense' : line.startsWith('Warning') ? 'text-warning' : 'text-text-secondary'
                                    }`}
                                >
                                    {line}
                                </p>
                            ))}
                        </div>
                    )}

                    <button
                        disabled={recomputing}
                        onClick={async () => {
                            setRecomputing(true);
                            try {
                                await transactionService.recalculateBalances();
                                alert('Account balances recalculated from transactions.');
                            } catch (error) {
                                alert('Recompute failed: ' + (error instanceof Error ? error.message : String(error)));
                            } finally {
                                setRecomputing(false);
                            }
                        }}
                        className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0 disabled:opacity-50"
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
                            <RefreshCw size={20} className={recomputing ? 'animate-spin' : ''} />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="block font-semibold text-[15px]">Recompute Balances</span>
                            <span className="text-[12px] text-text-muted">Fix balance drift from transactions</span>
                        </div>
                    </button>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">Data Health</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    <button
                        onClick={handleHealthCheck}
                        className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5"
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
                            <Shield size={20} />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="block font-semibold text-[15px]">Run health check</span>
                            <span className="text-[12px] text-text-muted">Duplicates, orphaned refs and balance drift</span>
                        </div>
                    </button>

                    {recentChanges.length === 0 ? (
                        <p className="p-4 text-[12px] text-text-muted">No recorded changes yet.</p>
                    ) : recentChanges.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3 p-4 border-b border-black/5 last:border-0">
                            <div className="flex-1">
                                <span className="block text-[13px] font-semibold text-text-primary">{changeLabel(entry)}</span>
                                <span className="text-[11px] text-text-muted">{new Date(entry.at).toLocaleString()}</span>
                            </div>
                            {entry.undoneAt ? (
                                <span className="text-[12px] text-text-muted">Undone</span>
                            ) : (
                                <button
                                    onClick={() => handleUndoChange(entry.id)}
                                    className="px-3 py-2 rounded-lg bg-bg-primary text-[12px] font-bold text-primary active:scale-95"
                                >
                                    Undo
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">App</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    {isInstallable && (
                        <button
                            onClick={handleInstall}
                            className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0"
                        >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
                                <Download size={20} />
                            </div>
                            <div className="flex-1 text-left">
                                <span className="block font-semibold text-[15px]">Install App</span>
                                <span className="text-[12px] text-text-muted">Add to your home screen</span>
                            </div>
                        </button>
                    )}

                    <div className="w-full flex items-center justify-between p-4 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 text-rose-600">
                                <Bell size={20} />
                            </div>
                            <div>
                                <span className="block font-semibold text-[15px]">Notifications</span>
                                <span className="text-[12px] text-text-muted">Budget alerts & recurring reminders</span>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.notificationsEnabled}
                                onChange={async (e) => {
                                    if (e.target.checked) {
                                        const granted = await notificationService.requestPermission();
                                        handleUpdateSettings({ notificationsEnabled: granted });
                                        if (!granted) alert('Notification permission was denied. Enable it in system settings.');
                                    } else {
                                        handleUpdateSettings({ notificationsEnabled: false });
                                    }
                                }}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    <button className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600">
                            <Shield size={20} />
                        </div>
                        <span className="font-semibold text-[15px]">Privacy & Security</span>
                    </button>
                </div>
            </section>

            <div className="text-center mt-4">
                <div className="text-[12px] font-bold text-text-muted uppercase tracking-widest">Version 1.0.0 (Beta)</div>
            </div>
        </div>

        <BottomSheet
            isOpen={pinSheet !== null}
            onClose={() => setPinSheet(null)}
            title={pinSheet === 'change' ? 'Change PIN' : 'Set App PIN'}
        >
            <PinSetup key={pinSheet || 'closed'} onComplete={handlePinSaved} />
        </BottomSheet>

        <BottomSheet
            isOpen={passphraseSheet !== null}
            onClose={() => {
                setPassphraseSheet(null);
                setPendingBackup(null);
                setPassphraseDraft('');
            }}
            title={
                passphraseSheet?.mode === 'set'
                    ? 'Backup passphrase'
                    : passphraseSheet?.mode === 'verify'
                        ? 'Unlock backup'
                        : 'Restore encrypted backup'
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-[12px] text-text-muted leading-relaxed">
                    {passphraseSheet?.mode === 'set'
                        ? 'Choose at least 8 characters. If you lose this passphrase, encrypted backups cannot be recovered — not even by the app.'
                        : 'This backup is encrypted. Enter the passphrase that was used when it was created.'}
                </p>
                <input
                    type="password"
                    autoFocus
                    value={passphraseDraft}
                    onChange={(e) => setPassphraseDraft(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-black/5 p-3 rounded-xl text-[14px] font-medium bg-white focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setPassphraseSheet(null);
                            setPendingBackup(null);
                            setPassphraseDraft('');
                        }}
                        className="flex-1 py-3 bg-bg-primary text-text-secondary rounded-xl font-bold text-[14px]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submitPassphrase}
                        className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-[14px]"
                    >
                        {passphraseSheet?.mode === 'set'
                            ? 'Save passphrase'
                            : passphraseSheet?.mode === 'verify'
                                ? 'Decrypt & verify'
                                : 'Decrypt & restore'}
                    </button>
                </div>
            </div>
        </BottomSheet>
        </>
    );
};

export default Settings;
