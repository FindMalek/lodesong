import SwiftUI
import UIKit

/// What the player screens draw. A copy of the player, so screenshots can stand one in.
struct Playback {
    var queue: [Song] = []
    var index = 0
    var isPlaying = false
    /// The name of the device that plays, when it isn't this one.
    var playingOn: String?
    var current: Song? { queue.indices.contains(index) ? queue[index] : nil }
}

extension PlayerModel {
    func playback(_ library: Library) -> Playback {
        if let device = mirror.playingOn {
            return Playback(queue: mirror.state?.songs ?? [], isPlaying: mirror.state?.playing == true, playingOn: device.name)
        }
        #if DEBUG
        if queue.isEmpty, let sample = DebugScreen.playback(library) { return sample }
        #endif
        return Playback(queue: queue, index: index, isPlaying: isPlaying)
    }
}

/// The only view that follows the position, so a tick redraws it and nothing else.
struct PlayerScrubber: View {
    @EnvironmentObject private var model: AppModel
    let player: PlayerModel
    @ObservedObject var clock: PlayerClock

    var body: some View {
        let shown = progress
        Scrubber(position: shown.0, duration: shown.1) { player.seek(to: $0) }
    }

    private var progress: (TimeInterval, TimeInterval) {
        if player.isRemote { return (clock.position, Double(player.mirror.state?.songs.first?.duration ?? 0)) }
        #if DEBUG
        if player.queue.isEmpty, let sample = DebugScreen.progress(model.library) { return sample }
        #endif
        return (clock.position, player.duration)
    }
}

/// Another device saved a newer queue: take it over, or not.
struct OfferBanner: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        if let offer = player.offer, offer.songs.indices.contains(offer.index) {
            let song = offer.songs[offer.index]
            HStack(spacing: 12) {
                Artwork(id: song.coverArt, size: 120, radius: 6).frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text("On another device").font(.caption).foregroundStyle(.secondary)
                    Text("\(song.title), \(timeText(offer.position))").font(.subheadline.weight(.semibold))
                }
                .lineLimit(1)
                Spacer(minLength: 0)
                Button("Resume") {
                    Haptic.tap()
                    player.resumeOffer()
                }
                .buttonStyle(.glassProminent)
                Button("Dismiss", systemImage: "xmark") { player.dismissOffer() }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .frame(width: 28, height: 32)
            }
            .padding(10)
            .glassEffect(.regular, in: .rect(cornerRadius: 20))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        }
    }
}

struct ShuffleButton: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        Button {
            Haptic.tap()
            player.toggleShuffle()
        } label: {
            Image(systemName: "shuffle").modifier(Toggled(on: player.isShuffled))
        }
        .accessibilityLabel("Shuffle")
        .accessibilityValue(player.isShuffled ? "On" : "Off")
        .disabled(player.isRemote)
    }
}

struct RepeatButton: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        Button {
            Haptic.tap()
            player.cycleRepeat()
        } label: {
            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").modifier(Toggled(on: player.repeatMode != .off))
        }
        .accessibilityLabel("Repeat")
        .accessibilityValue(player.repeatMode == .off ? "Off" : player.repeatMode == .all ? "All" : "One")
        .disabled(player.isRemote)
    }
}

/// The filled look a player button takes while its mode is on.
struct Toggled: ViewModifier {
    let on: Bool
    @Environment(\.isEnabled) private var isEnabled

    func body(content: Content) -> some View {
        content
            .font(.title3)
            .foregroundStyle(.white.opacity(on ? 1 : 0.7))
            .frame(width: 44, height: 44)
            .background(.white.opacity(on ? 0.25 : 0), in: .rect(cornerRadius: 10))
            .contentShape(.rect)
            .opacity(isEnabled ? 1 : 0.35)
    }
}

/// Sits above the tab bar, and folds into it when the bar shrinks.
struct MiniPlayer: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @AppStorage(Pref.miniPlayerSwipe) private var swipes = true

    var body: some View {
        let playback = player.playback(model.library)
        let song = playback.current
        HStack(spacing: 10) {
            Button {
                router.showingPlayer = true
            } label: {
                HStack(spacing: 10) {
                    Artwork(id: song?.coverArt, size: 120, radius: 6).frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(song?.title ?? "Not Playing").font(.subheadline.weight(.semibold)).lineLimit(1)
                        if let device = playback.playingOn, placement != .inline {
                            Text("Playing on \(device)").font(.caption).foregroundStyle(.tint).lineLimit(1)
                        } else if let artist = song?.artist, placement != .inline {
                            Text(artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            // A remote with nothing on yet still opens, to move playback.
            .disabled(song == nil && playback.playingOn == nil)
            .accessibilityHint("Opens now playing")
            .gesture(SidewaysSwipe(enabled: swipes && song != nil) { across in
                Haptic.tap()
                across < 0 ? player.next() : player.previous()
            })
            Button {
                Haptic.tap()
                player.toggle()
            } label: {
                Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 36, height: 36)
            }
            .accessibilityLabel(playback.isPlaying ? "Pause" : "Play")
            .disabled(song == nil)
            if placement != .inline {
                Button {
                    Haptic.tap()
                    player.next()
                } label: {
                    Image(systemName: "forward.fill").font(.body).frame(width: 36, height: 36)
                }
                .accessibilityLabel("Next")
                .disabled(song == nil)
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        // The bar has a fixed height, so text stops growing before it would be cut off.
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }
}

struct NowPlayingView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    @State private var showingQueue = NowPlayingView.startsInQueue
    @State private var showingMore = NowPlayingView.startsInMore
    @State private var showingDevices = NowPlayingView.startsInDevices
    @State private var afterMore: PlayerButton?
    @AppStorage(Pref.playerStyle) private var style = "arpeggi"
    @AppStorage(Pref.coverSwipe) private var coverSwipe = true
    @AppStorage(Pref.reverseCoverSwipe) private var reverseCoverSwipe = false
    @AppStorage(Pref.controlSwipe) private var controlSwipe = true
    @AppStorage(Pref.playerButtonOrder) private var buttonOrder = ""
    @AppStorage(Pref.hiddenPlayerButtons) private var hiddenButtons = PlayerButton.hiddenByDefault
    @AppStorage(Pref.showAlbum) private var showAlbum = true
    @AppStorage(Pref.coverShrinks) private var coverShrinks = true
    @AppStorage(Pref.streamInfo) private var streamInfo = true
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    @AppStorage(Pref.keepAwake) private var keepAwake = false
    @AppStorage(Pref.coverSkipSeconds) private var stepSetting = 10
    @Namespace private var cover
    @State private var showingLyrics = NowPlayingView.startsInLyrics

    private static var startsInLyrics: Bool {
        #if DEBUG
        DebugScreen.name == "lyrics"
        #else
        false
        #endif
    }

    private static var startsInQueue: Bool {
        #if DEBUG
        DebugScreen.name == "queue" || DebugScreen.name == "history"
        #else
        false
        #endif
    }

    private static var startsInMore: Bool {
        #if DEBUG
        DebugScreen.name == "more" || DebugScreen.name == "playersettings"
        #else
        false
        #endif
    }

    private static var startsInDevices: Bool {
        #if DEBUG
        DebugScreen.name == "devices"
        #else
        false
        #endif
    }

    var body: some View {
        let playback = player.playback(model.library)
        let song = playback.current
        let arpeggi = style != "apple"
        GeometryReader { proxy in
            VStack(spacing: 0) {
                Button { dismiss() } label: {
                    Capsule().fill(.white.opacity(0.45)).frame(width: 40, height: 5).frame(width: 80, height: 28).contentShape(.rect)
                }
                .accessibilityLabel("Close now playing")
                if showingQueue {
                    queueHeader(song)
                    QueueView()
                } else {
                    // Takes whatever the controls leave, up to nearly the full width.
                    Artwork(id: song?.coverArt, size: 800, radius: 14)
                        .matchedGeometryEffect(id: "cover", in: cover)
                        .scaleEffect(playback.isPlaying || !coverShrinks ? 1 : 0.8)
                        .shadow(color: .black.opacity(0.4), radius: 24, y: 14)
                        .animation(.spring(response: 0.45, dampingFraction: 0.7), value: playback.isPlaying)
                        // As turning a page: left for the next song, unless reversed.
                        .gesture(SidewaysSwipe(enabled: coverSwipe && song != nil) { across in
                            Haptic.tap()
                            (across < 0) != reverseCoverSwipe ? player.next() : player.previous()
                        })
                        .frame(maxWidth: 560, maxHeight: .infinity)
                        .padding(.horizontal, 22)
                        .padding(.top, 4)
                        .padding(.bottom, proxy.size.height < 700 ? 8 : 20)
                }
                VStack(spacing: proxy.size.height < 700 || showingQueue ? 8 : 18) {
                    if !showingQueue {
                        Group {
                            if arpeggi {
                                centredTitles(song)
                            } else {
                                VStack(alignment: .leading, spacing: 4) {
                                    titles(song, album: showAlbum)
                                    if let song { RatingStars(song: song) }
                                }
                            }
                        }
                        .gesture(stepSwipe(song))
                    }
                    PlayerScrubber(player: player, clock: player.clock)
                        // Between the two times.
                        .overlay(alignment: .bottom) {
                            if let device = playback.playingOn {
                                PlayingOn(device: device).padding(.horizontal, 52)
                            } else if let song {
                                StreamInfo(song: song, detailed: streamInfo).padding(.horizontal, 52)
                            }
                        }
                    transport(playback.isPlaying, modes: arpeggi && !showingQueue)
                        .gesture(stepSwipe(song))
                        .accessibilityAction(named: "Skip Forward") { step(1) }
                        .accessibilityAction(named: "Skip Back") { step(-1) }
                    // The arpeggi style leaves volume to the phone's own buttons; another device's has no other way.
                    if playback.playingOn != nil { RemoteVolumeSlider() } else if !arpeggi { VolumeSlider() }
                    bottomButtons(song)
                }
                .frame(maxWidth: 480)
                .padding(.horizontal, 28)
                .padding(.bottom, 4)
            }
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(.white)
        .background { ArtworkBackground(id: song?.coverArt, moving: movingBackground) }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = keepAwake }
        .onChange(of: keepAwake) { UIApplication.shared.isIdleTimerDisabled = keepAwake }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .fullScreenCover(isPresented: $showingLyrics) { LyricsView() }
        // A drag in the queue reorders or scrolls it, so it must not pull the player closed.
        .interactiveDismissDisabled(showingQueue)
        // Outside the forced dark look, so the sheet follows the app's own theme.
        .sheet(isPresented: $showingMore, onDismiss: openAfterMore) {
            if let song { QuickSettings(song: song) { afterMore = $0 } }
        }
        .sheet(isPresented: $showingDevices) { DeviceList() }
    }

    /// What "..." was asked to show, once its sheet is gone: only one can be up at a time.
    private func openAfterMore() {
        switch afterMore {
        case .lyrics: showingLyrics = true
        case .queue: withAnimation(.spring(duration: 0.35)) { showingQueue = true }
        case .airplay: showingDevices = true
        default: break
        }
        afterMore = nil
    }

    /// The artwork shrunk beside the names, above the queue.
    private func queueHeader(_ song: Song?) -> some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.spring(duration: 0.35)) { showingQueue = false }
            } label: {
                Artwork(id: song?.coverArt, size: 800, radius: 8)
                    .matchedGeometryEffect(id: "cover", in: cover)
                    .frame(width: 64, height: 64)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Show artwork")
            titles(song, album: false, compact: true)
        }
        .frame(maxWidth: 480)
        .padding(.horizontal, 28)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private func titles(_ song: Song?, album: Bool, compact: Bool = false) -> some View {
        HStack(spacing: 10) {
            names(song, album: album, compact: compact, alignment: .leading)
            if let song {
                LikeButton(song: song)
                Button { showingMore = true } label: { CircleIcon(symbol: "ellipsis") }
                    .accessibilityLabel("More")
            }
        }
    }

    private func names(_ song: Song?, album: Bool, compact: Bool, alignment: Alignment) -> some View {
        VStack(spacing: 1) {
            ScrollingText(text: song?.title ?? "Not Playing", font: compact ? .headline : .title2.bold(), alignment: alignment)
            ScrollingText(text: song?.artist ?? " ", font: compact ? .subheadline : .title3, alignment: alignment)
                .foregroundStyle(.white.opacity(0.7))
            if album, let name = song?.album, !name.isEmpty {
                Button {
                    if let found = model.album(id: song?.albumId) { router.open(.album(found)) }
                } label: {
                    ScrollingText(text: name, font: .subheadline, alignment: alignment).foregroundStyle(.white.opacity(0.5))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the album")
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// The arpeggi style: names in the middle, then like, stars and "..." in one row.
    private func centredTitles(_ song: Song?) -> some View {
        VStack(spacing: 10) {
            names(song, album: showAlbum, compact: false, alignment: .center)
            if let song {
                HStack(spacing: 0) {
                    LikeButton(song: song)
                    Spacer(minLength: 8)
                    RatingStars(song: song).fixedSize()
                    Spacer(minLength: 8)
                    Button { showingMore = true } label: { CircleIcon(symbol: "ellipsis") }
                        .accessibilityLabel("More")
                }
            }
        }
    }

    private func transport(_ isPlaying: Bool, modes: Bool) -> some View {
        HStack(spacing: 0) {
            if modes { ShuffleButton() }
            Spacer(minLength: 0)
            control("backward.fill", "Previous", size: 30) { player.previous() }
            Spacer(minLength: 0)
            control(isPlaying ? "pause.fill" : "play.fill", isPlaying ? "Pause" : "Play", size: 44) { player.toggle() }
            Spacer(minLength: 0)
            control("forward.fill", "Next", size: 30) { player.next() }
            Spacer(minLength: 0)
            if modes { RepeatButton() }
        }
        .contentShape(.rect)
    }

    private func control(_ symbol: String, _ label: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button {
            Haptic.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: size))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 68, height: 56)
                .contentShape(.rect)
        }
        .accessibilityLabel(label)
    }

    private func step(_ direction: Int) {
        Haptic.tap()
        player.skip(by: Double(direction * Pref.stepSeconds(stepSetting)))
    }

    private func stepSwipe(_ song: Song?) -> SidewaysSwipe {
        SidewaysSwipe(enabled: controlSwipe && song != nil) { across in step(across > 0 ? 1 : -1) }
    }

    private func bottomButtons(_ song: Song?) -> some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            ForEach(PlayerButton.shown(order: buttonOrder, hidden: hiddenButtons, remote: player.isRemote), id: \.self) { button in
                bottomButton(button, song)
                Spacer(minLength: 0)
            }
        }
        .frame(minHeight: 44)
    }

    @ViewBuilder private func bottomButton(_ button: PlayerButton, _ song: Song?) -> some View {
        switch button {
        case .airplay:
            DeviceButton(showing: $showingDevices)
        case .settings:
            plainButton("gearshape", "Player settings") { showingMore = true }.disabled(song == nil)
        case .dismiss:
            plainButton("chevron.down", "Dismiss") { dismiss() }
        case .lyrics:
            plainButton("quote.bubble", "Lyrics") { showingLyrics = true }.disabled(song == nil)
        case .queue:
            Button {
                Haptic.tap()
                withAnimation(.spring(duration: 0.35)) { showingQueue.toggle() }
            } label: {
                Image(systemName: "list.bullet").modifier(Toggled(on: showingQueue))
            }
            .accessibilityLabel("Queue")
            .accessibilityAddTraits(showingQueue ? .isSelected : [])
        case .sleep:
            SleepTimerButton()
        }
    }

    private func plainButton(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.title3).frame(width: 44, height: 44).contentShape(.rect)
        }
        .foregroundStyle(.white.opacity(0.7))
        .accessibilityLabel(label)
    }
}

/// A swipe left or right that wins over the player's own swipe to close, which goes sideways too.
/// A drag up or down never starts it, so that still closes the player. SwiftUI's gestures lose to that swipe.
struct SidewaysSwipe: UIGestureRecognizerRepresentable {
    let enabled: Bool
    let swiped: (CGFloat) -> Void

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var enabled = false

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard enabled, let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let speed = pan.velocity(in: pan.view)
            return abs(speed.x) > abs(speed.y) * 2
        }

        func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer
        }
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        context.coordinator.enabled = enabled
        pan.delegate = context.coordinator
        return pan
    }

    func updateUIGestureRecognizer(_ recognizer: UIPanGestureRecognizer, context: Context) {
        context.coordinator.enabled = enabled
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let across = recognizer.translation(in: recognizer.view).x
        if recognizer.state == .ended, abs(across) > 40 { swiped(across) }
    }
}

/// What comes next, with what already played pulled down from above. Lives inside now playing.
struct QueueView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel

    /// A place in the queue that keeps its identity when rows move, even with the same song in it twice.
    private struct Entry: Identifiable {
        let id: String
        let index: Int
    }

    private static let end = "end"

    @State private var showingHistory = QueueView.startsInHistory
    @AppStorage(Pref.infinitePlay) private var infinitePlay = false
    @AppStorage(Pref.reportPlayback) private var reportPlayback = true

    private static var startsInHistory: Bool {
        #if DEBUG
        DebugScreen.name == "history"
        #else
        false
        #endif
    }

    var body: some View {
        let playback = player.playback(model.library)
        let entries = entries(playback.queue)
        let base = min(playback.index + 1, entries.count)
        let top = base < entries.count ? entries[base].id : Self.end
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text(showingHistory ? "History" : "Playing Next").font(.headline).lineLimit(1)
                Spacer(minLength: 4)
                QueueMoreButton(playback: playback, showingHistory: showingHistory)
            }
            .frame(maxWidth: 480)
            .padding(.horizontal, 28)
            HStack(spacing: 0) {
                Button {
                    Haptic.tap()
                    showingHistory.toggle()
                } label: {
                    Image(systemName: "clock.arrow.circlepath").modifier(Toggled(on: showingHistory))
                }
                .accessibilityLabel("History")
                .accessibilityAddTraits(showingHistory ? .isSelected : [])
                Spacer(minLength: 0)
                ShuffleButton()
                Spacer(minLength: 0)
                RepeatButton()
                Spacer(minLength: 0)
                Button {
                    Haptic.tap()
                    infinitePlay.toggle()
                } label: {
                    Image(systemName: "infinity").modifier(Toggled(on: infinitePlay))
                }
                .accessibilityLabel("Infinite play")
                .accessibilityValue(infinitePlay ? "On" : "Off")
                .disabled(player.isRemote)
                Spacer(minLength: 0)
                AddPlaylistButton()
            }
            .frame(maxWidth: 480)
            .padding(.horizontal, 28)
            if showingHistory {
                listened(playback)
            } else {
            GeometryReader { proxy in
                ScrollViewReader { scroll in
                    List {
                        if playback.index > 0 { history(playback, Array(entries[..<min(playback.index, entries.count)])) }
                        upNext(playback, Array(entries[base...]), base: base)
                        // Room below, so the history can always be scrolled out of sight.
                        Text(base < entries.count ? "" : "Nothing up next")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: max(0, proxy.size.height - CGFloat(entries.count - base) * 60), alignment: .top)
                            .padding(.top, base < entries.count ? 0 : 16)
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                            .id(Self.end)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .environment(\.defaultMinListRowHeight, 0)
                    .onAppear { scroll.scrollTo(top, anchor: .top) }
                    // A new song, or the top row going away: keep what is next at the top and the history out of sight.
                    .onChange(of: top) { _, top in scroll.scrollTo(top, anchor: .top) }
                }
            }
            }
        }
        // Rows fade out above the scrubber instead of being cut in half.
        .mask { LinearGradient(stops: [.init(color: .black, location: 0.92), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom) }
    }

    /// Everything heard on this phone, newest first, whatever queue it was in.
    private func heardSongs(_ playback: Playback) -> [Song] {
        var songs = player.history
        #if DEBUG
        if songs.isEmpty, DebugScreen.sample { songs = Array(playback.queue.prefix(playback.index).reversed()) }
        #endif
        // What is on now is not history yet.
        if songs.first?.id == playback.current?.id { songs.removeFirst() }
        return songs
    }

    @ViewBuilder private func listened(_ playback: Playback) -> some View {
        let songs = heardSongs(playback)
        if songs.isEmpty {
            Text(reportPlayback ? "Nothing played yet" : "Report Playback is off, so no history is kept")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 16)
                .padding(.horizontal, 28)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        } else {
            List(songs) { song in
                Button {
                    Haptic.tap()
                    if !player.playNow(song) { Popup.show("Not on This iPhone", message: "Offline Mode only plays downloaded songs.") }
                } label: {
                    rowLabel(song)
                }
                .modifier(QueueRow())
                .contextMenu { SongMenu(song: song) }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 0)
        }
    }

    private func entries(_ queue: [Song]) -> [Entry] {
        var seen: [String: Int] = [:]
        return queue.enumerated().map { index, song in
            let count = seen[song.id, default: 0]
            seen[song.id] = count + 1
            return Entry(id: "\(song.id)#\(count)", index: index)
        }
    }

    private func history(_ playback: Playback, _ entries: [Entry]) -> some View {
        Section("History") {
            ForEach(entries) { entry in
                row(playback, entry.index).contextMenu { SongMenu(song: playback.queue[entry.index]) }
            }
        }
    }

    /// Hold and drag to reorder, swipe to take out. A context menu here would fight the drag.
    private func upNext(_ playback: Playback, _ entries: [Entry], base: Int) -> some View {
        ForEach(entries) { entry in
            row(playback, entry.index)
                .moveDisabled(playback.playingOn != nil)
                .deleteDisabled(playback.playingOn != nil)
        }
        .onMove { source, target in
            Haptic.tap()
            player.move(from: IndexSet(source.map { $0 + base }), to: target + base)
        }
        .onDelete { offsets in
            player.remove(at: IndexSet(offsets.map { $0 + base }))
        }
    }

    private func row(_ playback: Playback, _ index: Int) -> some View {
        Button {
            Haptic.tap()
            player.jump(to: index)
        } label: {
            rowLabel(playback.queue[index], draggable: index > playback.index && playback.playingOn == nil)
        }
        .opacity(index < playback.index ? 0.6 : 1)
        .modifier(QueueRow())
    }

    private func rowLabel(_ song: Song, draggable: Bool = false) -> some View {
        HStack(spacing: 12) {
            Artwork(id: song.coverArt, size: 120, radius: 6).frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title).lineLimit(1)
                Text(song.artist ?? "").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if draggable {
                Image(systemName: "line.3.horizontal").foregroundStyle(.tertiary).accessibilityHidden(true)
            }
        }
        .contentShape(.rect)
    }
}

private struct QueueRow: ViewModifier {
    func body(content: Content) -> some View {
        content
            .buttonStyle(.plain)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 6, leading: 28, bottom: 6, trailing: 28))
    }
}
