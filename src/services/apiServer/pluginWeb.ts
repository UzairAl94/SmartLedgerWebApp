import type { ApiServerStatus } from './types';

const unavailable = () => new Error('The local API server is only available in the Android app.');

export class ApiServerWeb {
    async start(): Promise<ApiServerStatus> {
        throw unavailable();
    }

    async stop(): Promise<void> {
        // Nothing to stop in the browser.
    }

    async respond(): Promise<void> {
        // No server is running.
    }

    async getStatus(): Promise<ApiServerStatus> {
        return {
            running: false,
            port: 8765,
            host: '127.0.0.1',
            allowLan: false,
            requestCount: 0,
            addresses: [],
        };
    }

    async addListener() {
        return { remove: async () => { /* no-op */ } };
    }
}
