import React, { useState, useEffect } from 'react';
import { Globe, Calendar, Bell, Shield, Palette, Download, Lock, KeyRound, RefreshCw, Bot, Mic } from 'lucide-react';

import { settingsService } from '../services/settingsService';
import { backupService } from '../services/backupService';
import { transactionService } from '../services/transactionService';
import { secretsService, SECRET_KEYS } from '../services/secretsService';
import BottomSheet from '../components/ui/BottomSheet';
import PinSetup from '../components/security/PinSetup';
import type { UserSettings } from '../types';

interface SettingsProps {
    onNavigateCategories: () => void;
    settings: UserSettings | null;
}

const Settings: React.FC<SettingsProps> = ({ onNavigateCategories, settings }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    // App-lock PIN sheet: null = closed, 'set-enable' = set PIN then turn lock on, 'change' = change existing PIN
    const [pinSheet, setPinSheet] = useState<null | 'set-enable' | 'change'>(null);
    const [recomputing, setRecomputing] = useState(false);
    // API keys (secure storage, not part of settings JSON)
    const [deepSeekKey, setDeepSeekKey] = useState('');
    const [elevenKey, setElevenKey] = useState('');
    const [keysSaving, setKeysSaving] = useState(false);
    const [keysSaved, setKeysSaved] = useState(false);

    useEffect(() => {
        secretsService.getKey(SECRET_KEYS.deepSeek).then(k => setDeepSeekKey(k || ''));
        secretsService.getKey(SECRET_KEYS.elevenLabs).then(k => setElevenKey(k || ''));
    }, []);

    const handleSaveKeys = async () => {
        setKeysSaving(true);
        try {
            await secretsService.setKey(SECRET_KEYS.deepSeek, deepSeekKey.trim());
            await secretsService.setKey(SECRET_KEYS.elevenLabs, elevenKey.trim());
            setKeysSaved(true);
            setTimeout(() => setKeysSaved(false), 2000);
        } finally {
            setKeysSaving(false);
        }
    };

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
                            onChange={(e) => setDeepSeekKey(e.target.value)}
                            className="w-full bg-bg-primary border border-black/5 p-3 rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/20 outline-none"
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
                            onChange={(e) => setElevenKey(e.target.value)}
                            className="w-full bg-bg-primary border border-black/5 p-3 rounded-xl text-[14px] font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleSaveKeys}
                        disabled={keysSaving}
                        className="w-full py-3 bg-primary text-white rounded-xl font-bold text-[14px] active:scale-95 transition-all disabled:opacity-50"
                    >
                        {keysSaving ? 'Saving...' : keysSaved ? 'Saved ✓' : 'Save Keys'}
                    </button>
                    <p className="text-[11px] text-text-muted">
                        Stored in your device's secure storage, never in backups.
                    </p>
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

                    <div className="relative">
                        <input
                            type="file"
                            accept=".json"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                if (confirm('Restore Data? This will replace all current data with the backup file. This cannot be undone.')) {
                                    const reader = new FileReader();
                                    reader.onload = async (event) => {
                                        const content = event.target?.result as string;
                                        try {
                                            await backupService.restoreBackup(content);
                                        } catch (error) {
                                            alert('Restore failed: ' + (error instanceof Error ? error.message : String(error)));
                                        }
                                    };
                                    reader.readAsText(file);
                                }
                                // Reset input
                                e.target.value = '';
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

                    <button className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 text-rose-600">
                            <Bell size={20} />
                        </div>
                        <span className="font-semibold text-[15px]">Notifications</span>
                    </button>

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
        </>
    );
};

export default Settings;
