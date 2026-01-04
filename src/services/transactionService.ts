import {
    collection,
    runTransaction,
    doc,
    onSnapshot,
    query,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Transaction, Account } from '../types';

const TRANSACTIONS_COLLECTION = 'transactions';
const ACCOUNTS_COLLECTION = 'accounts';

export const transactionService = {
    // Subscribe to transactions
    subscribeToTransactions: (onUpdate: (transactions: Transaction[]) => void, maxLimit = 50) => {
        const q = query(
            collection(db, TRANSACTIONS_COLLECTION),
            orderBy('date', 'desc'),
            limit(maxLimit)
        );
        return onSnapshot(q, (snapshot) => {
            const transactions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Transaction[];
            onUpdate(transactions);
        });
    },

    // Add transaction and update account balance atomically
    createTransaction: async (tx: Omit<Transaction, 'id'>) => {
        const accountRef = doc(db, ACCOUNTS_COLLECTION, tx.accountId);
        const toAccountRef = tx.type === 'Transfer' && tx.toAccountId
            ? doc(db, ACCOUNTS_COLLECTION, tx.toAccountId)
            : null;

        return runTransaction(db, async (firestoreTransaction) => {
            const accountDoc = await firestoreTransaction.get(accountRef);
            if (!accountDoc.exists()) {
                throw new Error("Source account does not exist!");
            }

            const accountData = accountDoc.data() as Account;
            const fee = tx.fee || 0;

            // Calculate new balance for source account
            // Income: +amount - fee
            // Expense: -amount - fee
            // Transfer: -amount - fee
            let newBalance = accountData.balance;

            if (tx.type === 'Income') {
                newBalance = accountData.balance + tx.amount - fee;
            } else {
                // Expense or Transfer
                newBalance = accountData.balance - tx.amount - fee;
            }

            // Create the transaction record
            const txRef = doc(collection(db, TRANSACTIONS_COLLECTION));
            firestoreTransaction.set(txRef, tx);

            // Update the source account balance
            firestoreTransaction.update(accountRef, { balance: newBalance });

            // Handle Transfer destination account
            if (tx.type === 'Transfer' && toAccountRef) {
                const toAccountDoc = await firestoreTransaction.get(toAccountRef);
                if (!toAccountDoc.exists()) {
                    throw new Error("Destination account does not exist!");
                }
                const toAccountData = toAccountDoc.data() as Account;

                // For Transfer, we ADD amount to destination (Fees are paid by sender)
                const newToBalance = toAccountData.balance + tx.amount;
                firestoreTransaction.update(toAccountRef, { balance: newToBalance });
            }

            return txRef.id;
        });
    },

    // Delete transaction and revert account balance atomically
    deleteTransaction: async (tx: Transaction) => {
        const accountRef = doc(db, ACCOUNTS_COLLECTION, tx.accountId);
        const toAccountRef = tx.type === 'Transfer' && tx.toAccountId
            ? doc(db, ACCOUNTS_COLLECTION, tx.toAccountId)
            : null;
        const txRef = doc(db, TRANSACTIONS_COLLECTION, tx.id);

        return runTransaction(db, async (firestoreTransaction) => {
            const accountDoc = await firestoreTransaction.get(accountRef);
            if (!accountDoc.exists()) {
                throw new Error("Source account does not exist!");
            }

            const accountData = accountDoc.data() as Account;
            const fee = tx.fee || 0;

            // Revert balance for source account
            let newBalance = accountData.balance;

            if (tx.type === 'Income') {
                // Revert Income: -amount + fee (Wait, fee was deducted, so we add it back? Yes. Amount was added, so subtract it.)
                // Original: balance + amount - fee
                // Revert: balance - amount + fee
                newBalance = accountData.balance - tx.amount + fee;
            } else {
                // Revert Expense/Transfer: +amount + fee
                // Original: balance - amount - fee
                // Revert: balance + amount + fee
                newBalance = accountData.balance + tx.amount + fee;
            }

            // Delete the transaction record
            firestoreTransaction.delete(txRef);

            // Update the source account balance
            firestoreTransaction.update(accountRef, { balance: newBalance });

            // Handle Transfer destination account revert
            if (tx.type === 'Transfer' && toAccountRef) {
                const toAccountDoc = await firestoreTransaction.get(toAccountRef);
                if (!toAccountDoc.exists()) {
                    throw new Error("Destination account does not exist!");
                }
                const toAccountData = toAccountDoc.data() as Account;

                // Revert Transfer destination: -amount
                const newToBalance = toAccountData.balance - tx.amount;
                firestoreTransaction.update(toAccountRef, { balance: newToBalance });
            }
        });
    }
};
