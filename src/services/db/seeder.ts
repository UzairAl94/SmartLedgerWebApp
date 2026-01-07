import type { IDbProvider } from './types';

const INCOME_COLORS = [
    '#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0',
    '#14b8a6', '#0d9488', '#2dd4bf', '#5eead4', '#99f6e4'
];

const EXPENSE_COLORS = [
    '#f43f5e', '#e11d48', '#fb7185', '#fda4af', '#fecdd3',
    '#f97316', '#ea580c', '#fb923c', '#fdba74', '#fed7aa',
    '#8b5cf6', '#7c3aed', '#a78bfa', '#c4b5fd', '#ddd6fe'
];

const ICONS = ['💰', '💵', '💳', '🏦', '📊', '🎯', '🛒', '🍔', '🏠', '⚡', '🚗', '✈️', '🎓', '🏥', '🎮', '☕'];

const INCOME_CATEGORIES = [
    "Salary", "Bonus", "Freelance", "Business", "Commission", "Rental",
    "Interest", "Dividends", "Gifts", "Refunds", "Reimbursements",
    "Investment gains", "Side hustle", "Pension", "Other income"
];

const EXPENSE_CATEGORIES = [
    "Groceries", "Food", "Dining", "Rent", "Utilities", "Electricity",
    "Gas", "Water", "Internet", "Mobile", "Fuel", "Transport",
    "Car maintenance", "Public transport", "Shopping", "Clothing",
    "Healthcare", "Medical", "Insurance", "Education", "Tuition",
    "Subscriptions", "Entertainment", "Coffee", "Travel", "Hotels",
    "Flights", "Personal care", "Gym", "Gifts", "Charity", "Taxes",
    "Loan repayment", "Credit card payment", "Household", "Repairs", "Miscellaneous"
];

const getRandom = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

export const seedCategoriesIfNeeded = async (provider: IDbProvider) => {
    try {
        console.log('Seeder: Checking if categories are seeded...');

        const checkResult = await provider.query('SELECT value FROM settings WHERE key = ?', ['categories_seeded']);
        const isSeeded = checkResult.values && checkResult.values.length > 0 && checkResult.values[0].value === 'true';

        if (isSeeded) {
            console.log('Seeder: Categories already seeded.');
            return;
        }

        console.log('Seeder: Starting category seeding...');

        await provider.transaction(async (db) => {
            // Seed Income Categories
            for (const name of INCOME_CATEGORIES) {
                await db.execute(
                    'INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), name, getRandom(ICONS), getRandom(INCOME_COLORS), 'Income']
                );
            }

            // Seed Expense Categories
            for (const name of EXPENSE_CATEGORIES) {
                await db.execute(
                    'INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), name, getRandom(ICONS), getRandom(EXPENSE_COLORS), 'Expense']
                );
            }

            // Mark as seeded
            await db.execute(
                'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                ['categories_seeded', 'true']
            );
        });

        console.log('Seeder: Category seeding complete.');
    } catch (error) {
        console.error('Seeder: Error during category seeding:', error);
        // We don't want to throw and block app initialization, 
        // but we log it for debugging
    }
};
