import {
    doc,
    onSnapshot,
    setDoc,
    getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserSettings } from '../types';

const COLLECTION_NAME = 'settings';
// Single user app for now, so we use a constant ID or a known document
const SETTINGS_DOC_ID = 'user_preferences';

const DEFAULT_SETTINGS: UserSettings = {
    mainCurrency: 'PKR',
    monthStartDay: 1,
    useCustomRates: false,
    customRates: {
        'USD': 278.50, // Default fallback
        'AED': 75.83,
        'PKR': 1
    }
};

export const settingsService = {
    // Subscribe to settings changes
    subscribeToSettings: (onUpdate: (settings: UserSettings) => void) => {
        const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);

        return onSnapshot(docRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                onUpdate({ ...DEFAULT_SETTINGS, ...docSnapshot.data() } as UserSettings);
            } else {
                // Initialize default settings if they don't exist
                await setDoc(docRef, DEFAULT_SETTINGS);
                onUpdate(DEFAULT_SETTINGS);
            }
        });
    },

    // Update settings
    updateSettings: async (updates: Partial<UserSettings>) => {
        const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
        // Ensure document exists before updating, or use set with merge
        // For simplicity with Partial updates on potentially missing doc, we can check or use set with merge:
        // But since we subscribe first, it should exist. Let's use set with merge for safety on 'update' if strictly needed, 
        // but updateDoc is cleaner if we know it exists. The subscription creates it.
        // Let's use setDoc with merge to be safe and simple.
        return setDoc(docRef, updates, { merge: true });
    },

    // Get current settings once (promise based)
    getSettings: async (): Promise<UserSettings> => {
        const docRef = doc(db, COLLECTION_NAME, SETTINGS_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { ...DEFAULT_SETTINGS, ...docSnap.data() } as UserSettings;
        } else {
            return DEFAULT_SETTINGS;
        }
    }
};
