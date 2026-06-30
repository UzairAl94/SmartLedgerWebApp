import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

// Secret keys held outside the settings JSON.
export const SECRET_KEYS = {
    deepSeek: 'deepseek_api_key',
    elevenLabs: 'eleven_labs_api_key',
} as const;

const isWeb = () => Capacitor.getPlatform() === 'web';
const webKey = (key: string) => `secret_${key}`;

/**
 * Stores API keys in the platform secure store (Android Keystore / iOS Keychain)
 * on native, and falls back to localStorage on web (dev/preview only — not secure).
 */
export const secretsService = {
    async getKey(key: string): Promise<string | null> {
        if (isWeb()) {
            return localStorage.getItem(webKey(key));
        }
        try {
            const { value } = await SecureStoragePlugin.get({ key });
            return value || null;
        } catch {
            // Plugin throws when the key is absent.
            return null;
        }
    },

    async setKey(key: string, value: string): Promise<void> {
        if (!value) {
            await secretsService.removeKey(key);
            return;
        }
        if (isWeb()) {
            localStorage.setItem(webKey(key), value);
            return;
        }
        await SecureStoragePlugin.set({ key, value });
    },

    async removeKey(key: string): Promise<void> {
        if (isWeb()) {
            localStorage.removeItem(webKey(key));
            return;
        }
        try {
            await SecureStoragePlugin.remove({ key });
        } catch {
            // Already absent — ignore.
        }
    },

    /**
     * One-time migration: seed keys from the build-time env if the secure store
     * is empty. Called once at startup.
     */
    async seedFromEnvIfEmpty(): Promise<void> {
        const seeds: Array<[string, string | undefined]> = [
            [SECRET_KEYS.deepSeek, import.meta.env.VITE_DEEPSEEK_API_KEY],
            [SECRET_KEYS.elevenLabs, import.meta.env.VITE_ELEVEN_LABS_API_KEY],
        ];
        for (const [key, envValue] of seeds) {
            if (!envValue) continue;
            const existing = await secretsService.getKey(key);
            if (!existing) await secretsService.setKey(key, envValue);
        }
    },
};
