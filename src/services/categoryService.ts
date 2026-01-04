import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Category } from '../types';

const COLLECTION_NAME = 'categories';

export const categoryService = {
    // Subscribe to categories changes
    subscribeToCategories: (onUpdate: (categories: Category[]) => void) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
        return onSnapshot(q, (snapshot) => {
            const categories = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Category[];
            onUpdate(categories);
        });
    },

    // Add a new category
    addCategory: async (category: Omit<Category, 'id'>) => {
        return addDoc(collection(db, COLLECTION_NAME), category);
    },

    // Delete a category
    deleteCategory: async (id: string) => {
        const categoryRef = doc(db, COLLECTION_NAME, id);
        return deleteDoc(categoryRef);
    }
};
