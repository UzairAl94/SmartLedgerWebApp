import { useState, useRef, useEffect } from 'react';
import { elevenLabsService } from '../services/elevenLabsService';
import { settingsService } from '../services/settingsService';

interface UseVoiceInputResult {
    isRecording: boolean;
    isProcessing: boolean;
    transcript: string | null;
    startRecording: () => void;
    stopRecording: () => void;
    cancelRecording: () => void;
    reset: () => void;
    error: string | null;
}

export const useVoiceInput = (onResult?: (text: string) => void): UseVoiceInputResult => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [apiKey, setApiKey] = useState<string>('');

    // Fetch API Key
    useEffect(() => {
        settingsService.getSettings().then(s => setApiKey(s.elevenLabsApiKey || ''));
        // Subscribe for changes if user adds it while on the page
        const unsub = settingsService.subscribeToSettings(s => {
            setApiKey(s.elevenLabsApiKey || '');
        });
        return unsub;
    }, []);

    const startRecording = async () => {
        setError(null);
        setTranscript(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Prefer webm/opus for good compression
            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4'; // Fallback for Safari if needed

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(chunksRef.current, { type: mimeType });

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());

                if (!apiKey) {
                    setError("No API Key configured. Please add your ElevenLabs API Key in Settings.");
                    setIsRecording(false);
                    return;
                }

                setIsProcessing(true);
                try {
                    const text = await elevenLabsService.transcribeAudio(audioBlob, apiKey);
                    setTranscript(text);
                    if (onResult) onResult(text);
                } catch (err) {
                    console.error("Transcription failed", err);
                    setError("Failed to transcribe audio. Please check your API Key and try again.");
                } finally {
                    setIsProcessing(false);
                    setIsRecording(false);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            let msg = "Could not access microphone.";
            if (err instanceof Error) {
                if (err.name === 'NotAllowedError') msg = "Microphone permission denied. Please enable it in Android Settings.";
                else if (err.name === 'NotFoundError') msg = "No microphone found on this device.";
                else msg = `Microphone error: ${err.message}`;
            }
            setError(msg);
            setIsRecording(false);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            // Stop but don't process
            mediaRecorderRef.current.onstop = null; // Remove handler
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setIsRecording(false);
            setTranscript(null);
        }
    };

    const reset = () => {
        setTranscript(null);
        setError(null);
    };

    return {
        isRecording,
        isProcessing,
        transcript,
        startRecording,
        stopRecording,
        cancelRecording,
        reset,
        error
    };
};
