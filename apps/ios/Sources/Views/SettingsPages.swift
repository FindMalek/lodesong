import SwiftUI

struct PlaybackSettings: View {
    @AppStorage(Pref.wifiBitRate) private var wifiBitRate = 0
    @AppStorage(Pref.cellularBitRate) private var cellularBitRate = 0
    @AppStorage(Pref.replayGain) private var replayGain = "auto"
    @AppStorage(Pref.speed) private var speed = 1.0
    @AppStorage(Pref.keepShuffle) private var keepShuffle = false
    @AppStorage(Pref.queueSync) private var queueSync = true
    @AppStorage(Pref.lockSkipSeconds) private var lockSkipSeconds = 0
    @AppStorage(Pref.keepAwake) private var keepAwake = false
    @AppStorage(Pref.reportPlayback) private var reportPlayback = true
    @AppStorage(Pref.scrobblePercent) private var scrobblePercent = 50
    @AppStorage(Pref.scrobbleMinutes) private var scrobbleMinutes = 4

    var body: some View {
        Form {
            Section {
                quality("On Wi-Fi", $wifiBitRate)
                quality("On Cellular", $cellularBitRate)
            } header: {
                Text("Streaming Quality")
            } footer: {
                Text("Applies from the next song. A converted stream can't always be scrubbed. Downloads play as they are.")
            }
            Section {
                Picker("ReplayGain", selection: $replayGain) {
                    Text("Automatic").tag("auto")
                    Text("Per Song").tag("track")
                    Text("Per Album").tag("album")
                    Text("Off").tag("off")
                }
                Picker("Speed", selection: $speed) {
                    ForEach([0.75, 1, 1.25, 1.5, 2], id: \.self) { Text("\($0.formatted())×").tag($0) }
                }
                Picker("Lock Screen Buttons", selection: $lockSkipSeconds) {
                    Text("Previous and Next").tag(0)
                    ForEach([10, 15, 30], id: \.self) { Text("Skip \($0) Seconds").tag($0) }
                }
                Toggle("Keep Shuffle On", isOn: $keepShuffle)
                Toggle("Keep Screen Awake", isOn: $keepAwake)
            } footer: {
                Text("Keep Shuffle On shuffles what you start next while shuffle is on. The screen stays awake on now playing only.")
            }
            Section {
                Toggle("Sync Queue Across Devices", isOn: $queueSync)
                Toggle("Report Playback", isOn: $reportPlayback)
                if reportPlayback {
                    Picker("Count a Play After", selection: $scrobblePercent) {
                        ForEach([25, 50, 75, 90], id: \.self) { Text("\($0)% of the Song").tag($0) }
                    }
                    Picker("Or After", selection: $scrobbleMinutes) {
                        ForEach([2, 4, 8], id: \.self) { Text("\($0) Minutes").tag($0) }
                    }
                }
            } footer: {
                Text("Off, nothing you play is scrobbled or kept in history.")
            }
        }
        .pickerStyle(.navigationLink)
        .navigationTitle("Playback")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func quality(_ title: String, _ value: Binding<Int>) -> some View {
        Picker(title, selection: value) {
            Text("Original").tag(0)
            ForEach([320, 192, 128], id: \.self) { Text("MP3 \($0) kbps").tag($0) }
        }
    }
}

struct AppearanceSettings: View {
    @AppStorage(Pref.appearance) private var appearance = "system"
    @AppStorage(Pref.tint) private var tint = "red"
    @AppStorage(Pref.tintCustom) private var tintCustom = ""
    @AppStorage(Pref.minimizeTabBar) private var minimizeTabBar = true
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    @AppStorage(Pref.swipeLeading) private var swipeLeading = SwipeAction.playNext
    @AppStorage(Pref.swipeTrailing) private var swipeTrailing = SwipeAction.addToQueue
    @AppStorage(Pref.hiddenLibrary) private var hiddenLibrary = ""

    var body: some View {
        Form {
            Section {
                Picker("Theme", selection: $appearance) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                Picker("App Tint", selection: $tint) {
                    Text("Red").tag("red")
                    Text("Blue").tag("blue")
                    Text("Custom").tag("custom")
                }
                if tint == "custom" {
                    ColorPicker(
                        "Custom Color",
                        selection: Binding(get: { Theme.tint("custom", custom: tintCustom) }, set: { tintCustom = Theme.hex($0) }),
                        supportsOpacity: false
                    )
                }
            }
            Section {
                Toggle("Shrink Tab Bar on Scroll", isOn: $minimizeTabBar)
                Toggle("Moving Player Background", isOn: $movingBackground)
            }
            Section("Swipe on a Song") {
                swipe("Swipe Right", $swipeLeading)
                swipe("Swipe Left", $swipeTrailing)
            }
            Section("Library Shows") {
                ForEach(LibrarySection.allCases, id: \.self) { section in
                    Toggle(section.title, isOn: shown(section))
                }
            }
        }
        // A menu picker would keep the tint it first had; a list shows its value in grey.
        .pickerStyle(.navigationLink)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func swipe(_ title: String, _ value: Binding<SwipeAction>) -> some View {
        Picker(title, selection: value) {
            ForEach(SwipeAction.allCases, id: \.self) { Text($0.title).tag($0) }
        }
    }

    private func shown(_ section: LibrarySection) -> Binding<Bool> {
        let hidden = Set(hiddenLibrary.split(separator: ",").map(String.init))
        return Binding(
            get: { !hidden.contains(section.rawValue) },
            set: { hiddenLibrary = ($0 ? hidden.subtracting([section.rawValue]) : hidden.union([section.rawValue])).sorted().joined(separator: ",") }
        )
    }
}

struct StorageSettings: View {
    @EnvironmentObject private var downloads: DownloadsModel
    @State private var covers = 0

    var body: some View {
        Form {
            Section {
                NavigationLink { DownloadsView() } label: {
                    LabeledContent("Downloads", value: size(downloads.totalBytes))
                }
            }
            Section {
                LabeledContent("Artwork Cache", value: size(covers))
                Button("Clear Artwork Cache", role: .destructive) {
                    ArtworkCache.shared.clear()
                    covers = ArtworkCache.shared.diskSize()
                }
                .disabled(covers == 0)
            } footer: {
                Text("Covers are fetched again as you browse. With no network they stay blank until then.")
            }
        }
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { covers = ArtworkCache.shared.diskSize() }
    }

    private func size(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}

struct AboutSettings: View {
    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "" }

    var body: some View {
        Form {
            Section {
                LabeledContent("Version", value: version)
                Link("What's New", destination: URL(string: "https://github.com/FindMalek/lodesong/releases")!)
                Link("Source Code", destination: URL(string: "https://github.com/FindMalek/lodesong")!)
            }
        }
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}
