// Encrypted backup container.
//
//   "SLBK1" | salt (16) | iv (12) | AES-256-GCM ciphertext
//
// The key is PBKDF2-SHA256(passphrase, salt, 210k) and the ciphertext is the
// whole backup ZIP, so filenames and receipt paths are protected too.

const MAGIC = new TextEncoder().encode('SLBK1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ITERATIONS = 210_000;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;

const copy = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
};

export const isEncryptedBackup = (bytes: Uint8Array): boolean => {
    if (bytes.length < MAGIC.length) return false;
    return MAGIC.every((byte, index) => bytes[index] === byte);
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: copy(salt), iterations: ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

export const encryptBackup = async (data: Uint8Array, passphrase: string): Promise<Uint8Array> => {
    if (!passphrase || passphrase.length < 8) {
        throw new Error('The backup passphrase must be at least 8 characters.');
    }

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt);
    const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: copy(iv) }, key, copy(data))
    );

    const envelope = new Uint8Array(HEADER_BYTES + cipher.length);
    envelope.set(MAGIC, 0);
    envelope.set(salt, MAGIC.length);
    envelope.set(iv, MAGIC.length + SALT_BYTES);
    envelope.set(cipher, HEADER_BYTES);
    return envelope;
};

export const decryptBackup = async (envelope: Uint8Array, passphrase: string): Promise<Uint8Array> => {
    if (!isEncryptedBackup(envelope)) throw new Error('This is not an encrypted Smart Ledger backup.');
    if (envelope.length <= HEADER_BYTES) throw new Error('The backup file is truncated.');

    const salt = envelope.slice(MAGIC.length, MAGIC.length + SALT_BYTES);
    const iv = envelope.slice(MAGIC.length + SALT_BYTES, HEADER_BYTES);
    const cipher = envelope.slice(HEADER_BYTES);
    const key = await deriveKey(passphrase, salt);

    try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: copy(iv) }, key, copy(cipher));
        return new Uint8Array(plain);
    } catch {
        throw new Error('Wrong passphrase, or the backup file is damaged.');
    }
};
