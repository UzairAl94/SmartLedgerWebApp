import OpenAI from "openai";

export interface ParsedTransaction {
    type: 'income' | 'expense' | 'transfer' | null;
    amount: number | null;
    category: string | null;
    account: string | null;
    fromAccount: string | null;
    toAccount: string | null;
    note: string | null;
}

const SYSTEM_PROMPT = `
You are a strict JSON parser for a personal finance ledger app.

Your task:
- Convert raw speech-to-text input into a structured JSON object.

Rules:
- Output ONLY valid JSON
- Do NOT include explanations, comments, or extra text
- If a field is missing or unclear, set it to null
- Amount must be a NUMBER (not string)
- Normalize large numbers (e.g. "25 thousand" → 25000)
- Allowed transaction types: income, expense, transfer
- Categories must be short lowercase nouns
- Account names must be lowercase
- Notes are free-form text (string or null)
- Never guess missing values

JSON fields:
- type
- amount
- category
- account
- fromAccount
- toAccount
- note
`;

export const deepSeekService = {
    parseTransaction: async (text: string, apiKey: string): Promise<ParsedTransaction> => {
        if (!apiKey) {
            throw new Error("DeepSeek API Key is missing");
        }

        const openai = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
            dangerouslyAllowBrowser: true // Client-side usage
        });

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: text }
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
