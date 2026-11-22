import { ApiError } from './validate';
import * as handlers from './handlers';
import type { Handler, HandlerContext, HandlerResult } from './handlers';

interface Route {
    method: string;
    pattern: RegExp;
    keys: string[];
    handler: Handler;
}

const routes: Route[] = [];

const add = (method: string, path: string, handler: Handler): void => {
    const keys: string[] = [];
    const source = path.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
        keys.push(key);
        return '([^/]+)';
    });
    routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler });
};

add('GET', '/api', handlers.endpointCatalog);

add('GET', '/api/health', handlers.health);
add('GET', '/api/version', handlers.version);
add('GET', '/api/logs', handlers.logs);

add('GET', '/api/accounts', handlers.listAccounts);
add('POST', '/api/accounts', handlers.createAccount);
add('PATCH', '/api/accounts/:id', handlers.updateAccount);
add('DELETE', '/api/accounts/:id', handlers.deleteAccount);

add('GET', '/api/categories', handlers.listCategories);
add('POST', '/api/categories', handlers.createCategory);
add('DELETE', '/api/categories/:id', handlers.deleteCategory);

add('GET', '/api/transactions', handlers.listTransactions);
add('POST', '/api/transactions', handlers.createTransaction);
add('GET', '/api/transactions/:id', handlers.getTransaction);
add('PATCH', '/api/transactions/:id', handlers.updateTransaction);
add('DELETE', '/api/transactions/:id', handlers.deleteTransaction);

add('POST', '/api/import/transactions', handlers.importTransactions);
add('GET', '/api/imports', handlers.listImports);
add('DELETE', '/api/imports/:batchId', handlers.undoImport);

add('GET', '/api/budgets', handlers.listBudgets);
add('POST', '/api/budgets', handlers.createBudget);
add('PATCH', '/api/budgets/:id', handlers.updateBudget);
add('DELETE', '/api/budgets/:id', handlers.deleteBudget);

add('GET', '/api/recurring', handlers.listRecurring);
add('POST', '/api/recurring', handlers.createRecurring);
add('PATCH', '/api/recurring/:id', handlers.updateRecurring);
add('DELETE', '/api/recurring/:id', handlers.deleteRecurring);

add('GET', '/api/settings', handlers.getSettings);
add('PATCH', '/api/settings', handlers.updateSettings);

add('GET', '/api/summary', handlers.summary);
add('GET', '/api/balances', handlers.balances);
add('GET', '/api/export', handlers.exportData);

export const routeRequest = async (
    method: string,
    url: string,
    rawBody: string
): Promise<HandlerResult> => {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, 'http://local');
    } catch {
        throw new ApiError(400, 'Invalid request URL.');
    }

    const path = parsedUrl.pathname;
    const pathMatches = routes.filter(route => route.pattern.test(path));
    const route = pathMatches.find(candidate => candidate.method === method.toUpperCase());

    if (!route) {
        if (pathMatches.length > 0) {
            throw new ApiError(405, `Method ${method} is not allowed for ${path}.`, {
                allowed: pathMatches.map(candidate => candidate.method),
            });
        }
        throw new ApiError(404, `No route for ${method} ${path}.`);
    }

    const match = route.pattern.exec(path);
    if (!match) {
        throw new ApiError(404, `No route for ${method} ${path}.`);
    }

    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
        const raw = match[index + 1];
        try {
            params[key] = decodeURIComponent(raw);
        } catch {
            params[key] = raw;
        }
    });

    let body: Record<string, unknown> = {};
    if (rawBody && rawBody.trim()) {
        let parsedBody: unknown;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            throw new ApiError(400, 'Request body must be valid JSON.');
        }
        if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
            throw new ApiError(400, 'Request body must be a JSON object.');
        }
        body = parsedBody as Record<string, unknown>;
    }

    const context: HandlerContext = {
        params,
        query: parsedUrl.searchParams,
        body,
    };

    return route.handler(context);
};
