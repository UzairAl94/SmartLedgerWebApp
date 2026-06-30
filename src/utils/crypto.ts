// SHA-256 hex digest of a PIN. Used so the raw PIN is never persisted.
// Requires a secure context (native webview / https / localhost).
export const hashPin = async (pin: string): Promise<string> => {
    const data = new TextEncoder().encode(pin);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

// A legacy stored PIN is the raw 4-digit value (pre-hashing).
export const isLegacyPlaintextPin = (stored: string): boolean => /^\d{4}$/.test(stored);
