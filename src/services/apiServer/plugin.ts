import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ApiRequest, ApiResponsePayload, ApiServerStatus } from './types';

export interface ApiServerPlugin {
    start(options: { port: number; token: string; allowLan: boolean }): Promise<ApiServerStatus>;
    stop(): Promise<void>;
    respond(options: ApiResponsePayload): Promise<void>;
    getStatus(): Promise<ApiServerStatus>;
    addListener(
        eventName: 'request',
        listener: (request: ApiRequest) => void
    ): Promise<PluginListenerHandle>;
}

export const ApiServer = registerPlugin<ApiServerPlugin>('ApiServer', {
    web: () => import('./pluginWeb').then(module => new module.ApiServerWeb()),
});
