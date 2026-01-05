import { sqliteService } from './sqliteService';
import type { UserSettings } from '../types';

type Listener = (settings: UserSettings) => void;

const SETTINGS_KEY = 'user_preferences';

const DEFAULT_SETTINGS: UserSettings = {
    mainCurrency: 'PKR',
    monthStartDay: 1,
    useCustomRates: false,
    customRates: {
        'USD': 278.50,
        'AED': 75.83,
        'MYR': 62.0,
        'PKR': 1
    },
    elevenLabsApiKey: import.meta.env.VITE_ELEVEN_LABS_API_KEY,
    deepSeekApiKey: import.meta.env.VITE_DEEPSEEK_API_KEY,
};

class SettingsService {
    private listeners: Listener[] = [];

    // Subscribe to settings changes
    subscribeToSettings(onUpdate: Listener) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify(); // Initial fetch

        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify() {
        try {
            const settings = await this.getSettings();
            this.listeners.forEach(listener => listener(settings));
        } catch (error) {
            console.error('Error fetching and notifying settings:', error);
        }
    }

    // Get settings
    async getSettings(): Promise<UserSettings> {
        const result = await sqliteService.query('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
        if (result.values && result.values.length > 0) {
            try {
                const storedSettings = JSON.parse(result.values[0].value);
                return { ...DEFAULT_SETTINGS, ...storedSettings };
            } catch (e) {
                console.error('Error parsing stored settings, using defaults', e);
                return DEFAULT_SETTINGS;
            }
        }
        return DEFAULT_SETTINGS;
    }

    // Update settings
    async updateSettings(updates: Partial<UserSettings>) {
        const current = await this.getSettings();
        const updated = { ...current, ...updates };
        const value = JSON.stringify(updated);

        await sqliteService.execute(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            [SETTINGS_KEY, value]
        );
        await this.fetchAndNotify();
    }
}

export const settingsService = new SettingsService();
