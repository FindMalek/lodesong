import SwiftUI

/// One line that slides along when it doesn't fit, unless Settings or Reduce Motion says to cut it off.
struct ScrollingText: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(Pref.scrollingTitles) private var scrolls = true
    let text: String
    let font: Font
    var alignment: Alignment = .leading
    @State private var needed: CGFloat = 0
    @State private var space: CGFloat = 0
    @State private var start = Date()

    private static let gap: CGFloat = 48
    private static let speed = 30.0
    private static let rest = 3.0

    var body: some View {
        let moving = scrolls && !reduceMotion && needed > space + 1
        Text(text)
            .font(font)
            .lineLimit(1)
            .opacity(moving ? 0 : 1)
            .frame(maxWidth: .infinity, alignment: alignment)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { space = $0 }
            .background {
                Text(text).font(font).fixedSize().hidden()
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { needed = $0 }
            }
            .overlay(alignment: .leading) {
                if moving {
                    TimelineView(.animation) { timeline in
                        let lap = Double(needed + Self.gap) / Self.speed + Self.rest
                        let time = max(0, timeline.date.timeIntervalSince(start)).truncatingRemainder(dividingBy: lap)
                        HStack(spacing: Self.gap) {
                            Text(text)
                            Text(text)
                        }
                        .font(font)
                        .fixedSize()
                        .offset(x: -max(0, time - Self.rest) * Self.speed)
                    }
                    .frame(width: space, alignment: .leading)
                    .clipped()
                    .accessibilityHidden(true)
                }
            }
            .onChange(of: text) { start = Date() }
    }
}

/// The sleep timer's choices, for a menu or a form row.
struct SleepTimerPicker: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        Picker("Sleep Timer", systemImage: "moon.zzz", selection: choice) {
            Text("Off").tag(0)
            if case .at(let time) = player.sleepTimer {
                Text("Until \(time.formatted(date: .omitted, time: .shortened))").tag(-4)
            }
            ForEach([5, 15, 30, 45, 60], id: \.self) { Text("\($0) Minutes").tag($0) }
            Text("End of Song").tag(-1)
            Text("End of Album").tag(-2)
            Text("End of Queue").tag(-3)
        }
        // This phone isn't the one playing, so there is nothing here to stop.
        .disabled(player.isRemote)
    }

    /// Minutes to pick, zero for off, below zero for the others; -4 is the one already counting down.
    private var choice: Binding<Int> {
        Binding {
            switch player.sleepTimer {
            case nil: return 0
            case .endOfSong: return -1
            case .endOfAlbum: return -2
            case .endOfQueue: return -3
            case .at: return -4
            }
        } set: { choice in
            switch choice {
            case 0: player.setSleepTimer(nil)
            case -1: player.setSleepTimer(.endOfSong)
            case -2: player.setSleepTimer(.endOfAlbum)
            case -3: player.setSleepTimer(.endOfQueue)
            case 1...: player.setSleepTimer(.at(Date().addingTimeInterval(Double(choice) * 60)))
            default: break
            }
        }
    }
}

struct SleepTimerButton: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        Menu {
            SleepTimerPicker().pickerStyle(.inline)
        } label: {
            Image(systemName: player.sleepTimer == nil ? "moon.zzz" : "moon.zzz.fill").modifier(Toggled(on: player.sleepTimer != nil))
        }
        .disabled(player.isRemote)
        .accessibilityLabel("Sleep timer")
        .accessibilityValue(player.sleepTimer == nil ? "Off" : "On")
    }
}

/// Sleep timer, saving and clearing, in the queue's header.
struct QueueMoreButton: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let playback: Playback
    let showingHistory: Bool

    var body: some View {
        Menu {
            SleepTimerPicker().pickerStyle(.menu)
            Button {
                SheetPresenter.show(model, player) { PlaylistEditorView(playlist: nil, songs: playback.queue) }
            } label: {
                Label("Save Queue as Playlist", systemImage: "square.and.arrow.down")
                if !model.canEdit { Text("Needs a connection") }
            }
            .disabled(!model.canEdit || playback.queue.isEmpty)
            if showingHistory {
                Button("Clear History", systemImage: "trash", role: .destructive) {
                    Popup.show("Clear History?", message: "The list of songs heard on this iPhone is emptied.", action: "Clear", destructive: true) { player.clearHistory() }
                }
                .disabled(player.history.isEmpty)
            } else {
                Button("Clear Queue", systemImage: "trash", role: .destructive) {
                    let after = UserDefaults.standard.bool(Pref.infinitePlay, or: false) ? " Infinite Play is on, so similar songs follow." : ""
                    Popup.show("Clear the Queue?", message: "The songs still to come are dropped." + after, action: "Clear", destructive: true) { player.clearUpcoming() }
                }
                // Nothing in the protocol removes songs from another device's queue.
                .disabled(player.isRemote || playback.index + 1 >= playback.queue.count)
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .accessibilityLabel("Queue options")
    }
}
