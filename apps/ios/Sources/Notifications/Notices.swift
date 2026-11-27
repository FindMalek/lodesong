import AppIntents
import UserNotifications

/// Every local notification the app posts. Without permission the system drops them, so callers don't check.
enum Notices {
    private static let center = UNUserNotificationCenter.current()
    private static let presenter = Presenter()
    private static let warningIDs = ["expiry-2", "expiry-1"]

    static let profile: SigningProfile? = {
        var url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision")
        #if DEBUG
        // A simulator build isn't signed: point this at a profile to see the signing rows.
        if let path = ProcessInfo.processInfo.environment["LODESONG_PROFILE"] { url = URL(fileURLWithPath: path) }
        #endif
        return url.flatMap { try? Data(contentsOf: $0) }.flatMap(SigningProfile.init)
    }()

    static var expiry: Date? {
        let refreshed = UserDefaults.standard.double(forKey: Pref.signingRefreshed)
        return profile?.expiry(refreshed: refreshed > 0 ? Date(timeIntervalSince1970: refreshed) : nil)
    }

    static func start() { center.delegate = presenter }

    static func status() async -> UNAuthorizationStatus { await center.notificationSettings().authorizationStatus }

    /// Shows the system's question the first time only.
    static func askPermission() async {
        guard await status() == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound])
        scheduleExpiryWarnings()
    }

    /// Replaces whatever was scheduled, so it is safe to call on every launch.
    static func scheduleExpiryWarnings() {
        center.removePendingNotificationRequests(withIdentifiers: warningIDs)
        guard let expiry else { return }
        for warning in SigningProfile.warnings(expiry: expiry, now: Date()) {
            let content = UNMutableNotificationContent()
            content.title = warning.days == 1 ? "lodesong expires tomorrow" : "lodesong expires in \(warning.days) days"
            content.body = "Refresh it in SideStore. Already did? Tap I Refreshed Today in Settings, About."
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: warning.date.timeIntervalSinceNow, repeats: false)
            center.add(UNNotificationRequest(identifier: "expiry-\(warning.days)", content: content, trigger: trigger))
        }
    }

    static func markRefreshed() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Pref.signingRefreshed)
        center.removeDeliveredNotifications(withIdentifiers: warningIDs)
        scheduleExpiryWarnings()
    }

    static func post(_ found: [NewTracks]) {
        guard UserDefaults.standard.bool(Pref.notifyNewTracks, or: true) else { return }
        for new in found {
            let content = UNMutableNotificationContent()
            content.title = new.name
            content.body = new.count == 1 ? "1 new track" : "\(new.count) new tracks"
            content.sound = .default
            center.add(UNNotificationRequest(identifier: "new-\(new.playlist)", content: content, trigger: nil))
        }
    }

    /// iOS stays silent about an app that is on screen unless it is asked not to.
    private final class Presenter: NSObject, UNUserNotificationCenterDelegate {
        func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
            [.banner, .list, .sound]
        }
    }
}

/// For the daily refresh shortcut, right after SideStore's Refresh All Apps.
struct MarkRefreshedIntent: AppIntent {
    static let title: LocalizedStringResource = "Mark lodesong as Refreshed"
    static let description = IntentDescription("Run after SideStore refreshes lodesong, so its expiry warnings move on.")

    func perform() async throws -> some IntentResult {
        Notices.markRefreshed()
        return .result()
    }
}
