package com.uzairalam.smartledger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Keeps the process (and therefore the local HTTP server + WebView bridge)
 * alive while the app is in the background. The HTTP server itself lives in
 * ApiServerPlugin; this service only raises the process priority and shows the
 * required ongoing notification.
 */
public class ApiServerService extends Service {
    private static final String CHANNEL_ID = "smartledger_api_server";
    private static final int NOTIFICATION_ID = 8765;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Smart Ledger API is running")
            .setContentText("Listening on your local network. Stop it from Settings → Local API.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        startForeground(NOTIFICATION_ID, notification);
        // The HTTP server lives in the WebView-backed plugin. If the process is
        // killed, restarting this service alone would show a notification for a
        // server that no longer exists, so don't ask Android to recreate it.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Local API server",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps the Smart Ledger local API running in the background.");
        manager.createNotificationChannel(channel);
    }
}
