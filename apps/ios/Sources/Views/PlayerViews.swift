import SwiftUI

/// What the player screens draw. A copy of the player, so screenshots can stand one in.
struct Playback {
    var queue: [Song] = []
    var index = 0
    var isPlaying = false
    var current: Song? { queue.indices.contains(index) ? queue[index] : nil }
}

extension PlayerModel {
    func playback(_ library: Library) -> Playback {
        #if DEBUG
        if queue.isEmpty, let sample = DebugScreen.playback(library) { return sample }
        #endif
        return Playback(queue: queue, index: index, isPlaying: isPlaying)
    }
}

/// The only view that follows the position, so a tick redraws it and nothing else.
private struct PlayerScrubber: View {
    @EnvironmentObject private var model: AppModel
    let player: PlayerModel
    @ObservedObject var clock: PlayerClock

    var body: some View {
        let shown = progress
        Scrubber(position: shown.0, duration: shown.1) { player.seek(to: $0) }
    }

    private var progress: (TimeInterval, TimeInterval) {
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
    }
}

/// The filled look a player button takes while its mode is on.
private struct Toggled: ViewModifier {
    let on: Bool

    func body(content: Content) -> some View {
        content
            .font(.title3)
            .foregroundStyle(.white.opacity(on ? 1 : 0.7))
            .frame(width: 44, height: 44)
            .background(.white.opacity(on ? 0.25 : 0), in: .rect(cornerRadius: 10))
            .contentShape(.rect)
    }
}

/// Sits above the tab bar, and folds into it when the bar shrinks.
struct MiniPlayer: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

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
                        if let artist = song?.artist, placement != .inline {
                            Text(artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .disabled(song == nil)
            .accessibilityHint("Opens now playing")
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
    @Environment(\.dismiss) private var dismiss
    @State private var showingQueue = NowPlayingView.startsInQueue
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    @AppStorage(Pref.keepAwake) private var keepAwake = false
    @Namespace private var cover

    private static var startsInQueue: Bool {
        #if DEBUG
        DebugScreen.name == "queue"
        #else
        false
        #endif
    }

    var body: some View {
        let playback = player.playback(model.library)
        let song = playback.current
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
                    Spacer(minLength: 8)
                    Artwork(id: song?.coverArt, size: 800, radius: 14)
                        .matchedGeometryEffect(id: "cover", in: cover)
                        .frame(maxWidth: min(proxy.size.width - 56, proxy.size.height * 0.46))
                        .scaleEffect(playback.isPlaying ? 1 : 0.82)
                        .shadow(color: .black.opacity(0.4), radius: 24, y: 14)
                        .animation(.spring(response: 0.45, dampingFraction: 0.7), value: playback.isPlaying)
                    Spacer(minLength: 12)
                }
                VStack(spacing: proxy.size.height < 700 || showingQueue ? 8 : 20) {
                    if !showingQueue { titles(song) }
                    PlayerScrubber(player: player, clock: player.clock)
                    transport(playback.isPlaying)
                    VolumeSlider()
                    HStack {
                        Spacer()
                        RoutePicker().frame(width: 44, height: 44).accessibilityLabel("AirPlay")
                        Spacer()
                        Button {
                            Haptic.tap()
                            withAnimation(.spring(duration: 0.35)) { showingQueue.toggle() }
                        } label: {
                            Image(systemName: "list.bullet").modifier(Toggled(on: showingQueue))
                        }
                        .accessibilityLabel("Queue")
                        .accessibilityAddTraits(showingQueue ? .isSelected : [])
                        Spacer()
                    }
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
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        // A drag in the queue reorders or scrolls it, so it must not pull the player closed.
        .interactiveDismissDisabled(showingQueue)
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
            titles(song)
        }
        .frame(maxWidth: 480)
        .padding(.horizontal, 28)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private func titles(_ song: Song?) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(song?.title ?? "Not Playing").font(.title3.bold()).lineLimit(1)
                Text(song?.artist ?? " ").font(.title3).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let song {
                Menu {
                    SongMenu(song: song)
                } label: {
                    Image(systemName: "ellipsis").font(.headline).frame(width: 34, height: 34).background(.white.opacity(0.18), in: .circle)
                }
                .accessibilityLabel("More")
            }
        }
    }

    private func transport(_ isPlaying: Bool) -> some View {
        HStack {
            Spacer()
            control("backward.fill", "Previous", size: 30) { player.previous() }
            Spacer()
            control(isPlaying ? "pause.fill" : "play.fill", isPlaying ? "Pause" : "Play", size: 44) { player.toggle() }
            Spacer()
            control("forward.fill", "Next", size: 30) { player.next() }
            Spacer()
        }
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

    var body: some View {
        let playback = player.playback(model.library)
        let entries = entries(playback.queue)
        let base = min(playback.index + 1, entries.count)
        let top = base < entries.count ? entries[base].id : Self.end
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("Playing Next").font(.headline)
                Spacer()
                ShuffleButton()
                RepeatButton()
            }
            .frame(maxWidth: 480)
            .padding(.horizontal, 28)
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
            // Rows fade out above the scrubber instead of being cut in half.
            .mask { LinearGradient(stops: [.init(color: .black, location: 0.92), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom) }
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
        let song = playback.queue[index]
        return Button {
            Haptic.tap()
            player.jump(to: index)
        } label: {
            HStack(spacing: 12) {
                Artwork(id: song.coverArt, size: 120, radius: 6).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.title).lineLimit(1)
                    Text(song.artist ?? "").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if index > playback.index {
                    Image(systemName: "line.3.horizontal").foregroundStyle(.tertiary).accessibilityHidden(true)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .opacity(index < playback.index ? 0.6 : 1)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 28, bottom: 6, trailing: 28))
    }
}
