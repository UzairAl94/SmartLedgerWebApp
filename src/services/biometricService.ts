import { Capacitor, registerPlugin } from '@capacitor/core';

interface BiometricPlugin {
    isAvailable(): Promise<{ available: boolean; reason?: string }>;
    authenticate(options: { title?: string; subtitle?: string }): Promise<{ success: boolean }>;
}

const plugin = registerPlugin<BiometricPlugin>('Biometric');

const isNative = () => Capacitor.getPlatform() !== 'web';

export interface BiometricAvailability {
    available: boolean;
    reason?: string;
}

export const biometricService = {
    async isAvailable(): Promise<BiometricAvailability> {
        if (!isNative()) return { available: false, reason: 'Available in the Android app only' };
        try {
            const result = await plugin.isAvailable();
            return { available: !!result.available, reason: result.reason };
        } catch {
            return { available: false, reason: 'Biometric plugin unavailable' };
        }
    },

    async authenticate(options: { title?: string; subtitle?: string } = {}): Promise<void> {
        if (!isNative()) throw new Error('Biometrics are available in the Android app only.');
        await plugin.authenticate(options);
    },
};
