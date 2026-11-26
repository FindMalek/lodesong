import UIKit

/// An alert over whatever is on screen, the player included, which a view modifier on a tab can't reach.
@MainActor
enum Popup {
    static func show(_ title: String, message: String? = nil, action: String? = nil, perform: @escaping () -> Void = {}) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: action == nil ? "OK" : "Cancel", style: .cancel))
        if let action { alert.addAction(UIAlertAction(title: action, style: .default) { _ in perform() }) }
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        var top = window?.rootViewController
        while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
        top?.present(alert, animated: true)
    }
}
