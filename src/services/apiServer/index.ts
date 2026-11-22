import { Capacitor } from '@capacitor/core';
import { ApiServer } from './plugin';
import { routeRequest } from './router';
import { ApiError } from './validate';
import { addLogEntry, getLogEntries } from './log';
import { secretsService, SECRET_KEYS } from '../secretsService';
import { settingsService } from '../settingsService';
import type { ApiRequest, ApiServerState, ApiServerStatus } from './types';

const DEFAULT_STATUS: ApiServerStatus = {
    running: false,
    port: 8765,
    host: '0.0.0.0',
    allowLan: true,
    requestCount: 0,
    addresses: [],
};

let status: ApiServerStatus = { ...DEFAULT_STATUS };
let error: string | null = null;
let listeners: Array<(state: ApiServerState) => void> = [];
let initPromise: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();

const isAvailable = (): boolean => Capacitor.getPlatform() !== 'web';

const snapshot = (): ApiServerState => ({
    ...status,
    available: isAvailable(),
    error,
    log: getLogEntries(),
});

const notify = (): void => {
    const state = snapshot();
    for (const listener of listeners) {
        try {
            listener(state);
        } catch (caught) {
            console.error('API server listener failed:', caught);
        }
    }
};

export const generateToken = (): string => {
    const bytes = new Uint8Array(32);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const ensureToken = async (): Promise<string> => {
    const existing = await secretsService.getKey(SECRET_KEYS.apiToken);
    if (existing) return existing;
    const token = generateToken();
    await secretsService.setKey(SECRET_KEYS.apiToken, token);
    return token;
};

const pathOf = (url: string): string => {
    try {
        return new URL(url, 'http://local').pathname;
    } catch {
        return url;
    }
};

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task, task).catch(caught => {
        console.error('API queue task failed:', caught);
    });
    return queue;
};

const handleRequest = async (request: ApiRequest): Promise<void> => {
    const started = now();
    let statusCode = 500;
    let body: unknown = { error: { message: 'Internal server error' } };

    try {
        const result = await routeRequest(request.method, request.url, request.body);
        statusCode = result.status;
        body = result.body;
    } catch (caught) {
        if (caught instanceof ApiError) {
            statusCode = caught.status;
            body = { error: { message: caught.message, details: caught.details } };
        } else {
            console.error('API request failed:', caught);
            body = {
                error: {
                    message: caught instanceof Error ? caught.message : 'Internal server error',
                },
            };
        }
    }

    addLogEntry({
        at: new Date().toISOString(),
        method: request.method,
        path: pathOf(request.url),
        status: statusCode,
        ms: Math.round((now() - started) * 10) / 10,
    });

    if (status.running) {
        status = { ...status, requestCount: status.requestCount + 1 };
    }

    try {
        await ApiServer.respond({
            requestId: request.requestId,
            status: statusCode,
            body: JSON.stringify(body),
        });
    } catch (caught) {
        console.error('Failed to send API response:', caught);
    }

    notify();
};

const doInit = async (): Promise<void> => {
    try {
        await ApiServer.addListener('request', request => {
            void enqueue(() => handleRequest(request));
        });
    } catch (caught) {
        console.error('Failed to register API request listener:', caught);
    }

    try {
        status = await ApiServer.getStatus();
    } catch {
        // Web stub or plugin unavailable; keep defaults.
    }
    notify();
};

export const init = (): Promise<void> => {
    if (!initPromise) initPromise = doInit();
    return initPromise;
};

export const start = async (
    options: { port?: number; allowLan?: boolean } = {}
): Promise<ApiServerState> => {
    if (!isAvailable()) {
        throw new Error('The local API server is only available in the Android app.');
    }

    const settings = await settingsService.getSettings();
    const port = options.port ?? settings.apiServerPort;
    const allowLan = options.allowLan ?? settings.apiServerAllowLan;
    const token = await ensureToken();

    await init();
    error = null;
    notify();

    try {
        status = await ApiServer.start({ port, token, allowLan });
        notify();
        return snapshot();
    } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        notify();
        throw caught;
    }
};

export const stop = async (): Promise<void> => {
    try {
        await ApiServer.stop();
    } catch (caught) {
        console.error('Failed to stop API server:', caught);
    }
    status = { ...status, running: false, requestCount: 0 };
    notify();
};

export const refreshStatus = async (): Promise<ApiServerState> => {
    try {
        status = await ApiServer.getStatus();
    } catch {
        // Ignore; keep the last known state.
    }
    notify();
    return snapshot();
};

export const getToken = (): Promise<string | null> => secretsService.getKey(SECRET_KEYS.apiToken);

export const regenerateToken = async (): Promise<string> => {
    const token = generateToken();
    await secretsService.setKey(SECRET_KEYS.apiToken, token);

    if (status.running) {
        await stop();
        await start();
    } else {
        notify();
    }
    return token;
};

export const getState = (): ApiServerState => snapshot();

export const subscribe = (listener: (state: ApiServerState) => void): (() => void) => {
    listeners.push(listener);
    listener(snapshot());
    return () => {
        listeners = listeners.filter(item => item !== listener);
    };
};

export const apiServer = {
    init,
    start,
    stop,
    refreshStatus,
    getToken,
    regenerateToken,
    generateToken,
    getState,
    subscribe,
    isAvailable,
};

export type { ApiServerState };
