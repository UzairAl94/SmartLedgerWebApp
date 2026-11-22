import OpenAI from "openai";
import { normalizeVoiceText } from "../utils/textUtils";

export interface ParsedTransaction {
    type: 'income' | 'expense' | 'transfer' | null;
    amount: number | null;
    currency: 'PKR' | 'USD' | 'AED' | 'MYR' | null;
    category: string | null;
    account: string | null;
    fromAccount: string | null;
    toAccount: string | null;
    note: string | null;
}

const getSystemPrompt = (accounts: string[], categories: string[]) => `
You are a strict JSON parser for a personal finance ledger app.

Your task:
- Convert raw speech-to-text input into a structured JSON object.

Context:
- Existing Accounts: ${accounts.join(', ') || 'None'}
- Existing Categories: ${categories.join(', ') || 'None'}

Rules:
- Output ONLY valid JSON
- Do NOT include explanations, comments, or extra text
- If a field is missing or unclear, set it to null
- Amount must be a plain NUMBER (not a string, no commas or currency symbols)
- Normalize large numbers (e.g. "25 thousand" → 25000)
- Allowed transaction types (lowercase): income, expense, transfer
- Allowed currencies: PKR, USD, AED, MYR
- If the user does not mention a currency, set currency to null (the app will use the account's currency)
- Detect currency from keywords: "dollars"/"usd" → USD, "dirhams"/"aed" → AED, "rupees"/"pkr" → PKR, "ringgit"/"myr" → MYR
- **IMPORTANT**: category and account names MUST be in "Proper Case" (e.g., "Salary", "Food", "Cash").
- **MATCHING (critical)**: If the spoken account or category is an abbreviation, partial name, initials, misspelling, or fuzzy variant of an entry in 'Existing Accounts' / 'Existing Categories', you MUST return that entry's EXACT full name verbatim from the list.
  - Match case-insensitively, on substrings and initials. Examples: "UBL" → "UBL Bank", "meezan" → "Meezan Bank", "hbl" → "HBL Savings", "grocery" / "groceries" → "Groceries", "uber" → "Transport" (if that is the closest existing category).
  - Always prefer an existing list entry over inventing a new name.
  - Only output a new name (not in the list) when NO reasonable match exists.
- Notes are free-form text (string or null)
- Never guess missing values

JSON fields:
- type (income/expense/transfer)
- amount (number)
- currency (PKR/USD/AED/MYR, or null if not mentioned)
- category (Proper Case string)
- account (Proper Case string)
- fromAccount (for transfers, Proper Case string)
- toAccount (for transfers, Proper Case string)
- note (string or null)
`;

export interface ParsedAccount {
    action: 'add' | 'update' | 'delete' | null;
    name: string | null;        // new/updated account name
    type: 'Bank' | 'Cash' | 'Investment' | null;
    currency: 'PKR' | 'USD' | 'AED' | 'MYR' | null;
    initialBalance: number | null;
    targetAccount: string | null; // for updates: which existing account to change
}

const getAccountSystemPrompt = (accounts: string[]) => `
You are a strict JSON parser for a personal finance app's ACCOUNTS.

Convert a spoken command into a structured JSON object describing an account add or update.

Existing Accounts: ${accounts.join(', ') || 'None'}

Rules:
- Output ONLY valid JSON. No explanations or markdown.
- action: "add" to create a new account, "update" to modify an existing one, "delete" to remove one. null if unclear.
- For "update" and "delete", targetAccount MUST be the account being changed/removed; match the user's words to an entry in Existing Accounts (abbreviation/partial/fuzzy → use the EXACT name from the list).
- Treat "delete", "remove", "get rid of" as action "delete".
- name: for add = the new account's name; for update = the new name IF the user renames it, else null.
- Only include fields the user actually stated; set everything else to null.
- Allowed types: Bank, Cash, Investment (Proper Case).
- Allowed currencies: PKR, USD, AED, MYR. Detect from keywords (dollars→USD, dirhams→AED, rupees→PKR, ringgit→MYR).
- initialBalance must be a NUMBER; normalize large numbers ("5 thousand" → 5000).

JSON fields: action, name, type, currency, initialBalance, targetAccount.
`;

const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
const ACCOUNT_TYPES = ['Bank', 'Cash', 'Investment'] as const;
const CURRENCIES = ['PKR', 'USD', 'AED', 'MYR'] as const;
const ACCOUNT_ACTIONS = ['add', 'update', 'delete'] as const;

const coerceString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const coerceNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const coerceCurrency = (value: unknown): ParsedTransaction['currency'] => {
    const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return (CURRENCIES as readonly string[]).includes(raw)
        ? (raw as ParsedTransaction['currency'])
        : null;
};

// Pull the JSON object out of a response, tolerating markdown fences and prose.
const extractJson = (content: string): string => {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : content).trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('AI response did not contain valid JSON.');
    }
    return text.slice(start, end + 1);
};

// Never trust model output: coerce every field into the exact shapes the app expects.
const normalizeParsedTransaction = (raw: unknown): ParsedTransaction => {
    const source = (raw ?? {}) as Record<string, unknown>;
    const typeRaw = typeof source.type === 'string' ? source.type.trim().toLowerCase() : '';
    const type = (TRANSACTION_TYPES as readonly string[]).includes(typeRaw)
        ? (typeRaw as ParsedTransaction['type'])
        : null;

    return {
        type,
        amount: coerceNumber(source.amount),
        currency: coerceCurrency(source.currency),
        category: coerceString(source.category),
        account: coerceString(source.account),
        fromAccount: coerceString(source.fromAccount),
        toAccount: coerceString(source.toAccount),
        note: coerceString(source.note),
    };
};

const normalizeParsedAccount = (raw: unknown): ParsedAccount => {
    const source = (raw ?? {}) as Record<string, unknown>;
    const actionRaw = typeof source.action === 'string' ? source.action.trim().toLowerCase() : '';
    const action = (ACCOUNT_ACTIONS as readonly string[]).includes(actionRaw)
        ? (actionRaw as ParsedAccount['action'])
        : null;
    const typeRaw = typeof source.type === 'string' ? source.type.trim() : '';
    const type = (ACCOUNT_TYPES as readonly string[]).includes(typeRaw)
        ? (typeRaw as ParsedAccount['type'])
        : null;

    return {
        action,
        name: coerceString(source.name),
        type,
        currency: coerceCurrency(source.currency),
        initialBalance: coerceNumber(source.initialBalance),
        targetAccount: coerceString(source.targetAccount),
    };
};

export const deepSeekService = {
    parseTransaction: async (text: string, apiKey: string, accounts: string[] = [], categories: string[] = []): Promise<ParsedTransaction> => {
        if (!apiKey) {
            throw new Error("DeepSeek API Key is missing");
        }

        const normalizedText = normalizeVoiceText(text);

        const openai = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
            dangerouslyAllowBrowser: true // Client-side usage
        });

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: getSystemPrompt(accounts, categories) },
                    { role: "user", content: normalizedText }
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No content received from DeepSeek");

            const result = normalizeParsedTransaction(JSON.parse(extractJson(content)));
            return result;
        } catch (error) {
            console.error("DeepSeek Parsing Error:", error);
            throw error;
        }
    },

    parseAccount: async (text: string, apiKey: string, accounts: string[] = []): Promise<ParsedAccount> => {
        if (!apiKey) throw new Error("DeepSeek API Key is missing");

        const normalizedText = normalizeVoiceText(text);
        const openai = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey,
            dangerouslyAllowBrowser: true,
        });

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: getAccountSystemPrompt(accounts) },
                    { role: "user", content: normalizedText },
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No content received from DeepSeek");
            return normalizeParsedAccount(JSON.parse(extractJson(content)));
        } catch (error) {
            console.error("DeepSeek Account Parsing Error:", error);
            throw error;
        }
    }
};
