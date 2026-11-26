import SwiftUI

struct PlaybackSettings: View {
    @AppStorage(Pref.wifiBitRate) private var wifiBitRate = 0
    @AppStorage(Pref.cellularBitRate) private var cellularBitRate = 0
    @AppStorage(Pref.replayGain) private var replayGain = "auto"
    @AppStorage(Pref.speed) private var speed = 1.0
    @AppStorage(Pref.keepShuffle) private var keepShuffle = false
    @AppStorage(Pref.queueSync) private var queueSync = true
    @AppStorage(Pref.confirmReplace) private var confirmReplace = false
    @AppStorage(Pref.infinitePlay) private var infinitePlay = false

    var body: some View {
        Form {
            Section {
                QualityPicker(title: "On Wi-Fi", value: $wifiBitRate)
                QualityPicker(title: "On Cellular", value: $cellularBitRate)
            } header: {
                Text("Streaming Quality")
            } footer: {
                Text("Applies from the next song. A converted stream can't always be scrubbed. Downloads play as they are.")
            }
            Section {
                CacheAheadPicker()
            } footer: {
                Text("Fetches what comes next in full, in the quality above, so a bad connection doesn't stop it. Temporary: a song goes once the queue moves past it.")
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
                Toggle("Infinite Play", isOn: $infinitePlay)
                Toggle("Confirm Before Replacing Queue", isOn: $confirmReplace)
                Toggle("Keep Shuffle On", isOn: $keepShuffle)
            } footer: {
                Text("Infinite Play adds similar songs as the queue runs out. Keep Shuffle On shuffles what you start next while shuffle is on.")
            }
            Section {
                Toggle("Sync Queue Across Devices", isOn: $queueSync)
                ScrobbleRows()
            } footer: {
                Text("Off, nothing you play is scrobbled or kept in history.")
            }
        }
        .pickerStyle(.navigationLink)
        .navigationTitle("Playback")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct QualityPicker: View {
    let title: String
    @Binding var value: Int

    var body: some View {
        Picker(title, selection: $value) {
            Text("Original").tag(0)
            ForEach([320, 192, 128], id: \.self) { Text("MP3 \($0) kbps").tag($0) }
        }
    }
}

struct CacheAheadPicker: View {
    @AppStorage(Pref.cacheAhead) private var cacheAhead = 0

    var body: some View {
        Picker("Cache Songs Ahead", selection: $cacheAhead) {
            Text("Off").tag(0)
            ForEach([1, 3, 5, 10], id: \.self) { Text($0 == 1 ? "1 Song" : "\($0) Songs").tag($0) }
        }
    }
}

struct ScrobbleRows: View {
    @AppStorage(Pref.reportPlayback) private var reportPlayback = true
    @AppStorage(Pref.scrobblePercent) private var scrobblePercent = 50
    @AppStorage(Pref.scrobbleMinutes) private var scrobbleMinutes = 4
    @AppStorage(Pref.scrobbleUseTime) private var useTime = true

    var body: some View {
        Toggle("Report Playback", isOn: $reportPlayback)
        if reportPlayback {
            Picker("Count a Play After", selection: $scrobblePercent) {
                ForEach([25, 50, 75, 90], id: \.self) { Text("\($0)% of the Song").tag($0) }
            }
            Toggle("Use Minimum Time", isOn: $useTime)
            if useTime {
                Picker("Or After", selection: $scrobbleMinutes) {
                    ForEach([2, 4, 8], id: \.self) { Text("\($0) Minutes").tag($0) }
                }
            }
        }
    }
}

struct AppearanceSettings: View {
    @AppStorage(Pref.appearance) private var appearance = "system"
    @AppStorage(Pref.tint) private var tint = "red"
    @AppStorage(Pref.tintCustom) private var tintCustom = ""
    @AppStorage(Pref.minimizeTabBar) private var minimizeTabBar = true
    @AppStorage(Pref.swipeLeading) private var swipeLeading = SwipeAction.playNext
    @AppStorage(Pref.swipeTrailing) private var swipeTrailing = SwipeAction.addToQueue
    @AppStorage(Pref.lyricSize) private var lyricSize = LyricSize.medium
    @AppStorage("homeSections") private var homeSections = ""

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
                Picker("Lyrics Text Size", selection: $lyricSize) {
                    ForEach(LyricSize.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            }
            Section("Swipe on a Song") {
                swipe("Swipe Right", $swipeLeading)
                swipe("Swipe Left", $swipeTrailing)
            }
            Section("Show and Reorder") {
                NavigationLink("Home Sections") {
                    HomeSectionsList(stored: $homeSections)
                        .navigationTitle("Home Sections")
                        .navigationBarTitleDisplayMode(.inline)
                }
                NavigationLink("Library Sections") { LibrarySectionsList() }
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
}

/// Which rows Library shows, and in what order.
private struct LibrarySectionsList: View {
    @AppStorage(Pref.hiddenLibrary) private var hidden = ""
    @AppStorage(Pref.libraryOrder) private var order = ""

    var body: some View {
        List {
            ForEach(LibrarySection.ordered(order), id: \.self) { section in
                Toggle(section.title, isOn: shown(section))
            }
            .onMove { source, target in
                var sections = LibrarySection.ordered(order)
                sections.move(fromOffsets: source, toOffset: target)
                order = sections.map(\.rawValue).joined(separator: ",")
            }
            Button("Reset to Default") { (hidden, order) = ("", "") }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Library Sections")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func shown(_ section: LibrarySection) -> Binding<Bool> {
        let hidden = Set(hidden.split(separator: ",").map(String.init))
        return Binding(
            get: { !hidden.contains(section.rawValue) },
            set: { self.hidden = ($0 ? hidden.subtracting([section.rawValue]) : hidden.union([section.rawValue])).sorted().joined(separator: ",") }
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
            SigningSection()
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
