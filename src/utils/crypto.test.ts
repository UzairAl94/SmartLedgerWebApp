import { describe, expect, it } from 'vitest';
import { hashPin, isLegacyHashPin, isLegacyPlaintextPin, needsPinUpgrade, verifyPin } from './crypto';

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

describe('PIN hashing', () => {
    it('stores PBKDF2 with a salt, not a bare digest', async () => {
        const stored = await hashPin('1234');
        expect(stored.startsWith('pbkdf2$210000$')).toBe(true);
        expect(isLegacyHashPin(stored)).toBe(false);
        expect(needsPinUpgrade(stored)).toBe(false);
    });

    it('verifies the correct PIN and rejects a wrong one', async () => {
        const stored = await hashPin('4321');
        await expect(verifyPin(stored, '4321')).resolves.toBe(true);
        await expect(verifyPin(stored, '1234')).resolves.toBe(false);
    });

    it('salts every hash, so the same PIN produces different values', async () => {
        const first = await hashPin('0000');
        const second = await hashPin('0000');
        expect(first).not.toBe(second);
        await expect(verifyPin(first, '0000')).resolves.toBe(true);
        await expect(verifyPin(second, '0000')).resolves.toBe(true);
    });

    it('accepts a legacy SHA-256 hash and flags it for upgrade', async () => {
        const legacy = await sha256Hex('2468');
        expect(isLegacyHashPin(legacy)).toBe(true);
        expect(needsPinUpgrade(legacy)).toBe(true);
        await expect(verifyPin(legacy, '2468')).resolves.toBe(true);
        await expect(verifyPin(legacy, '1357')).resolves.toBe(false);
    });

    it('accepts a legacy plaintext PIN', async () => {
        expect(isLegacyPlaintextPin('0420')).toBe(true);
        await expect(verifyPin('0420', '0420')).resolves.toBe(true);
        await expect(verifyPin('0420', '0000')).resolves.toBe(false);
    });

    it('rejects malformed stored values instead of throwing', async () => {
        await expect(verifyPin('pbkdf2$nope$bad', '1234')).resolves.toBe(false);
        await expect(verifyPin('', '1234')).resolves.toBe(false);
    });
});
