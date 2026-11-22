import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { sqliteService } from './sqliteService';

// Secret keys held outside the settings JSON.
export const SECRET_KEYS = {
    deepSeek: 'deepseek_api_key',
    elevenLabs: 'eleven_labs_api_key',
    apiToken: 'api_server_token',
} as const;

const SETTINGS_KEY = 'user_preferences';
const LEGACY_SETTINGS_KEYS: Array<{ legacy: string; secret: string }> = [
    { legacy: 'deepSeekApiKey', secret: SECRET_KEYS.deepSeek },
    { legacy: 'elevenLabsApiKey', secret: SECRET_KEYS.elevenLabs },
];

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
     * One-time migration: older builds stored the AI API keys inside the
     * settings JSON (which also put them in backups and exposed them to the
     * API). Move them into secure storage and remove them from settings.
     */
    async migrateLegacySettingsKeys(): Promise<void> {
        try {
            const result = await sqliteService.query('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
            const raw = result.values?.[0]?.value;
            if (typeof raw !== 'string') return;

            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                return;
            }

            let changed = false;
            for (const { legacy, secret } of LEGACY_SETTINGS_KEYS) {
                const value = parsed[legacy];
                if (typeof value !== 'string' || !value.trim()) continue;

                const existing = await secretsService.getKey(secret);
                if (!existing) await secretsService.setKey(secret, value.trim());

                delete parsed[legacy];
                changed = true;
            }

            if (changed) {
                await sqliteService.execute(
                    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                    [SETTINGS_KEY, JSON.stringify(parsed)]
                );
            }
        } catch (error) {
            console.error('Failed to migrate legacy API keys:', error);
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
