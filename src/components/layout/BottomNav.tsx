import React from 'react';
import { Home, Wallet, Repeat, PieChart as InsightsIcon, Settings as SettingsIcon } from 'lucide-react';

interface BottomNavProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
    const tabs = [
        { id: 'Home', label: 'Home', icon: Home },
        { id: 'Accounts', label: 'Accounts', icon: Wallet },
        { id: 'History', label: 'History', icon: Repeat },
        { id: 'Insights', label: 'Insights', icon: InsightsIcon },
        { id: 'Settings', label: 'Settings', icon: SettingsIcon },
    ];

    return (
        <nav className="h-[70px] bg-bg-secondary flex justify-around items-center safe-bottom border-t border-black/5 z-[100] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] shrink-0">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        className={`flex flex-col items-center gap-1 transition-all flex-1 min-w-0 ${isActive ? 'text-primary' : 'text-text-muted'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                        <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};

export default BottomNav;
