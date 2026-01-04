import { ElevenLabsClient } from "elevenlabs";

export const elevenLabsService = {
    transcribeAudio: async (audioBlob: Blob, apiKey: string): Promise<string> => {
        if (!apiKey) {
            throw new Error("ElevenLabs API Key is missing");
        }

        try {
            const client = new ElevenLabsClient({ apiKey });

            // Convert Blob to File
            const audioFile = new File([audioBlob], "audio.webm", { type: "audio/webm" });

            const response = await client.speechToText.convert({
                file: audioFile,
                model_id: "scribe_v1",
            });

            return response.text;
        } catch (error) {
            console.error("ElevenLabs Transcription Error:", error);
            throw error;
        }
    }
};
