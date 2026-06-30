import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

interface PinPadProps {
    title: string;
    subtitle?: string;
    /** Called when 4 digits are entered. Return false (or a rejecting/false Promise)
     *  to flag an error: the dots shake and clear so the user can retry. */
    onComplete: (pin: string) => boolean | Promise<boolean>;
    accent?: 'primary' | 'expense';
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

const PinPad: React.FC<PinPadProps> = ({ title, subtitle, onComplete, accent = 'primary' }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);

    const submit = async (value: string) => {
        setBusy(true);
        try {
            const ok = await onComplete(value);
            if (!ok) {
                setError(true);
                setTimeout(() => {
                    setPin('');
                    setError(false);
                }, 500);
            }
        } finally {
            setBusy(false);
        }
    };

    const press = (key: string) => {
        if (busy || error) return;
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            return;
        }
        if (pin.length >= 4) return;
        const next = pin + key;
        setPin(next);
        if (next.length === 4) submit(next);
    };

    const dotColor = accent === 'expense' ? 'bg-expense' : 'bg-primary';

    return (
        <div className="flex flex-col items-center gap-8 w-full">
            <div className="text-center">
                <h2 className="text-[20px] font-bold text-text-primary">{title}</h2>
                {subtitle && <p className="text-[13px] text-text-muted font-medium mt-1">{subtitle}</p>}
            </div>

            {/* Dots */}
            <motion.div
                className="flex gap-4"
                animate={error ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
                transition={{ duration: 0.45 }}
            >
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className={`w-4 h-4 rounded-full border-2 transition-colors ${
                            error
                                ? 'bg-expense border-expense'
                                : i < pin.length
                                    ? `${dotColor} border-transparent`
                                    : 'bg-transparent border-slate-300'
                        }`}
                    />
                ))}
            </motion.div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
                {KEYS.map((key, idx) => {
                    if (key === '') return <div key={idx} />;
                    const isDel = key === 'del';
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => press(key)}
                            disabled={busy}
                            className={`h-16 rounded-2xl flex items-center justify-center text-[24px] font-semibold active:scale-90 transition-all ${
                                isDel
                                    ? 'text-text-muted'
                                    : 'bg-white border border-black/5 text-text-primary shadow-sm active:bg-slate-50'
                            }`}
                        >
                            {isDel ? <Delete size={24} /> : key}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default PinPad;
