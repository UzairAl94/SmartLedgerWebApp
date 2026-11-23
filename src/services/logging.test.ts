import { describe, expect, it } from 'vitest';

// Vite inlines these at transform time, so the test needs no filesystem access.
const serviceSources = import.meta.glob('/src/services/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

describe('service logging', () => {
    it('never uses console.log for payloads (use info/warn/error deliberately)', () => {
        const offenders = Object.entries(serviceSources)
            .filter(([path]) => !path.endsWith('.test.ts'))
            .filter(([, source]) => /console\.log\s*\(/.test(source))
            .map(([path]) => path.replace('/src/services/', ''));

        expect(offenders).toEqual([]);
    });
});
