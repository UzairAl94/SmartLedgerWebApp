// PIN hashing. New PINs use PBKDF2-SHA256 with a random salt; legacy values
// (a bare SHA-256 hex digest, or an even older plaintext PIN) are still
// accepted and are upgraded on the next successful unlock.
// Requires a secure context (native webview / https / localhost).

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const SCHEME = 'pbkdf2';

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
};

const derive = async (pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
    // Copy into a fresh ArrayBuffer-backed view; TS 5.9 narrows BufferSource strictly.
    const saltBytes = new Uint8Array(salt.length);
    saltBytes.set(salt);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
        key,
        KEY_BITS
    );
    return new Uint8Array(bits);
};

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
    return difference === 0;
};

/** A legacy stored PIN is the raw 4-digit value (pre-hashing). */
export const isLegacyPlaintextPin = (stored: string): boolean => /^\d{4}$/.test(stored);

/** A legacy stored PIN is a bare SHA-256 hex digest. */
export const isLegacyHashPin = (stored: string): boolean => /^[a-f0-9]{64}$/i.test(stored);

/** Hash a PIN for storage: pbkdf2$<iterations>$<salt$><hash> */
export const hashPin = async (pin: string): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const derived = await derive(pin, salt, PBKDF2_ITERATIONS);
    return `${SCHEME}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
};

/** Verify an entered PIN against any stored format. */
export const verifyPin = async (stored: string, pin: string): Promise<boolean> => {
    if (!stored) return false;

    if (isLegacyPlaintextPin(stored)) return stored === pin;
    if (isLegacyHashPin(stored)) return (await sha256Hex(pin)) === stored.toLowerCase();

    const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split('$');
    if (scheme !== SCHEME || !iterationsRaw || !saltRaw || !hashRaw) return false;

    const iterations = Number.parseInt(iterationsRaw, 10);
    if (!Number.isFinite(iterations) || iterations < 10_000) return false;

    try {
        const expected = fromBase64(hashRaw);
        const actual = await derive(pin, fromBase64(saltRaw), iterations);
        return constantTimeEqual(actual, expected);
    } catch {
        return false;
    }
};

/** True when the stored value should be re-hashed after a successful unlock. */
export const needsPinUpgrade = (stored: string): boolean =>
    isLegacyPlaintextPin(stored) || isLegacyHashPin(stored);
