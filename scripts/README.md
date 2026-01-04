# Category Seeder Script

This script bulk-adds income and expense categories to your Firebase database.

## Setup

The script automatically reads Firebase credentials from your `.env.local` file (no manual configuration needed!).

**Prerequisites:**
1. Make sure you have a `.env.local` file in the project root with your Firebase credentials:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

2. Install dependencies (if not already done):
   ```bash
   npm install firebase dotenv
   ```

## Running the Script

From the project root:

```bash
node scripts/seedCategories.js
```

## What It Does

- Adds **15 income categories** (Salary, Bonus, Freelance, etc.)
- Adds **38 expense categories** (Groceries, Rent, Utilities, etc.)
- Assigns random colors from curated palettes
- Assigns random icons to each category
- Capitalizes category names properly

## Output

You'll see progress in the console:
```
🌱 Starting category seeding...

📥 Adding Income categories...
  ✅ Added: Salary
  ✅ Added: Bonus
  ...

💸 Adding Expense categories...
  ✅ Added: Groceries
  ✅ Added: Food
  ...

✨ Successfully added 53 categories!
🎉 Seeding complete!
```

## Note

- The script uses **random colors and icons**. If you want specific ones, modify the `getRandomColor()` and `getRandomIcon()` functions.
- Categories are added to the `categories` collection in Firestore.
- Run this only once to avoid duplicates!
