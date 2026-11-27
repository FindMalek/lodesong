import SwiftUI
import UserNotifications

/// Settings, About: how long the app stays openable. Not shown in builds that aren't signed.
struct SigningSection: View {
    @AppStorage(Pref.signingRefreshed) private var refreshed = 0.0
    @State private var status: UNAuthorizationStatus?

    var body: some View {
        // `refreshed` is read here so the rows redraw when it changes.
        if let expiry = Notices.expiry, refreshed >= 0 {
            let days = SigningProfile.daysLeft(until: expiry, now: Date())
            Section {
                LabeledContent("Days Left", value: days.map { $0 == 0 ? "Less than 1" : "\($0)" } ?? "Unknown")
                if days != nil {
                    LabeledContent("Expires", value: expiry.formatted(date: .abbreviated, time: .shortened))
                }
                if status == .notDetermined {
                    Button("Remind Me Before It Expires") {
                        Task {
                            await Notices.askPermission()
                            status = await Notices.status()
                        }
                    }
                }
                Button("I Refreshed Today") { Notices.markRefreshed() }
            } header: {
                Text("Signing")
            } footer: {
                Text(status == .denied
                    ? "Notifications are off for lodesong in iOS Settings, so you won't be warned."
                    : "A refresh in SideStore doesn't tell the app. Tap I Refreshed Today afterwards, or add the Mark lodesong as Refreshed action to your refresh shortcut.")
            }
            .task { status = await Notices.status() }
        }
    }
}

struct NewTracksToggle: View {
    @AppStorage(Pref.notifyNewTracks) private var notify = true
    @State private var denied = false

    var body: some View {
        Section {
            Toggle("Notify About New Tracks", isOn: $notify)
                .onChange(of: notify) { _, on in
                    guard on else { return }
                    Task {
                        await Notices.askPermission()
                        denied = await Notices.status() == .denied
                    }
                }
        } footer: {
            Text(notify && denied
                ? "Notifications are off for lodesong in iOS Settings."
                : "When a sync adds songs to a downloaded playlist.")
        }
        .task { denied = await Notices.status() == .denied }
    }
}
