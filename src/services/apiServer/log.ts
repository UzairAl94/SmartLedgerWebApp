import type { ApiLogEntry } from './types';

const MAX_ENTRIES = 50;
const entries: ApiLogEntry[] = [];

export const addLogEntry = (entry: ApiLogEntry): void => {
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
};

export const getLogEntries = (): ApiLogEntry[] => entries.slice();
