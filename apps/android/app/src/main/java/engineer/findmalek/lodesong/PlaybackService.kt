package engineer.findmalek.lodesong

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.IBinder
import android.os.PowerManager

/**
 * A foreground service of type media playback: it keeps the process (and so the web view and its audio) alive with the
 * screen off, and puts the song on the lock screen and in the notification shade through a media session. The buttons
 * call the page's own `keepNative` controls.
 */
class PlaybackService : Service() {
    private lateinit var session: MediaSession
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW))
        session = MediaSession(this, "lodesong").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    if (Playback.now?.playing != true) Playback.command("toggle()")
                }

                override fun onPause() {
                    if (Playback.now?.playing == true) Playback.command("toggle()")
                }

                override fun onSkipToNext() = Playback.command("next()")
                override fun onSkipToPrevious() = Playback.command("previous()")
                override fun onSeekTo(pos: Long) = Playback.seek(pos)
            })
            isActive = true
        }
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lodesong:playback")
        Playback.onChange = ::refresh
        startForeground(NOTIFICATION, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        refresh()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE -> Playback.command("toggle()")
            ACTION_NEXT -> Playback.command("next()")
            ACTION_PREVIOUS -> Playback.command("previous()")
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Playback.onChange = null
        if (wakeLock?.isHeld == true) wakeLock?.release()
        session.release()
        super.onDestroy()
    }

    private fun refresh() {
        val now = Playback.now
        val playing = now?.playing == true
        if (playing && wakeLock?.isHeld == false) wakeLock?.acquire()
        if (!playing && wakeLock?.isHeld == true) wakeLock?.release()
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, now?.title ?: "lodesong")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, now?.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, now?.album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, ((now?.duration ?: 0.0) * 1000).toLong())
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, now?.cover)
                .build(),
        )
        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_SEEK_TO,
                )
                .setState(
                    if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    now?.positionMs() ?: 0,
                    if (playing) 1f else 0f,
                )
                .build(),
        )
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION, build())
    }

    private fun build(): Notification {
        val now = Playback.now
        val playing = now?.playing == true
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(now?.title ?: "lodesong")
            .setContentText(now?.artist)
            .setLargeIcon(now?.cover)
            .setContentIntent(open)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(action(R.drawable.ic_previous, "previous", ACTION_PREVIOUS))
            .addAction(action(if (playing) R.drawable.ic_pause else R.drawable.ic_play, if (playing) "pause" else "play", ACTION_TOGGLE))
            .addAction(action(R.drawable.ic_next, "next", ACTION_NEXT))
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    private fun action(icon: Int, label: String, name: String): Notification.Action {
        val intent = PendingIntent.getService(this, 0, Intent(this, PlaybackService::class.java).setAction(name), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Action.Builder(Icon.createWithResource(this, icon), label, intent).build()
    }

    companion object {
        private const val CHANNEL = "playback"
        private const val NOTIFICATION = 1
        private const val ACTION_TOGGLE = "engineer.findmalek.lodesong.TOGGLE"
        private const val ACTION_NEXT = "engineer.findmalek.lodesong.NEXT"
        private const val ACTION_PREVIOUS = "engineer.findmalek.lodesong.PREVIOUS"

        fun start(context: Context) {
            context.startForegroundService(Intent(context, PlaybackService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PlaybackService::class.java))
        }
    }
}
