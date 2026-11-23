import React, { useEffect, useMemo, useState } from 'react';
import { Fingerprint, Lock } from 'lucide-react';
import PinPad from './PinPad';
import { hashPin, needsPinUpgrade, verifyPin } from '../../utils/crypto';
import { settingsService } from '../../services/settingsService';
import { biometricService } from '../../services/biometricService';

interface LockScreenProps {
    pin: string; // stored PBKDF2 hash (legacy hash or plaintext is upgraded on unlock)
    onUnlock: () => void;
}

const FAILURES_BEFORE_LOCKOUT = 5;
const LOCKOUT_STEPS_MS = [30_000, 120_000, 300_000, 900_000];

const LockScreen: React.FC<LockScreenProps> = ({ pin, onUnlock }) => {
    const [attempts, setAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);

    useEffect(() => {
        settingsService.getSettings().then(settings => {
            setAttempts(settings.pinFailedAttempts || 0);
            setLockedUntil(settings.pinLockedUntil ? Date.parse(settings.pinLockedUntil) || 0 : 0);
            setBiometricEnabled(!!settings.biometricUnlockEnabled);
        });
    }, []);

    useEffect(() => {
        if (!biometricEnabled) return;
        biometricService.isAvailable().then(result => setBiometricAvailable(result.available));
    }, [biometricEnabled]);

    useEffect(() => {
        if (!lockedUntil) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [lockedUntil]);

    const remaining = Math.max(0, lockedUntil - now);
    const locked = remaining > 0;
    const countdown = useMemo(() => {
        const total = Math.ceil(remaining / 1000);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }, [remaining]);

    const handleComplete = async (entered: string) => {
        if (locked) return false;

        if (await verifyPin(pin, entered)) {
            await settingsService.updateSettings({ pinFailedAttempts: 0, pinLockedUntil: undefined });
            if (needsPinUpgrade(pin)) {
                await settingsService.updateSettings({ appPin: await hashPin(entered) });
            }
            onUnlock();
            return true;
        }

        const next = attempts + 1;
        setAttempts(next);

        if (next >= FAILURES_BEFORE_LOCKOUT) {
            const step = LOCKOUT_STEPS_MS[Math.min(next - FAILURES_BEFORE_LOCKOUT, LOCKOUT_STEPS_MS.length - 1)];
            const until = Date.now() + step;
            setLockedUntil(until);
            setNow(Date.now());
            await settingsService.updateSettings({
                pinFailedAttempts: next,
                pinLockedUntil: new Date(until).toISOString(),
            });
        } else {
            await settingsService.updateSettings({ pinFailedAttempts: next });
        }
        return false;
    };

    const unlockWithBiometrics = async () => {
        try {
            await biometricService.authenticate({
                title: 'Unlock Smart Ledger',
                subtitle: 'Confirm your fingerprint',
            });
            await settingsService.updateSettings({ pinFailedAttempts: 0, pinLockedUntil: undefined });
            onUnlock();
        } catch {
            // Cancelled or not recognised — stay on the PIN pad.
        }
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
                subtitle={locked ? `Too many attempts — try again in ${countdown}` : 'Unlock to access your ledger'}
                onComplete={handleComplete}
                disabled={locked}
            />

            {biometricEnabled && biometricAvailable && (
                <button
                    onClick={unlockWithBiometrics}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-black/5 text-primary font-bold text-[14px] active:scale-95 transition-all"
                >
                    <Fingerprint size={18} />
                    Use fingerprint
                </button>
            )}

            {!locked && attempts > 0 && attempts < FAILURES_BEFORE_LOCKOUT && (
                <p className="text-[12px] text-text-muted -mt-6">
                    {FAILURES_BEFORE_LOCKOUT - attempts} attempt{FAILURES_BEFORE_LOCKOUT - attempts === 1 ? '' : 's'} left before a lockout
                </p>
            )}
        </div>
    );
};

export default LockScreen;
