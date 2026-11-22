export interface ApiRequest {
    requestId: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
}

export interface ApiResponsePayload {
    requestId: string;
    status: number;
    body: string;
    contentType?: string;
}

export interface ApiServerStatus {
    running: boolean;
    port: number;
    host: string;
    allowLan: boolean;
    requestCount: number;
    addresses: string[];
}

export interface ApiLogEntry {
    at: string;
    method: string;
    path: string;
    status: number;
    ms: number;
}

export interface ApiServerState extends ApiServerStatus {
    available: boolean;
    error: string | null;
    log: ApiLogEntry[];
}
