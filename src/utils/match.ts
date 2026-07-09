/**
 * Resolve a spoken/parsed name against a list of items by their `name`.
 * 1) exact case-insensitive match, then
 * 2) fuzzy fallback: stored name contains the token or vice-versa.
 * Returns undefined if no match, or if the fuzzy match is ambiguous (multiple hits).
 */
export const resolveByName = <T extends { name: string }>(items: T[], rawName: string | null): T | undefined => {
    const token = (rawName || '').toLowerCase().trim();
    if (!token) return undefined;

    // 1. Exact (case-insensitive)
    const exact = items.find(i => i.name.toLowerCase().trim() === token);
    if (exact) return exact;

    // 2. Fuzzy: substring either direction
    const fuzzy = items.filter(i => {
        const name = i.name.toLowerCase().trim();
        return name.includes(token) || token.includes(name);
    });
    return fuzzy.length === 1 ? fuzzy[0] : undefined;
};
