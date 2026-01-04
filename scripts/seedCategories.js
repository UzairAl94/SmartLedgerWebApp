/**
 * Bulk Category Seeder Script
 * 
 * This script adds predefined income and expense categories to Firebase.
 * Run with: node scripts/seedCategories.js
 * 
 * Requires: .env.local file with Firebase credentials
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Category data
const categoryData = {
    "income": [
        "salary",
        "bonus",
        "freelance",
        "business",
        "commission",
        "rental",
        "interest",
        "dividends",
        "gifts",
        "refunds",
        "reimbursements",
        "investment gains",
        "side hustle",
        "pension",
        "other income"
    ],
    "expense": [
        "groceries",
        "food",
        "dining",
        "rent",
        "utilities",
        "electricity",
        "gas",
        "water",
        "internet",
        "mobile",
        "fuel",
        "transport",
        "car maintenance",
        "public transport",
        "shopping",
        "clothing",
        "healthcare",
        "medical",
        "insurance",
        "education",
        "tuition",
        "subscriptions",
        "entertainment",
        "coffee",
        "travel",
        "hotels",
        "flights",
        "personal care",
        "gym",
        "gifts",
        "charity",
        "taxes",
        "loan repayment",
        "credit card payment",
        "household",
        "repairs",
        "miscellaneous"
    ]
};

// Color palettes for categories
const incomeColors = [
    '#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0',
    '#14b8a6', '#0d9488', '#2dd4bf', '#5eead4', '#99f6e4'
];

const expenseColors = [
    '#f43f5e', '#e11d48', '#fb7185', '#fda4af', '#fecdd3',
    '#f97316', '#ea580c', '#fb923c', '#fdba74', '#fed7aa',
    '#8b5cf6', '#7c3aed', '#a78bfa', '#c4b5fd', '#ddd6fe'
];

// Icon options (simplified - you can expand this)
const icons = ['💰', '💵', '💳', '🏦', '📊', '🎯', '🛒', '🍔', '🏠', '⚡', '🚗', '✈️', '🎓', '🏥', '🎮', '☕'];

function getRandomColor(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

function getRandomIcon() {
    return icons[Math.floor(Math.random() * icons.length)];
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function seedCategories() {
    console.log('🌱 Starting category seeding...\n');

    let totalAdded = 0;

    try {
        // Add Income categories
        console.log('📥 Adding Income categories...');
        for (const categoryName of categoryData.income) {
            const category = {
                name: capitalizeFirstLetter(categoryName),
                type: 'Income',
                color: getRandomColor(incomeColors),
                icon: getRandomIcon()
            };

            await addDoc(collection(db, 'categories'), category);
            console.log(`  ✅ Added: ${category.name}`);
            totalAdded++;
        }

        console.log('\n💸 Adding Expense categories...');
        // Add Expense categories
        for (const categoryName of categoryData.expense) {
            const category = {
                name: capitalizeFirstLetter(categoryName),
                type: 'Expense',
                color: getRandomColor(expenseColors),
                icon: getRandomIcon()
            };

            await addDoc(collection(db, 'categories'), category);
            console.log(`  ✅ Added: ${category.name}`);
            totalAdded++;
        }

        console.log(`\n✨ Successfully added ${totalAdded} categories!`);
        console.log('🎉 Seeding complete!');

    } catch (error) {
        console.error('❌ Error seeding categories:', error);
        throw error;
    }
}

// Run the seeder
seedCategories()
    .then(() => {
        console.log('\n👋 Exiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
