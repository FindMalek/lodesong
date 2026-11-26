import SwiftUI
import UIKit

/// What the add sheet opens with.
struct AddRequest: Identifiable {
    let input: String
    var id: String { input }
}

/// Finds music outside the library by name or link and adds it.
struct AddMusicView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var additions: AdditionsModel
    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @State private var asked: Asked
    @State private var found: Candidates?
    @State private var preview: Wish?
    @State private var busy = false
    @State private var adding: String?
    @State private var failure: String?

    private struct Asked: Equatable {
        var input: String
        /// A link, or "None of These": straight to the one thing that would be added.
        var best: Bool
        var attempt = 0

        init(_ raw: String) {
            input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            best = input.range(of: #"(?i)^https?://\S+$"#, options: .regularExpression) != nil
        }
    }

    init(input: String) {
        _text = State(initialValue: input)
        _asked = State(initialValue: Asked(input))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Song name or link", text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { ask() }
                } footer: {
                    Text("A name, or a YouTube, SoundCloud or Deezer link.")
                }
                results
                if !additions.items.isEmpty {
                    Section("Added") {
                        ForEach(additions.items) { AdditionRow(addition: $0, played: { dismiss() }) }
                    }
                }
            }
            .navigationTitle("Add Music")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
            .task(id: asked) { await lookUp() }
        }
    }

    @ViewBuilder private var results: some View {
        if busy {
            HStack(spacing: 12) {
                ProgressView()
                Text("Looking…").foregroundStyle(.secondary)
            }
        } else if let preview {
            Section("Match") { row(preview, input: asked.input) }
        } else if let found {
            Section {
                ForEach(Array(found.candidates.enumerated()), id: \.offset) { _, wish in
                    row(wish, input: wish.input ?? asked.input)
                }
                Button(found.candidates.isEmpty ? "Try the Best Match on YouTube" : "None of These, Find the Best Match") {
                    asked.best = true
                }
            } header: {
                Text(found.candidates.isEmpty ? "Nothing Found" : "Pick One")
            } footer: {
                if !found.unreachable.isEmpty { Text("Couldn't reach \(found.unreachable.joined(separator: " and ")).") }
            }
        }
        if let failure {
            Section {
                Text(failure).foregroundStyle(.red)
                // A failed add leaves the matches there to tap again.
                if found == nil, preview == nil { Button("Try Again") { asked.attempt += 1 } }
            }
        }
    }

    private func row(_ wish: Wish, input: String) -> some View {
        let addition = additions.addition(input)
        return HStack(spacing: 12) {
            WishCover(wish: wish)
            VStack(alignment: .leading, spacing: 2) {
                Text(wish.title).lineLimit(2)
                Text(details(wish)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                if let source = wish.source.flatMap({ Self.sources[$0] }) {
                    Text(source).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if adding == input {
                ProgressView()
            } else if let addition, addition.status != .missing {
                Image(systemName: addition.status == .working ? "clock" : "checkmark")
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(addition.status == .working ? "Being added" : "Added")
            } else {
                Button("Add") { add(wish, input: input) }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .disabled(adding != nil)
                    .accessibilityLabel("Add \(wish.title)")
            }
        }
    }

    private static let sources = ["youtube": "YouTube", "soundcloud": "SoundCloud", "deezer": "Deezer", "search": "Picked when it starts"]

    private func details(_ wish: Wish) -> String {
        [
            wish.artists.isEmpty ? nil : wish.artists.joined(separator: ", "),
            (wish.durationMs ?? 0) > 0 ? timeText((wish.durationMs ?? 0) / 1000) : nil,
        ].compactMap { $0 }.joined(separator: " · ")
    }

    private func ask() {
        var next = Asked(text)
        next.attempt = asked.attempt + 1
        asked = next
    }

    private func lookUp() async {
        let asked = asked
        found = nil
        preview = nil
        failure = nil
        busy = false
        guard asked.input.count >= 2, let client = model.live else { return }
        busy = true
        do {
            if asked.best {
                let answer = try await client.previewMusic(asked.input)
                try Task.checkCancellation()
                preview = answer
            } else {
                let answer = try await client.findMusic(asked.input)
                try Task.checkCancellation()
                found = answer
            }
        } catch {
            if Task.isCancelled { return }
            report(error)
        }
        busy = false
        #if DEBUG
        // Lets a simulator run add the n-th match, which it can't tap.
        if let pick = ProcessInfo.processInfo.environment["LODESONG_ADD_PICK"].flatMap(Int.init),
           let list = found?.candidates, list.indices.contains(pick), additions.addition(list[pick].input ?? asked.input) == nil {
            add(list[pick], input: list[pick].input ?? asked.input)
        }
        #endif
    }

    private func add(_ wish: Wish, input: String) {
        guard let client = model.live else { return }
        adding = input
        failure = nil
        Task {
            do {
                try await additions.add(wish, input: input, client: client)
                Haptic.done()
            } catch {
                report(error)
            }
            adding = nil
        }
    }

    private func report(_ error: Error) {
        if error as? ServerError == .signedOut { model.needsSignIn = true }
        failure = error.localizedDescription
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
        HStack(spacing: 12) {
            WishCover(wish: addition.wish)
            VStack(alignment: .leading, spacing: 2) {
                Text(addition.wish.title).lineLimit(1)
                Text(failure ?? state).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            if let song = addition.song {
                Button("Play", systemImage: "play.fill") {
                    player.start([song])
                    played()
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .frame(minWidth: 44, minHeight: 44)
            } else if addition.unsettled {
                ProgressView()
            } else if addition.status == .missing {
                Button("Retry") { retry() }.buttonStyle(.borderless)
            } else if addition.status == .placed, !addition.wish.artists.isEmpty {
                Button("Check Again") { additions.lookAgain(addition.id) }.buttonStyle(.borderless)
            }
        }
        .contentShape(.rect)
        .contextMenu {
            Button("Remove from List", systemImage: "xmark") { additions.remove(addition.id) }
        }
    }

    private var state: String {
        switch addition.status {
        case .working:
            let steps = ["resolving": "Looking it up", "queued": "Waiting its turn", "searching": "Finding a good copy",
                         "fetching": "Downloading", "verifying": "Checking it"]
            return steps[addition.stage] ?? "Adding"
        case .placed:
            if addition.song != nil { return "In your library" }
            if addition.wish.artists.isEmpty { return "Added to your server" }
            return addition.unsettled ? "Waiting for the library" : "Added, not in the library yet"
        case .review: return "Waiting for review in Lyterion"
        case .missing: return "No good copy found"
        }
    }

    private func retry() {
        guard let client = model.live else { return }
        failure = nil
        Task {
            do { try await additions.add(addition.wish, input: addition.input, client: client) } catch { failure = error.localizedDescription }
        }
    }
}

private struct WishCover: View {
    let wish: Wish

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "music.note").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.quaternary)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(.rect(cornerRadius: 6))
        .accessibilityHidden(true)
    }

    private var image: UIImage? {
        guard let uri = wish.cover, let comma = uri.firstIndex(of: ","),
              let data = Data(base64Encoded: String(uri[uri.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
}
