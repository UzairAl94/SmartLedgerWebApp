import { useEffect, useMemo, useState } from 'react';
import { periodService, type PeriodSummary } from '../services/periodService';
import { currentPeriod, previousPeriod } from '../services/payPeriodMath';

/** Stored pay cycles, with the current and previous one resolved. */
export const usePayPeriods = () => {
    const [periods, setPeriods] = useState<PeriodSummary[]>([]);

    useEffect(() => {
        let cancelled = false;
        periodService.summaries()
            .then(rows => { if (!cancelled) setPeriods(rows); })
            .catch(() => { if (!cancelled) setPeriods([]); });
        return () => { cancelled = true; };
    }, []);

    const current = useMemo(() => currentPeriod(periods) as PeriodSummary | null, [periods]);
    const previous = useMemo(() => previousPeriod(periods, current) as PeriodSummary | null, [periods, current]);

    return { periods, current, previous };
};
