import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Account } from '../types';

const COLLECTION_NAME = 'accounts';

export const accountService = {
    // Subscribe to accounts changes
    subscribeToAccounts: (onUpdate: (accounts: Account[]) => void) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
        return onSnapshot(q, (snapshot) => {
            const accounts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Account[];
            onUpdate(accounts);
        });
    },

    // Add a new account
    addAccount: async (account: Omit<Account, 'id'>) => {
        return addDoc(collection(db, COLLECTION_NAME), account);
    },

    // Update an existing account
    updateAccount: async (id: string, updates: Partial<Account>) => {
        const accountRef = doc(db, COLLECTION_NAME, id);
        return updateDoc(accountRef, updates);
    },

    // Delete an account
    deleteAccount: async (id: string) => {
        const accountRef = doc(db, COLLECTION_NAME, id);
        return deleteDoc(accountRef);
    }
};
