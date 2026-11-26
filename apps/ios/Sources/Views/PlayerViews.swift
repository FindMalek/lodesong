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
                Spacer(minLength: 8)
                Artwork(id: song?.coverArt, size: 800, radius: 14)
                    .frame(maxWidth: min(proxy.size.width - 56, proxy.size.height * 0.46))
                    .scaleEffect(playback.isPlaying ? 1 : 0.82)
                    .shadow(color: .black.opacity(0.4), radius: 24, y: 14)
                    .animation(.spring(response: 0.45, dampingFraction: 0.7), value: playback.isPlaying)
                Spacer(minLength: 12)
                VStack(spacing: proxy.size.height < 700 ? 8 : 20) {
                    titles(song)
                    PlayerScrubber(player: player, clock: player.clock)
                    transport(playback.isPlaying)
                    VolumeSlider()
                    HStack {
                        Spacer()
                        ShuffleButton()
                        Spacer()
                        RoutePicker().frame(width: 44, height: 44).accessibilityLabel("AirPlay")
                        Spacer()
                        RepeatButton()
                        Spacer()
                        Button { showingQueue = true } label: {
                            Image(systemName: "list.bullet").font(.title3).frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Queue")
                        .foregroundStyle(.white.opacity(0.7))
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
        .background { ArtworkBackground(id: song?.coverArt) }
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .sheet(isPresented: $showingQueue) {
            QueueView()
                .environment(\.colorScheme, .dark)
                .presentationBackground { ArtworkBackground(id: song?.coverArt, moving: false) }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
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

/// What played, what is playing and what comes next.
struct QueueView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        let playback = player.playback(model.library)
        VStack(spacing: 0) {
            HStack {
                Text("Queue").font(.headline)
                Spacer()
                ShuffleButton()
                RepeatButton()
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 4)
            ScrollViewReader { scroll in
                List {
                    if playback.current != nil {
                        section("History", playback, 0..<playback.index)
                        section("Now Playing", playback, playback.index..<playback.index + 1)
                        upNext(playback)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                // History sits above, out of sight until pulled down.
                .onAppear { scroll.scrollTo(playback.index, anchor: .top) }
            }
        }
        .overlay {
            if playback.current == nil {
                ContentUnavailableView("Nothing in the Queue", systemImage: "list.bullet", description: Text("Play something to fill it."))
            }
        }
    }

    @ViewBuilder private func section(_ title: String, _ playback: Playback, _ range: Range<Int>) -> some View {
        if !range.isEmpty {
            Section(title) {
                ForEach(Array(range), id: \.self) { index in
                    row(playback, index).contextMenu { SongMenu(song: playback.queue[index]) }
                }
            }
        }
    }

    /// Hold and drag to reorder, swipe to take out. A context menu here would fight the drag.
    @ViewBuilder private func upNext(_ playback: Playback) -> some View {
        let base = playback.index + 1
        if base < playback.queue.count {
            Section("Up Next") {
                ForEach(Array(base..<playback.queue.count), id: \.self) { index in
                    row(playback, index)
                }
                .onMove { source, target in
                    Haptic.tap()
                    player.move(from: IndexSet(source.map { $0 + base }), to: target + base)
                }
                .onDelete { offsets in
                    player.remove(at: IndexSet(offsets.map { $0 + base }))
                }
            }
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
                if index == playback.index {
                    Image(systemName: "waveform")
                        .symbolEffect(.variableColor.iterative, isActive: playback.isPlaying)
                } else if index > playback.index {
                    Image(systemName: "line.3.horizontal").foregroundStyle(.tertiary).accessibilityHidden(true)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .opacity(index < playback.index ? 0.6 : 1)
        .listRowBackground(Color.clear)
        .id(index)
    }
}
