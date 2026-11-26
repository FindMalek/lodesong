import SwiftUI

/// The words, full screen, following the song. Tap a line to jump there.
struct LyricsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var lyrics: LyricsModel
    @Environment(\.dismiss) private var dismiss
    @State private var shown: (song: String, saved: SavedLyrics)?
    @State private var loading = true
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    @AppStorage(Pref.lyricSize) private var lyricSize = LyricSize.medium
    @AppStorage(Pref.lyricsSource) private var lyricsSource = "server"
    @AppStorage(Pref.lyricsTranslation) private var translationChoice = ""

    var body: some View {
        let playback = player.playback(model.library)
        let song = playback.current
        let found = shown?.song == song?.id ? shown?.saved : nil
        let hidden = found?.lyrics.allowed(filesOnly: lyricsSource == "files") == false
        let saved = hidden ? nil : found
        VStack(spacing: 0) {
            header(song, saved)
            Group {
                if let saved, saved.lyrics.status == .synced {
                    SyncedLines(player: player, lyrics: saved.lyrics, translation: saved.lyrics.translation(translationChoice), nudge: saved.nudge, isPlaying: playback.isPlaying)
                        .id(song?.id)
                } else if let saved, saved.lyrics.status == .plain {
                    plain(saved.lyrics)
                } else if loading {
                    ProgressView().controlSize(.large).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    nothing(saved, hidden: hidden)
                }
            }
            controls(playback.isPlaying)
        }
        .foregroundStyle(.white)
        .background { ArtworkBackground(id: song?.coverArt, moving: movingBackground) }
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .task(id: song?.id) { await load(song?.id) }
    }

    private func load(_ song: String?) async {
        guard let song else {
            loading = false
            return
        }
        loading = true
        let local = lyrics.saved(song)
        shown = local.map { (song, $0) }
        loading = local == nil || local?.lyrics.status == .missing
        let fresh = await lyrics.refresh(song)
        guard !Task.isCancelled else { return }
        shown = fresh.map { (song, $0) }
        loading = false
    }

    private func header(_ song: Song?, _ saved: SavedLyrics?) -> some View {
        HStack(spacing: 12) {
            Artwork(id: song?.coverArt, size: 120, radius: 6).frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 1) {
                Text(song?.title ?? "Not Playing").font(.headline)
                Text(song?.artist ?? "").font(.subheadline).foregroundStyle(.white.opacity(0.65))
            }
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
            if let song, let saved, saved.lyrics.status == .synced {
                Menu {
                    Section(saved.nudge == 0 ? "Lyrics timing" : String(format: "Lyrics shifted %+.2f s", Double(saved.nudge) / 1000)) {
                        Button("Show Earlier", systemImage: "minus") { nudge(song.id, saved.nudge - 250) }
                        Button("Show Later", systemImage: "plus") { nudge(song.id, saved.nudge + 250) }
                        if saved.nudge != 0 { Button("Reset", systemImage: "arrow.counterclockwise") { nudge(song.id, 0) } }
                    }
                } label: {
                    circle("timer")
                }
                .menuActionDismissBehavior(.disabled)
                .accessibilityLabel("Lyrics timing")
            }
            if let translations = saved?.lyrics.translations, !translations.isEmpty {
                Menu {
                    Picker("Translation", selection: Binding { saved?.lyrics.translation(translationChoice)?.lang ?? "off" } set: { translationChoice = $0 }) {
                        Text("Off").tag("off")
                        ForEach(translations, id: \.lang) { Text(Locale.current.localizedString(forLanguageCode: $0.lang) ?? $0.lang).tag($0.lang) }
                    }
                } label: {
                    circle("translate")
                }
                .accessibilityLabel("Translation")
            }
            if let song { LikeButton(song: song) }
            Button { dismiss() } label: { circle("chevron.down") }
                .accessibilityLabel("Close lyrics")
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 8)
    }

    private func circle(_ symbol: String) -> some View {
        Image(systemName: symbol).font(.headline).frame(width: 34, height: 34).background(.white.opacity(0.18), in: .circle)
    }

    private func nudge(_ song: String, _ value: Int) {
        let value = min(60_000, max(-60_000, value))
        Haptic.tap()
        lyrics.nudge(song, to: value)
        if let saved = lyrics.saved(song) { shown = (song, saved) }
    }

    private func plain(_ lyrics: Lyrics) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("These lyrics have no timing.").font(.footnote).foregroundStyle(.white.opacity(0.6))
                let translation = lyrics.translation(translationChoice)
                ForEach(Array(lyrics.lines.enumerated()), id: \.offset) { index, line in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(line.text.isEmpty ? " " : line.text).font(lyricSize.plain.bold()).readingDirection(line.text)
                        if let other = translation?.line(index, under: line.text) {
                            Text(other).font(lyricSize.translation).foregroundStyle(.white.opacity(0.65)).readingDirection(other)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
        }
    }

    @ViewBuilder private func nothing(_ saved: SavedLyrics?, hidden: Bool) -> some View {
        Group {
            if hidden {
                ContentUnavailableView("No Lyrics in the File", systemImage: "quote.bubble", description: Text("Lyrics Source in Appearance settings is set to Files Only."))
            } else if saved?.lyrics.status == .instrumental {
                ContentUnavailableView("Instrumental", systemImage: "pianokeys", description: Text("This one has no words."))
            } else if saved != nil {
                ContentUnavailableView("No Lyrics", systemImage: "quote.bubble", description: Text("None were found for this song."))
            } else {
                ContentUnavailableView(
                    "Lyrics Unavailable", systemImage: "wifi.slash",
                    description: Text("They aren't on this iPhone yet and the server can't be reached.")
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func controls(_ isPlaying: Bool) -> some View {
        VStack(spacing: 4) {
            PlayerScrubber(player: player, clock: player.clock)
            HStack(spacing: 40) {
                control("backward.fill", "Previous") { player.previous() }
                control(isPlaying ? "pause.fill" : "play.fill", isPlaying ? "Pause" : "Play") { player.toggle() }
                control("forward.fill", "Next") { player.next() }
            }
        }
        .frame(maxWidth: 480)
        .padding(.horizontal, 28)
        .padding(.top, 8)
    }

    private func control(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button {
            Haptic.tap()
            action()
        } label: {
            Image(systemName: symbol).font(.title).contentTransition(.symbolEffect(.replace)).frame(width: 56, height: 48).contentShape(.rect)
        }
        .accessibilityLabel(label)
    }
}

private struct SyncedLines: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(Pref.tint) private var tint = "red"
    @AppStorage(Pref.tintCustom) private var tintCustom = ""
    @AppStorage(Pref.lyricSize) private var lyricSize = LyricSize.medium
    let player: PlayerModel
    let lyrics: Lyrics
    let translation: Lyrics.Translation?
    let nudge: Int
    let isPlaying: Bool

    @State private var active: Int?
    @State private var sung = 0
    /// The player reports twice a second; in between, time runs on from the last report.
    @State private var report = (position: -1.0, at: Date())
    @State private var browsing = false
    @State private var resume: Task<Void, Never>?

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 22) {
                    ForEach(lyrics.lines.indices, id: \.self) { index in
                        row(index).id(index)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 40)
                .padding(.bottom, 300)
            }
            .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.06), .init(color: .black, location: 0.9), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
            .onScrollPhaseChange { _, phase in
                if phase == .interacting {
                    resume?.cancel()
                    browsing = true
                } else if phase == .idle, browsing {
                    resume?.cancel()
                    resume = Task {
                        try? await Task.sleep(for: .seconds(4))
                        guard !Task.isCancelled else { return }
                        browsing = false
                        follow(scroll)
                    }
                }
            }
            .onChange(of: active) { if !browsing { follow(scroll) } }
            .overlay(alignment: .bottom) {
                if browsing, active != nil {
                    Button("Back to Current Line", systemImage: "arrow.down.to.line") {
                        resume?.cancel()
                        browsing = false
                        follow(scroll)
                    }
                    .buttonStyle(.glass)
                    .padding(.bottom, 8)
                }
            }
            .task(id: [isPlaying ? 1 : 0, nudge]) {
                while !Task.isCancelled {
                    tick()
                    try? await Task.sleep(for: .milliseconds(100))
                }
            }
        }
    }

    private func tick() {
        let position = player.clock.position
        if position != report.position || !isPlaying { report = (position, Date()) }
        let ms = (position + (isPlaying ? min(Date().timeIntervalSince(report.at), 0.5) : 0)) * 1000
        let line = lyrics.line(at: ms, nudge: nudge)
        let words = line.map { lyrics.lines[$0].sung(at: ms, nudge: nudge) } ?? 0
        if line != active { active = line }
        if words != sung { sung = words }
    }

    private func follow(_ scroll: ScrollViewProxy) {
        guard let active else { return }
        withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.9)) {
            scroll.scrollTo(active, anchor: UnitPoint(x: 0.5, y: 0.3))
        }
    }

    private func row(_ index: Int) -> some View {
        let line = lyrics.lines[index]
        let current = index == active
        return Button {
            Haptic.tap()
            resume?.cancel()
            browsing = false
            // A hair past the start, so rounding never lands on the line before.
            player.seek(to: max(0, (line.start + Double(nudge)) / 1000 + 0.01))
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                text(line, current: current)
                    .font(lyricSize.synced.bold())
                    .foregroundStyle(current ? Theme.tint(tint, custom: tintCustom) : .white)
                    .readingDirection(line.text)
                if let other = translation?.line(index, under: line.text) {
                    Text(other).font(lyricSize.translation.weight(.semibold)).foregroundStyle(.white.opacity(0.7)).readingDirection(other)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .opacity(current || browsing ? 1 : 0.35)
        .animation(.easeInOut(duration: 0.25), value: current)
        .accessibilityLabel(line.text.isEmpty ? "Pause in the lyrics" : [line.text, translation?.line(index, under: line.text)].compactMap { $0 }.joined(separator: ", "))
        .accessibilityHint("Plays from here")
        .accessibilityAddTraits(current ? .isSelected : [])
    }

    private func text(_ line: Lyrics.Line, current: Bool) -> Text {
        guard current, let words = line.words, !words.isEmpty else { return Text(line.text.isEmpty ? "• • •" : line.text) }
        var out = AttributedString()
        for (index, word) in words.enumerated() {
            var part = AttributedString(index == 0 ? word.text : " " + word.text)
            part.foregroundColor = Theme.tint(tint, custom: tintCustom).opacity(index < sung ? 1 : 0.5)
            out += part
        }
        return Text(out)
    }
}

private extension View {
    /// Arabic and Hebrew start on the right, whatever the phone's own language.
    func readingDirection(_ text: String) -> some View {
        multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.layoutDirection, Lyrics.isRightToLeft(text) ? .rightToLeft : .leftToRight)
    }
}

private extension Lyrics.Translation {
    /// Nothing when it is missing or only says the same again.
    func line(_ index: Int, under original: String) -> String? {
        guard lines.indices.contains(index), !lines[index].isEmpty, lines[index] != original else { return nil }
        return lines[index]
    }
}

/// How big the words are, on top of the system's own text size.
enum LyricSize: String, CaseIterable {
    case small, medium, large, extraLarge

    var title: String { self == .extraLarge ? "Extra Large" : rawValue.capitalized }
    var synced: Font {
        switch self {
        case .small: return .title3
        case .medium: return .title
        case .large: return .largeTitle
        case .extraLarge: return .system(size: 42)
        }
    }
    var translation: Font {
        switch self {
        case .small: return .footnote
        case .medium: return .body
        case .large: return .title3
        case .extraLarge: return .title2
        }
    }
    var plain: Font {
        switch self {
        case .small: return .body
        case .medium: return .title2
        case .large: return .title
        case .extraLarge: return .largeTitle
        }
    }
}
