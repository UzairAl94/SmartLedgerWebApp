import React from 'react';
import BottomNav from './BottomNav';

interface MobileLayoutProps {
    children: React.ReactNode;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({ children, activeTab, setActiveTab }) => {
    return (
        <div className="flex flex-col h-[100dvh] w-full bg-bg-primary overflow-hidden max-w-[500px] mx-auto shadow-2xl relative">
            <header className="px-4 safe-top pt-4 pb-4 bg-bg-primary flex justify-between items-center z-10 shrink-0">
                <h1 className="text-xl font-bold tracking-tight">Smart Ledger</h1>
                <div className="header-actions">
                    {/* Top right actions could go here */}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 pb-24 scrollbar-hide">
                {children}
            </main>

            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
    );
};

export default MobileLayout;
