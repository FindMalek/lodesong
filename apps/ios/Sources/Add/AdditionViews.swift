import SwiftUI
import UIKit

/// A list would put the icon in its own column and tint it, which hides it on a tinted button.
struct InlineLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon
            configuration.title
        }
    }
}

/// A match to pick from.
struct WishRow: View {
    let wish: Wish
    let addition: Addition?
    let owned: Bool
    let adding: Bool
    /// Something is being added, this row or another.
    let busy: Bool
    let played: () -> Void
    let add: () -> Void
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        HStack(spacing: 14) {
            WishCover(wish: wish)
            VStack(alignment: .leading, spacing: 2) {
                Text(wish.title).font(.body.weight(.medium)).lineLimit(2)
                if !wish.details.isEmpty {
                    Text(wish.details).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                note
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            accessory
        }
        .alignmentGuide(.listRowSeparatorLeading) { _ in 78 }
        .modifier(RemoveMenu(addition: addition))
    }

    @ViewBuilder private var note: some View {
        if adding {
            Text("Adding…").font(.caption).foregroundStyle(.tint)
        } else if let addition {
            Text(addition.stateText).font(.caption).foregroundStyle(addition.status == .missing ? AnyShapeStyle(.red) : AnyShapeStyle(.tint))
        } else if owned {
            Label("In your library", systemImage: "checkmark.circle.fill").labelStyle(InlineLabel()).font(.caption.weight(.semibold)).foregroundStyle(.tint)
        } else if let source = wish.sourceName {
            Text(source).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var accessory: some View {
        if adding {
            ProgressView().frame(width: 44, height: 44)
        } else if let addition, addition.status != .missing {
            if let song = addition.song {
                Button("Play \(wish.title)", systemImage: "play.fill") {
                    player.start([song])
                    played()
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
                .frame(minWidth: 44, minHeight: 44)
            } else if addition.canCheckAgain {
                CheckAgainButton(addition: addition)
            } else {
                AdditionMark(addition: addition)
            }
        } else {
            Button(addition == nil ? "Add" : "Retry", action: add)
                .font(.subheadline.bold())
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .disabled(busy)
                .frame(minHeight: 44)
                .accessibilityLabel("\(addition == nil ? "Add" : "Retry") \(wish.title)")
        }
    }
}

/// The one thing a link, or the best match for a name, would add.
struct MatchCard: View {
    let wish: Wish
    let addition: Addition?
    let owned: Bool
    let adding: Bool
    let busy: Bool
    let played: () -> Void
    let add: () -> Void
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        VStack(spacing: 20) {
            WishCover(wish: wish, size: 232)
                .shadow(color: .black.opacity(0.25), radius: 20, y: 10)
            VStack(spacing: 4) {
                Text(wish.title).font(.title2.bold())
                if !wish.artists.isEmpty {
                    Text(wish.artists.joined(separator: ", ")).font(.title3).foregroundStyle(.tint)
                }
                let facts = [wish.sourceName, wish.length].compactMap { $0 }.joined(separator: " · ")
                if !facts.isEmpty { Text(facts).font(.footnote).foregroundStyle(.secondary) }
                if owned, addition == nil {
                    Label("In your library", systemImage: "checkmark.circle.fill")
                        .labelStyle(InlineLabel())
                        .font(.footnote.weight(.semibold))
                        .padding(.top, 4)
                }
            }
            .multilineTextAlignment(.center)
            .accessibilityElement(children: .combine)
            action
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .contentShape(.rect)
        .modifier(RemoveMenu(addition: addition))
    }

    @ViewBuilder private var action: some View {
        if adding {
            button(add) {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Adding…")
                }
            }
            .disabled(true)
        } else if let addition, addition.status != .missing {
            if let song = addition.song {
                button({
                    player.start([song])
                    played()
                }) { Label("Play", systemImage: "play.fill") }
            } else {
                HStack(spacing: 12) {
                    AdditionMark(addition: addition)
                    Text(addition.stateText).font(.subheadline.weight(.semibold))
                }
                .frame(minHeight: 50)
                .accessibilityElement(children: .combine)
                if addition.canCheckAgain { CheckAgainButton(addition: addition) }
            }
        } else {
            VStack(spacing: 10) {
                if let addition { Text(addition.stateText).font(.subheadline).foregroundStyle(.red) }
                button(add) { Label(addition == nil ? "Add to Library" : "Try Again", systemImage: addition == nil ? "plus" : "arrow.clockwise") }
                    .disabled(busy)
            }
        }
    }

    private func button(_ action: @escaping () -> Void, @ViewBuilder label: () -> some View) -> some View {
        Button(action: action) {
            label().labelStyle(InlineLabel()).font(.headline).frame(maxWidth: 280, minHeight: 28)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
    }
}

/// One added song: how far it is, then the library's copy to play.
struct AdditionRow: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var additions: AdditionsModel
    @EnvironmentObject private var player: PlayerModel
    let addition: Addition
    var played: () -> Void = {}
    @State private var failure: String?

    var body: some View {
        HStack(spacing: 14) {
            WishCover(wish: addition.wish, size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(addition.wish.title).font(.body.weight(.medium)).lineLimit(1)
                if !addition.wish.artists.isEmpty {
                    Text(addition.wish.artists.joined(separator: ", ")).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                Text(failure ?? addition.stateText)
                    .font(.caption)
                    .foregroundStyle(failure != nil || addition.status == .missing ? AnyShapeStyle(.red) : AnyShapeStyle(.secondary))
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            accessory
        }
        .contentShape(.rect)
        .alignmentGuide(.listRowSeparatorLeading) { _ in 70 }
        .modifier(RemoveMenu(addition: addition))
    }

    @ViewBuilder private var accessory: some View {
        if let song = addition.song {
            Button("Play", systemImage: "play.fill") {
                player.start([song])
                played()
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .frame(minWidth: 44, minHeight: 44)
        } else if addition.status == .missing {
            capsule("Retry") { retry() }
        } else if addition.canCheckAgain {
            CheckAgainButton(addition: addition)
        } else {
            AdditionMark(addition: addition)
        }
    }

    private func capsule(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.subheadline.bold())
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .disabled(model.live == nil)
            .frame(minHeight: 44)
    }

    private func retry() {
        guard let client = model.live else { return }
        failure = nil
        Task {
            do { try await additions.add(addition.wish, input: addition.input, client: client) } catch { failure = error.localizedDescription }
        }
    }
}

/// Looks for a placed song the library didn't show in time.
private struct CheckAgainButton: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var additions: AdditionsModel
    let addition: Addition

    var body: some View {
        Button("Check Again") { additions.lookAgain(addition.id) }
            .font(.subheadline.bold())
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .disabled(model.live == nil)
            .frame(minHeight: 44)
    }
}

private struct RemoveMenu: ViewModifier {
    @EnvironmentObject private var additions: AdditionsModel
    let addition: Addition?

    func body(content: Content) -> some View {
        content.contextMenu {
            if let addition {
                Button("Remove from List", systemImage: "xmark") { additions.remove(addition.id) }
            }
        }
    }
}

/// Where an addition is, as a symbol: a ring that fills while Lyterion works.
private struct AdditionMark: View {
    let addition: Addition

    private static let steps: [String: (done: Double, symbol: String)] = [
        "queued": (0.08, "clock"), "resolving": (0.15, "magnifyingglass"), "searching": (0.35, "magnifyingglass"),
        "fetching": (0.65, "arrow.down"), "verifying": (0.85, "waveform"),
    ]

    var body: some View {
        Group {
            if addition.status == .review {
                Image(systemName: "hourglass").foregroundStyle(.secondary)
            } else if addition.status == .placed, !addition.unsettled {
                Image(systemName: "checkmark").font(.body.bold()).foregroundStyle(.tint)
            } else {
                // Placed and not in the library yet: all but done.
                let step = addition.status == .placed ? (done: 0.95, symbol: "arrow.triangle.2.circlepath") : Self.steps[addition.stage] ?? (done: 0.08, symbol: "clock")
                ZStack {
                    Circle().stroke(.quaternary, lineWidth: 3)
                    Circle().trim(from: 0, to: step.done)
                        .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: step.symbol).font(.caption.bold()).foregroundStyle(.tint)
                }
                .frame(width: 30, height: 30)
                .animation(.smooth, value: step.done)
            }
        }
        .frame(width: 44, height: 44)
        .accessibilityElement()
        .accessibilityLabel(addition.stateText)
    }
}

private struct WishCover: View {
    let wish: Wish
    var size: CGFloat = 64

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size > 100 ? 14 : 8, style: .continuous)
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.34))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.secondarySystemFill))
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay { shape.stroke(.primary.opacity(0.08), lineWidth: 0.5) }
        .accessibilityHidden(true)
    }

    private var image: UIImage? {
        #if DEBUG
        if DebugScreen.sample { return DebugScreen.art(wish.title + (wish.source ?? "")) }
        #endif
        guard let uri = wish.cover, let comma = uri.firstIndex(of: ","),
              let data = Data(base64Encoded: String(uri[uri.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
}

extension Wish {
    static let sourceNames = ["youtube": "YouTube", "soundcloud": "SoundCloud", "deezer": "Deezer", "search": "Picked when it starts"]

    fileprivate var sourceName: String? { source.flatMap { Self.sourceNames[$0] } }

    fileprivate var length: String? { (durationMs ?? 0) > 0 ? timeText((durationMs ?? 0) / 1000) : nil }

    fileprivate var details: String {
        [artists.isEmpty ? nil : artists.joined(separator: ", "), length].compactMap { $0 }.joined(separator: " · ")
    }
}

private extension Addition {
    var canCheckAgain: Bool { status == .placed && song == nil && !unsettled && !wish.artists.isEmpty }

    var stateText: String {
        switch status {
        case .working:
            let steps = ["resolving": "Looking it up", "queued": "Waiting its turn", "searching": "Finding a good copy",
                         "fetching": "Downloading", "verifying": "Checking it"]
            return steps[stage] ?? "Adding"
        case .placed:
            if song != nil { return "In your library" }
            if wish.artists.isEmpty { return "Added to your server" }
            return unsettled ? "Waiting for the library" : "Added, not in the library yet"
        case .review: return "Waiting for review in Lyterion"
        case .missing: return "No good copy found"
        }
    }
}
