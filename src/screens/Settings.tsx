import React, { useState, useEffect } from 'react';
import { Globe, Calendar, Bell, Shield, Palette, Download } from 'lucide-react';

import { settingsService } from '../services/settingsService';
import type { UserSettings } from '../types';

interface SettingsProps {
    onNavigateCategories: () => void;
    settings: UserSettings | null;
}

const Settings: React.FC<SettingsProps> = ({ onNavigateCategories, settings }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);

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

    if (!settings) return null;

    return (
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
    );
};

export default Settings;
