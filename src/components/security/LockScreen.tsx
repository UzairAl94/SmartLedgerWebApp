import React from 'react';
import { Lock } from 'lucide-react';
import PinPad from './PinPad';

interface LockScreenProps {
    pin: string;
    onUnlock: () => void;
}

const LockScreen: React.FC<LockScreenProps> = ({ pin, onUnlock }) => {
    const handleComplete = (entered: string) => {
        if (entered === pin) {
            onUnlock();
            return true;
        }
        return false;
    };

    return (
        <div className="h-[100dvh] w-full bg-bg-primary flex flex-col items-center justify-center p-8 gap-10 max-w-[500px] mx-auto">
            <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
                    <Lock size={30} strokeWidth={2} />
                </div>
                <span className="text-[12px] font-bold text-text-muted uppercase tracking-widest">Smart Ledger</span>
            </div>

            <PinPad
                title="Enter PIN"
                subtitle="Unlock to access your ledger"
                onComplete={handleComplete}
            />
        </div>
    );
};

export default LockScreen;
