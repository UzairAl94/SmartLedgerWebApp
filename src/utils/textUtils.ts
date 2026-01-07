/**
 * Normalizes voice transcript text by collapsing spaces, 
 * trimming, and handling all-caps issues.
 */
export const normalizeVoiceText = (text: string): string => {
    if (!text) return '';

    // Collapse multiple spaces and trim
    let normalized = text.replace(/\s+/g, ' ').trim();

    // If the text is all caps (often happens with some STT engines), 
    // lowercase it to make it more readable for the LLM
    if (normalized === normalized.toUpperCase() && normalized !== normalized.toLowerCase()) {
        normalized = normalized.toLowerCase();
    }

    return normalized;
};

/**
 * Converts a string to Proper Case (e.g., "GROCERIES" -> "Groceries", "food" -> "Food")
 */
export const toProperCase = (text: string): string => {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};
