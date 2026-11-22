import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isoDay } from './format';
import { Icon } from './ui';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const toISO = (date: Date): string => isoDay(date);
const fromISO = (value: string): Date | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const pretty = (value: string): string => {
    const date = fromISO(value);
    if (!date) return '';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const DatePicker = ({
    value,
    onChange,
    placeholder = 'Pick a date',
    clearable = false,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    clearable?: boolean;
    label?: string;
}) => {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [cursor, setCursor] = useState<Date>(() => fromISO(value) || new Date());
    const trigger = useRef<HTMLButtonElement>(null);
    const popover = useRef<HTMLDivElement>(null);
    const today = toISO(new Date());

    const cells = useMemo(() => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7;
        const start = new Date(first);
        start.setDate(1 - offset);
        return Array.from({ length: 42 }, (_unused, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [cursor]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (trigger.current?.contains(target) || popover.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
            }
        };
        const onScroll = () => setOpen(false);
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);

    const toggle = () => {
        if (open) {
            setOpen(false);
            return;
        }
        const rect = trigger.current?.getBoundingClientRect();
        if (rect) {
            const width = 272;
            const height = 336;
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
            const below = rect.bottom + 6;
            const top = below + height > window.innerHeight ? Math.max(12, rect.top - height - 6) : below;
            setPosition({ top, left });
        }
        setCursor(fromISO(value) || new Date());
        setOpen(true);
    };

    const pick = (date: Date) => {
        onChange(toISO(date));
        setOpen(false);
    };

    const shiftMonth = (delta: number) => setCursor(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    const shiftYear = (delta: number) => setCursor(current => new Date(current.getFullYear() + delta, current.getMonth(), 1));

    return (
        <>
            <button
                ref={trigger}
                type="button"
                className={`dp-trigger ${value ? '' : 'is-empty'}`.trim()}
                onClick={toggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={label || placeholder}
            >
                <Icon name="calendar" />
                <span>{value ? pretty(value) : placeholder}</span>
                <Icon name="chev-down" />
            </button>

            {open ? createPortal(
                <div
                    ref={popover}
                    className="dp-pop"
                    style={{ top: position.top, left: position.left }}
                    role="dialog"
                    aria-label="Choose a date"
                >
                    <div className="dp-head">
                        <div className="dp-nav">
                            <button type="button" onClick={() => shiftYear(-1)} title="Previous year"><Icon name="chev-double-left" /></button>
                            <button type="button" onClick={() => shiftMonth(-1)} title="Previous month"><Icon name="chev-left" /></button>
                        </div>
                        <div className="dp-title">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
                        <div className="dp-nav">
                            <button type="button" onClick={() => shiftMonth(1)} title="Next month"><Icon name="chev-right" /></button>
                            <button type="button" onClick={() => shiftYear(1)} title="Next year"><Icon name="chev-double-right" /></button>
                        </div>
                    </div>
                    <div className="dp-grid">
                        {WEEKDAYS.map(day => <div className="dp-dow" key={day}>{day}</div>)}
                        {cells.map(date => {
                            const iso = toISO(date);
                            const outside = date.getMonth() !== cursor.getMonth();
                            const selected = iso === value;
                            const isToday = iso === today;
                            return (
                                <button
                                    type="button"
                                    key={iso}
                                    className={`dp-day ${outside ? 'out' : ''} ${selected ? 'sel' : ''} ${isToday ? 'today' : ''}`.trim()}
                                    onClick={() => pick(date)}
                                    aria-pressed={selected}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>
                    <div className="dp-foot">
                        <button type="button" onClick={() => pick(new Date())}>Today</button>
                        {clearable ? (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange('');
                                    setOpen(false);
                                }}
                            >
                                Clear
                            </button>
                        ) : <span />}
                    </div>
                </div>,
                document.body
            ) : null}
        </>
    );
};
