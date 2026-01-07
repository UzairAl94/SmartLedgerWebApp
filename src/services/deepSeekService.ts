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
- Amount must be a NUMBER (not string)
- Normalize large numbers (e.g. "25 thousand" → 25000)
- Allowed transaction types: income, expense, transfer
- Allowed currencies: PKR, USD, AED, MYR (default: PKR if not mentioned)
- Detect currency from keywords: "dollars"/"usd" → USD, "dirhams"/"aed" → AED, "rupees"/"pkr" → PKR, "ringgit"/"myr" → MYR
- **IMPORTANT**: category and account names MUST be in "Proper Case" (e.g., "Salary", "Food", "Cash").
- Favor matching input to the 'Existing Accounts' and 'Existing Categories' provided above. If a match is close, use the exact name from the list.
- Notes are free-form text (string or null)
- Never guess missing values

JSON fields:
- type (income/expense/transfer)
- amount (number)
- currency (PKR/USD/AED/MYR, default PKR)
- category (Proper Case string)
- account (Proper Case string)
- fromAccount (for transfers, Proper Case string)
- toAccount (for transfers, Proper Case string)
- note (string or null)
`;

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
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No content received from DeepSeek");

            // Extract JSON if wrapped in markdown code blocks
            const jsonString = content.replace(/```json\n|\n```/g, '').trim();

            const result = JSON.parse(jsonString) as ParsedTransaction;
            console.log("DeepSeek Parsing Result:", result);
            return result;
        } catch (error) {
            console.error("DeepSeek Parsing Error:", error);
            throw error;
        }
    }
};
