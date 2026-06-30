import React, { useState } from 'react';
import PinPad from './PinPad';

interface PinSetupProps {
    /** Called with the confirmed 4-digit PIN. */
    onComplete: (pin: string) => void;
}

const PinSetup: React.FC<PinSetupProps> = ({ onComplete }) => {
    const [firstPin, setFirstPin] = useState<string | null>(null);

    // Stage 1: capture the new PIN
    const handleEnter = (pin: string) => {
        setFirstPin(pin);
        return true; // advance to confirm stage
    };

    // Stage 2: must match the first entry
    const handleConfirm = (pin: string) => {
        if (pin === firstPin) {
            onComplete(pin);
            return true;
        }
        return false; // mismatch -> PinPad shakes + clears for retry
    };

    return firstPin === null ? (
        <div className="py-4">
            <PinPad
                key="enter"
                title="Set a new PIN"
                subtitle="Choose a 4-digit PIN"
                onComplete={handleEnter}
            />
        </div>
    ) : (
        <div className="py-4">
            <PinPad
                key="confirm"
                title="Confirm PIN"
                subtitle="Re-enter to confirm"
                onComplete={handleConfirm}
            />
        </div>
    );
};

export default PinSetup;
