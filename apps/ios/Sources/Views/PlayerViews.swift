import SwiftUI

/// What the player screens draw. A copy of the player, so screenshots can stand one in.
struct Playback {
    var queue: [Song] = []
    var index = 0
    var isPlaying = false
    var position: TimeInterval = 0
    var duration: TimeInterval = 0
    var current: Song? { queue.indices.contains(index) ? queue[index] : nil }
}

extension PlayerModel {
    func playback(_ library: Library) -> Playback {
        #if DEBUG
        if queue.isEmpty, let sample = DebugScreen.playback(library) { return sample }
        #endif
        return Playback(queue: queue, index: index, isPlaying: isPlaying, position: position, duration: duration)
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
                    Scrubber(position: playback.position, duration: playback.duration) { player.seek(to: $0) }
                    transport(playback.isPlaying)
                    VolumeSlider()
                    HStack {
                        Spacer()
                        RoutePicker().frame(width: 44, height: 44).accessibilityLabel("AirPlay")
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
        ScrollViewReader { scroll in
            List {
                if playback.current != nil {
                    section("History", playback, 0..<playback.index)
                    section("Now Playing", playback, playback.index..<playback.index + 1)
                    section("Up Next", playback, playback.index + 1..<playback.queue.count)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            // History sits above, out of sight until pulled down.
            .onAppear { scroll.scrollTo(playback.index, anchor: .top) }
        }
        .padding(.top, 16)
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
                    let song = playback.queue[index]
                    Button {
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
                            }
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .opacity(index < playback.index ? 0.6 : 1)
                    .listRowBackground(Color.clear)
                    .id(index)
                    .contextMenu { SongMenu(song: song) }
                }
            }
        }
    }
}
