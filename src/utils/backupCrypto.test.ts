import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, isEncryptedBackup } from './backupCrypto';

const payload = new TextEncoder().encode('{"hello":"ledger"}');

describe('encrypted backups', () => {
    it('round-trips with the correct passphrase', async () => {
        const envelope = await encryptBackup(payload, 'correct horse battery');
        expect(isEncryptedBackup(envelope)).toBe(true);
        const restored = await decryptBackup(envelope, 'correct horse battery');
        expect(new TextDecoder().decode(restored)).toBe('{"hello":"ledger"}');
    });

    it('rejects a wrong passphrase without returning plaintext', async () => {
        const envelope = await encryptBackup(payload, 'correct horse battery');
        await expect(decryptBackup(envelope, 'wrong passphrase')).rejects.toThrow(/Wrong passphrase/);
    });

    it('rejects tampered ciphertext', async () => {
        const envelope = await encryptBackup(payload, 'correct horse battery');
        const tampered = new Uint8Array(envelope);
        tampered[tampered.length - 1] ^= 0xff;
        await expect(decryptBackup(tampered, 'correct horse battery')).rejects.toThrow(/Wrong passphrase/);
    });

    it('requires a passphrase of reasonable length', async () => {
        await expect(encryptBackup(payload, 'short')).rejects.toThrow(/at least 8 characters/);
    });

    it('recognises its own container and nothing else', async () => {
        const envelope = await encryptBackup(payload, 'correct horse battery');
        expect(isEncryptedBackup(envelope)).toBe(true);
        expect(isEncryptedBackup(new TextEncoder().encode('PK\x03\x04rest'))).toBe(false);
        expect(isEncryptedBackup(new Uint8Array([1, 2, 3]))).toBe(false);
    });
});
