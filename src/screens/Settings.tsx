import React from 'react';
import { Globe, Calendar, Bell, Shield, CircleHelp, Smartphone, Palette } from 'lucide-react';
import { mockSettings } from '../mock/data';

const Settings: React.FC<{ onNavigateCategories: () => void }> = ({ onNavigateCategories }) => {
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
                    <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Globe size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Main Currency</span>
                        </div>
                        <span className="text-[14px] font-bold text-primary">{mockSettings.mainCurrency}</span>
                    </div>
                    <div className="flex items-center justify-between p-4 border-b border-black/5 last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                <Calendar size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">Month Start Day</span>
                        </div>
                        <span className="text-[14px] font-bold text-text-primary">{mockSettings.monthStartDay}</span>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-text-muted uppercase tracking-widest px-1">App</h3>
                <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
                    {[
                        { icon: Smartphone, label: 'Install PWA', color: 'bg-emerald-50 text-emerald-600' },
                        { icon: Bell, label: 'Notifications', color: 'bg-rose-50 text-rose-600' },
                        { icon: Shield, label: 'Privacy & Security', color: 'bg-slate-100 text-slate-600' }
                    ].map((item, idx) => (
                        <button key={idx} className="w-full flex items-center gap-3 p-4 active:bg-slate-50 transition-colors border-b border-black/5 last:border-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                                <item.icon size={20} />
                            </div>
                            <span className="font-semibold text-[15px]">{item.label}</span>
                        </button>
                    ))}
                </div>
            </section>

            <div className="text-center mt-4">
                <div className="text-[12px] font-bold text-text-muted uppercase tracking-widest">Version 1.0.0 (Beta)</div>
            </div>
        </div>
    );
};

export default Settings;
