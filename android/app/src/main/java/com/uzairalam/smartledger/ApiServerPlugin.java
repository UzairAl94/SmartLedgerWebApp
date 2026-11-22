package com.uzairalam.smartledger;

import android.app.Activity;
import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import fi.iki.elonen.NanoHTTPD;

/**
 * Local HTTP server for the Smart Ledger API and the phone-hosted web UI.
 *
 * The server itself is intentionally dumb: /api/* requests are forwarded to the
 * WebView (where the TypeScript router calls the real services), while everything
 * else is served from the bundled web assets. This keeps SQLite/balance logic in
 * one place.
 */
@CapacitorPlugin(name = "ApiServer")
public class ApiServerPlugin extends Plugin {
    private static final String TAG = "SmartLedgerApiServer";
    private static final long REQUEST_TIMEOUT_SECONDS = 120;
    private static final long WAKE_LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000L;
    private static final int MAX_BODY_BYTES = 5 * 1024 * 1024;

    private NanoHTTPD server;
    private String token = "";
    private int port = 8765;
    private boolean allowLan = true;
    private int requestCount = 0;
    private PowerManager.WakeLock wakeLock;

    private final Map<String, CompletableFuture<NanoHTTPD.Response>> pending = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        Integer requestedPort = call.getInt("port", 8765);
        String requestedToken = call.getString("token", "");
        Boolean requestedLan = call.getBoolean("allowLan", true);

        if (requestedPort == null || requestedPort < 1024 || requestedPort > 65535) {
            call.reject("Port must be between 1024 and 65535.");
            return;
        }
        if (requestedToken == null || requestedToken.trim().isEmpty()) {
            call.reject("An access token is required.");
            return;
        }

        stopServerInternal();

        this.port = requestedPort;
        this.token = requestedToken.trim();
        this.allowLan = requestedLan == null || requestedLan;
        final String host = this.allowLan ? "0.0.0.0" : "127.0.0.1";

        try {
            server = new NanoHTTPD(host, this.port) {
                @Override
                public Response serve(IHTTPSession session) {
                    return handleRequest(session);
                }
            };
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            acquireWakeLock();
            call.resolve(status());
        } catch (Exception error) {
            Log.e(TAG, "Failed to start API server", error);
            server = null;
            releaseWakeLock();
            call.reject("Could not start the server: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServerInternal();
        call.resolve();
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String requestId = call.getString("requestId");
        Integer status = call.getInt("status", 200);
        String body = call.getString("body", "{}");
        String contentType = call.getString("contentType", "application/json");

        if (requestId == null) {
            call.reject("requestId is required");
            return;
        }

        CompletableFuture<NanoHTTPD.Response> future = pending.get(requestId);
        if (future == null) {
            call.reject("Unknown or expired requestId");
            return;
        }

        NanoHTTPD.Response response = NanoHTTPD.newFixedLengthResponse(
            statusFor(status == null ? 200 : status),
            contentType == null ? "application/json" : contentType,
            body == null ? "" : body
        );
        future.complete(response);
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @Override
    protected void handleOnDestroy() {
        stopServerInternal();
    }

    private NanoHTTPD.Response handleRequest(NanoHTTPD.IHTTPSession session) {
        if (NanoHTTPD.Method.OPTIONS.equals(session.getMethod())) {
            return withCors(NanoHTTPD.newFixedLengthResponse(
                NanoHTTPD.Response.Status.NO_CONTENT, "text/plain", ""
            ));
        }

        String uri = session.getUri();
        boolean isApiRequest = uri.equals("/api") || uri.startsWith("/api/");
        if (!isApiRequest) {
            return serveStatic(uri);
        }

        if (!isAuthorized(session)) {
            return withCors(jsonError(401, "Unauthorized"));
        }

        String body = "";
        try {
            Map<String, String> files = new HashMap<>();
            session.parseBody(files);
            body = files.get("postData");
            if (body == null) body = "";
            if (body.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
                return withCors(jsonError(413, "Request body too large"));
            }
        } catch (Exception error) {
            Log.w(TAG, "Could not read request body", error);
            return withCors(jsonError(400, "Could not read request body"));
        }

        Activity activity = getActivity();
        if (activity == null) {
            return withCors(jsonError(503, "App is not available"));
        }

        String requestId = UUID.randomUUID().toString();
        CompletableFuture<NanoHTTPD.Response> future = new CompletableFuture<>();
        pending.put(requestId, future);
        requestCount++;

        String query = session.getQueryParameterString();
        String url = uri + (query != null && !query.isEmpty() ? "?" + query : "");

        JSObject payload = new JSObject();
        payload.put("requestId", requestId);
        payload.put("method", session.getMethod().name());
        payload.put("url", url);
        payload.put("body", body);

        JSObject headers = new JSObject();
        for (Map.Entry<String, String> header : session.getHeaders().entrySet()) {
            headers.put(header.getKey(), header.getValue());
        }
        payload.put("headers", headers);

        activity.runOnUiThread(() -> notifyListeners("request", payload));

        try {
            return withCors(future.get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        } catch (TimeoutException timeout) {
            return withCors(jsonError(504, "Timed out waiting for the app to respond"));
        } catch (Exception error) {
            return withCors(jsonError(503, "Server is stopping"));
        } finally {
            pending.remove(requestId);
        }
    }

    private void stopServerInternal() {
        if (server != null) {
            try {
                server.stop();
            } catch (Exception error) {
                Log.w(TAG, "Error stopping server", error);
            }
            server = null;
        }

        for (CompletableFuture<NanoHTTPD.Response> future : pending.values()) {
            future.complete(jsonError(503, "Server stopped"));
        }
        pending.clear();
        releaseWakeLock();
    }

    private boolean isAuthorized(NanoHTTPD.IHTTPSession session) {
        String header = session.getHeaders().get("authorization");
        if (header == null || header.isEmpty()) {
            header = session.getHeaders().get("x-api-token");
        }
        if (header == null || header.isEmpty()) return false;

        String expected = "Bearer " + token;
        return constantTimeEquals(header, expected) || constantTimeEquals(header, token);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(
            a.getBytes(StandardCharsets.UTF_8),
            b.getBytes(StandardCharsets.UTF_8)
        );
    }

    private NanoHTTPD.Response serveStatic(String uri) {
        String path = uri.equals("/") ? "index.html" : uri.substring(1);
        if (path.contains("..")) {
            return withCors(jsonError(400, "Bad path"));
        }

        // SPA fallback: extensionless routes render the app shell.
        if (!path.contains(".")) path = "index.html";

        if ("index.html".equals(path)) {
            try (InputStream input = getContext().getAssets().open("public/index.html")) {
                String html = injectRemoteBootstrap(readAll(input));
                NanoHTTPD.Response response = NanoHTTPD.newFixedLengthResponse(
                    NanoHTTPD.Response.Status.OK, "text/html; charset=utf-8", html
                );
                response.addHeader("Cache-Control", "no-cache");
                return withCors(response);
            } catch (Exception error) {
                Log.w(TAG, "Web bundle missing", error);
                return withCors(jsonError(404, "UI bundle not found. Run npm run build && npx cap sync android."));
            }
        }

        try {
            InputStream input = getContext().getAssets().open("public/" + path);
            NanoHTTPD.Response response = NanoHTTPD.newChunkedResponse(
                NanoHTTPD.Response.Status.OK, mimeType(path), input
            );
            if (path.startsWith("assets/")) {
                response.addHeader("Cache-Control", "public, max-age=31536000, immutable");
            } else {
                response.addHeader("Cache-Control", "no-cache");
            }
            return withCors(response);
        } catch (Exception error) {
            return withCors(jsonError(404, "Not found"));
        }
    }

    private String injectRemoteBootstrap(String html) {
        String script = "<script>window.__SMARTLEDGER_REMOTE__={baseUrl:\"\",tokenRequired:true};</script>";
        int headEnd = html.indexOf("</head>");
        if (headEnd >= 0) {
            return html.substring(0, headEnd) + script + html.substring(headEnd);
        }
        return script + html;
    }

    private String readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private String mimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    private NanoHTTPD.Response withCors(NanoHTTPD.Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
        response.addHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Api-Token");
        response.addHeader("Access-Control-Max-Age", "86400");
        return response;
    }

    private NanoHTTPD.Response jsonError(int status, String message) {
        JSONObject body = new JSONObject();
        try {
            JSONObject error = new JSONObject();
            error.put("message", message);
            body.put("error", error);
        } catch (Exception ignored) {
            // Only string values are inserted here, so this cannot realistically fail.
        }
        return NanoHTTPD.newFixedLengthResponse(statusFor(status), "application/json", body.toString());
    }

    private NanoHTTPD.Response.IStatus statusFor(int code) {
        NanoHTTPD.Response.Status known = NanoHTTPD.Response.Status.lookup(code);
        if (known != null) return known;
        final int statusCode = code;
        return new NanoHTTPD.Response.IStatus() {
            @Override
            public String getDescription() {
                return "Status " + statusCode;
            }

            @Override
            public int getRequestStatus() {
                return statusCode;
            }
        };
    }

    private JSObject status() {
        JSObject result = new JSObject();
        result.put("running", server != null && server.isAlive());
        result.put("port", port);
        result.put("host", allowLan ? "0.0.0.0" : "127.0.0.1");
        result.put("allowLan", allowLan);
        result.put("requestCount", requestCount);
        result.put("addresses", localAddresses());
        return result;
    }

    private JSArray localAddresses() {
        JSArray addresses = new JSArray();
        try {
            if (!allowLan) {
                addresses.put("127.0.0.1");
                return addresses;
            }
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (InetAddress address : Collections.list(network.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) {
                        addresses.put(address.getHostAddress());
                    }
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "Could not enumerate network addresses", error);
        }
        return addresses;
    }

    private void acquireWakeLock() {
        if (wakeLock != null) return;
        try {
            PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SmartLedger:ApiServer");
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } catch (Exception error) {
            Log.w(TAG, "Could not acquire wake lock", error);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception error) {
            Log.w(TAG, "Could not release wake lock", error);
        }
        wakeLock = null;
    }
}
