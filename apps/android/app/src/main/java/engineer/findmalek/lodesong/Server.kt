package engineer.findmalek.lodesong

import android.content.Context
import android.net.Uri

/** Which lodesong to open, remembered on this phone. */
object Server {
    private const val KEY = "server"

    fun load(context: Context): String? =
        context.getSharedPreferences("lodesong", Context.MODE_PRIVATE).getString(KEY, null)

    fun save(context: Context, address: String?) {
        context.getSharedPreferences("lodesong", Context.MODE_PRIVATE).edit().putString(KEY, address).apply()
    }

    /** "music.example.com" becomes https; an address on your own network (an IP, a port, `.local`) stays http. */
    fun normalize(raw: String): String? {
        var text = raw.trim()
        if (text.isEmpty()) return null
        if (!text.contains("://")) {
            val local = text.endsWith(".local") || text.contains(":") || Regex("^\\d{1,3}(\\.\\d{1,3}){3}").containsMatchIn(text)
            text = (if (local) "http://" else "https://") + text
        }
        text = text.trimEnd('/')
        val uri = Uri.parse(text)
        val scheme = uri.scheme
        if (uri.host.isNullOrEmpty() || (scheme != "http" && scheme != "https")) return null
        return text
    }
}
