import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isWeb = () => Capacitor.getPlatform() === 'web';

export const notificationService = {
    async requestPermission(): Promise<boolean> {
        if (isWeb()) {
            if (!('Notification' in window)) return false;
            const result = await Notification.requestPermission();
            return result === 'granted';
        }
        const { display } = await LocalNotifications.requestPermissions();
        return display === 'granted';
    },

    async hasPermission(): Promise<boolean> {
        if (isWeb()) {
            return 'Notification' in window && Notification.permission === 'granted';
        }
        const { display } = await LocalNotifications.checkPermissions();
        return display === 'granted';
    },

    /** Fire a notification now (used for budget alerts on app open). */
    async notify(title: string, body: string, id?: number): Promise<void> {
        if (isWeb()) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body });
            }
            return;
        }
        await LocalNotifications.schedule({
            notifications: [{
                id: id ?? Math.floor(Date.now() % 100000),
                title,
                body,
            }],
        });
    },

    /** Schedule a notification at a future time (used for recurring reminders). */
    async scheduleAt(id: number, title: string, body: string, at: Date): Promise<void> {
        if (isWeb()) return; // web has no reliable scheduler while closed
        await LocalNotifications.schedule({
            notifications: [{ id, title, body, schedule: { at } }],
        });
    },

    async cancel(id: number): Promise<void> {
        if (isWeb()) return;
        await LocalNotifications.cancel({ notifications: [{ id }] });
    },
};
