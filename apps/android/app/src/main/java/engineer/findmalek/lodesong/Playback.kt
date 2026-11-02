package engineer.findmalek.lodesong

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.webkit.WebView
import org.json.JSONObject
import java.lang.ref.WeakReference

/** What the page last reported through the `keep` bridge (apps/player/src/lib/native.ts). */
class NowPlaying(
    val title: String?,
    val artist: String,
    val album: String,
    val cover: Bitmap?,
    val playing: Boolean,
    private val position: Double,
    private val at: Long,
    val duration: Double,
) {
    /** The playhead in ms, moved on from when the page reported it. */
    fun positionMs(): Long {
        val elapsed = if (playing) System.currentTimeMillis() - at else 0
        return (position * 1000).toLong() + elapsed
    }

    companion object {
        fun parse(json: JSONObject): NowPlaying = NowPlaying(
            title = json.optString("title").takeIf { it.isNotEmpty() && it != "null" },
            artist = json.optString("artist"),
            album = json.optString("album"),
            cover = decode(json.optString("cover")),
            playing = json.optBoolean("playing"),
            position = json.optDouble("position", 0.0),
            at = json.optLong("at", System.currentTimeMillis()),
            duration = json.optDouble("duration", 0.0),
        )

        private fun decode(dataUrl: String): Bitmap? {
            val comma = dataUrl.indexOf(',')
            if (!dataUrl.startsWith("data:") || comma < 0) return null
            return runCatching {
                val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }.getOrNull()
        }
    }
}

/** Shared by the activity (which owns the web view) and the service (notification and lock screen controls). */
object Playback {
    var now: NowPlaying? = null
        private set

    var onChange: (() -> Unit)? = null
    private var web: WeakReference<WebView>? = null

    fun attach(view: WebView) {
        web = WeakReference(view)
    }

    fun detach() {
        web = null
        now = null
        onChange?.invoke()
    }

    fun update(next: NowPlaying) {
        now = next
        onChange?.invoke()
    }

    /** Runs a call on the page's `keepNative` object: toggle, next, previous, or seek(seconds). */
    fun command(call: String) {
        val view = web?.get() ?: return
        view.post { view.evaluateJavascript("window.keepNative && window.keepNative.$call", null) }
    }

    fun seek(positionMs: Long) = command("seek(${positionMs / 1000.0})")
}
