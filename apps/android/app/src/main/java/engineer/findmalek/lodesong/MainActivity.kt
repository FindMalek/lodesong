package engineer.findmalek.lodesong

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * lodesong in a web view. The page reports to `webkit.messageHandlers.keep` (what the Mac and iPhone apps listen to);
 * a script injected before the page runs maps that onto [Bridge], which feeds the foreground service.
 */
class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private var web: WebView? = null
    private var failure: View? = null
    private var server: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply { setBackgroundColor(BACKGROUND) }
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val saved = Server.load(this)
        if (saved == null) showSetup() else showPlayer(saved)
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    // The web view is deliberately never paused: pausing it would stop the audio with the screen off.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val view = web
        when {
            view != null && view.canGoBack() -> view.goBack()
            view != null -> moveTaskToBack(true)
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (isFinishing) {
            PlaybackService.stop(this)
            Playback.detach()
            web?.destroy()
        }
        super.onDestroy()
    }

    private fun showSetup() {
        clear()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        column.addView(label("lodesong", 18f, Typeface.MONOSPACE))
        column.addView(label("where is your lodesong?", 30f, Typeface.DEFAULT, top = 16))
        column.addView(
            label(
                "The address you open it at in a browser, like https://music.example.com. On your home network it can be an IP and port.",
                15f, Typeface.DEFAULT, top = 8, color = MUTED,
            ),
        )
        val input = EditText(this).apply {
            hint = "https://music.example.com"
            setTextColor(Color.WHITE)
            setHintTextColor(MUTED)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setSingleLine()
        }
        val error = label("That doesn't look like an address.", 13f, Typeface.DEFAULT, top = 4, color = Color.RED).apply {
            visibility = View.GONE
        }
        val connect = {
            val address = Server.normalize(input.text.toString())
            if (address == null) {
                error.visibility = View.VISIBLE
            } else {
                Server.save(this, address)
                showPlayer(address)
            }
        }
        input.setOnEditorActionListener { _, _, _ -> connect().let { true } }
        column.addView(input, matchWidth(top = 16))
        column.addView(error)
        column.addView(Button(this).apply { text = "connect"; setOnClickListener { connect() } }, matchWidth(top = 16))
        root.addView(column, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }

    private fun showPlayer(address: String) {
        clear()
        server = address
        val view = WebView(this)
        view.setBackgroundColor(BACKGROUND)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "$userAgentString lodesong-android"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        view.addJavascriptInterface(Bridge(), "LodesongAndroid")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(view, SHIM, setOf("*"))
        }
        view.webViewClient = Client(Uri.parse(address).host)
        Playback.attach(view)
        web = view
        root.addView(view, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        view.loadUrl(address)
    }

    private fun showFailure(message: String) {
        hideFailure()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BACKGROUND)
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        column.addView(label("Can't reach your lodesong", 22f, Typeface.DEFAULT))
        column.addView(label(message, 14f, Typeface.DEFAULT, top = 8, color = MUTED))
        column.addView(Button(this).apply { text = "try again"; setOnClickListener { reload() } }, matchWidth(top = 16))
        column.addView(Button(this).apply { text = "change server"; setOnClickListener { changeServer() } }, matchWidth(top = 8))
        failure = column
        root.addView(column, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }

    private fun hideFailure() {
        failure?.let { root.removeView(it) }
        failure = null
    }

    private fun reload() {
        hideFailure()
        val view = web ?: return
        if (view.url == null) view.loadUrl(server ?: return) else view.reload()
    }

    private fun changeServer() {
        PlaybackService.stop(this)
        Playback.detach()
        Server.save(this, null)
        showSetup()
    }

    private fun showMenu() {
        AlertDialog.Builder(this)
            .setItems(arrayOf("reload", "change server")) { _, which -> if (which == 0) reload() else changeServer() }
            .show()
    }

    private fun clear() {
        hideFailure()
        root.removeAllViews()
        web?.destroy()
        web = null
    }

    private fun label(text: String, size: Float, face: Typeface, top: Int = 0, color: Int = Color.WHITE) =
        TextView(this).apply {
            this.text = text
            textSize = size
            typeface = face
            setTextColor(color)
            layoutParams = matchWidth(top)
        }

    private fun matchWidth(top: Int) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    /** Links to other sites open in the browser; the page's own stay in the app. */
    private inner class Client(private val host: String?) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == host) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
            return true
        }

        private var failed = false

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            failed = false
        }

        // onPageFinished also fires after an error; the failure screen stays until the next try.
        override fun onPageFinished(view: WebView, url: String?) {
            if (!failed) hideFailure()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            failed = true
            showFailure(error.description.toString())
        }
    }

    private inner class Bridge {
        @JavascriptInterface
        fun post(json: String) {
            val body = runCatching { JSONObject(json) }.getOrNull() ?: return
            runOnUiThread {
                when {
                    body.has("preview") -> showMenu()
                    body.has("playing") -> {
                        val now = NowPlaying.parse(body)
                        val wasPlaying = Playback.now?.playing == true
                        Playback.update(now)
                        if (now.playing && !wasPlaying) runCatching { PlaybackService.start(this@MainActivity) }
                    }
                }
            }
        }
    }

    private companion object {
        const val BACKGROUND = 0xFF111111.toInt()
        const val MUTED = 0xFF9A9A9A.toInt()
        const val SHIM = "(function(){if(window.webkit&&window.webkit.messageHandlers)return;" +
            "window.webkit={messageHandlers:{keep:{postMessage:function(m){LodesongAndroid.post(JSON.stringify(m));}}}};})();"
    }
}
