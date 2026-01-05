import { sqliteService } from './sqliteService';
import type { Category } from '../types';

type Listener = (categories: Category[]) => void;

class CategoryService {
    private listeners: Listener[] = [];

    // Subscribe to categories changes
    subscribeToCategories(onUpdate: Listener) {
        this.listeners.push(onUpdate);
        this.fetchAndNotify(); // Initial fetch

        return () => {
            this.listeners = this.listeners.filter(l => l !== onUpdate);
        };
    }

    private async fetchAndNotify() {
        try {
            const categories = await this.getAllCategories();
            this.listeners.forEach(listener => listener(categories));
        } catch (error) {
            console.error('Error fetching and notifying categories:', error);
        }
    }

    async getAllCategories(): Promise<Category[]> {
        const result = await sqliteService.query('SELECT * FROM categories ORDER BY name ASC');
        return (result.values || []) as Category[];
    }

    // Add a new category
    async addCategory(category: Omit<Category, 'id'>) {
        const id = crypto.randomUUID();
        await sqliteService.execute(
            'INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
            [id, category.name, category.icon, category.color, category.type]
        );
        await this.fetchAndNotify();
        return id;
    }

    // Delete a category
    async deleteCategory(id: string) {
        await sqliteService.execute('DELETE FROM categories WHERE id = ?', [id]);
        await this.fetchAndNotify();
    }
}

export const categoryService = new CategoryService();
