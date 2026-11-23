import type { ApiLogEntry } from './types';

const MAX_ENTRIES = 50;
const entries: ApiLogEntry[] = [];

// Deliberately stores metadata only (method, path, status, duration).
// Request bodies, headers and the bearer token must never be recorded here:
// these entries are shown in both UIs and returned by GET /api/logs.
export const addLogEntry = (entry: ApiLogEntry): void => {
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
};

export const getLogEntries = (): ApiLogEntry[] => entries.slice();
