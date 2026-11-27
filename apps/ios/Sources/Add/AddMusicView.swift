import SwiftUI

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
    @FocusState private var typing: Bool
    @State private var text: String
    @State private var asked: Asked
    @State private var found: Candidates?
    @State private var preview: Wish?
    @State private var owned: [Wish] = []
    @State private var adding: String?
    @State private var failure: Failure?
    /// Kept apart from `failure`, which is about the search.
    @State private var addFailure: String?

    private struct Asked: Equatable {
        var input: String
        /// A link, or "None of These": straight to the one thing that would be added.
        var best: Bool
        var attempt = 0

        init(_ raw: String) {
            input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            best = Asked.isLink(input)
        }

        static func isLink(_ input: String) -> Bool {
            input.range(of: #"(?i)^\s*https?://\S+\s*$"#, options: .regularExpression) != nil
        }
    }

    private struct Failure {
        var message: String
        /// The server couldn't be reached at all.
        var connection: Bool
    }

    private struct OwnedKey: Equatable {
        var shown: [Wish]
        var revision: Int
    }

    init(input: String) {
        _text = State(initialValue: input)
        _asked = State(initialValue: Asked(input))
    }

    private var shown: [Wish] { preview.map { [$0] } ?? found?.candidates ?? [] }

    /// What the results above don't already show.
    private var earlier: [Addition] {
        let above = Set(shown.map { $0.input ?? asked.input })
        return additions.items.filter { !above.contains($0.input) }
    }

    var body: some View {
        NavigationStack {
            List {
                content
                if !earlier.isEmpty {
                    heading("Recent Additions")
                    ForEach(earlier) { addition in
                        AdditionRow(addition: addition, played: { dismiss() })
                            .swipeActions {
                                Button("Remove", systemImage: "xmark", role: .destructive) { additions.remove(addition.id) }
                            }
                    }
                }
            }
            .listStyle(.plain)
            .scrollDismissesKeyboard(.immediately)
            .safeAreaBar(edge: .top) { field }
            .navigationTitle("Add Music")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
            .task(id: asked) { await lookUp() }
            .task(id: OwnedKey(shown: shown, revision: model.libraryRevision)) { await findOwned() }
            .onAppear { typing = asked.input.isEmpty && additions.items.isEmpty }
        }
    }

    private var field: some View {
        HStack(spacing: 10) {
            Image(systemName: Asked.isLink(text) ? "link" : "magnifyingglass")
                .foregroundStyle(.secondary)
                .frame(width: 22)
                .accessibilityHidden(true)
            TextField("Song name or link", text: $text)
                .focused($typing)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit { ask() }
            if !text.isEmpty {
                Button("Clear", systemImage: "xmark.circle.fill") {
                    text = ""
                    typing = true
                }
                .labelStyle(.iconOnly)
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 44)
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .frame(minHeight: 48)
        .contentShape(.capsule)
        .onTapGesture { typing = true }
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    @ViewBuilder private var content: some View {
        if model.live == nil {
            offline
        } else if asked.input.count < 2 {
            if additions.items.isEmpty {
                placeholder {
                    ContentUnavailableView(
                        "Add to Your Library", systemImage: "waveform.badge.magnifyingglass",
                        description: Text("Search by name, or paste a link from YouTube, SoundCloud or Deezer.")
                    )
                }
            }
        } else if let preview {
            if let addFailure { banner(addFailure) }
            match(preview)
        } else if let found {
            if let addFailure { banner(addFailure) }
            if found.candidates.isEmpty { nothing(found) } else { matches(found) }
        } else if let failure {
            placeholder {
                ContentUnavailableView {
                    Label(failure.connection ? "No Connection" : "Couldn't Search", systemImage: failure.connection ? "wifi.exclamationmark" : "exclamationmark.magnifyingglass")
                } description: {
                    Text(failure.message)
                } actions: {
                    Button("Try Again") { asked.attempt += 1 }.buttonStyle(.glassProminent)
                }
            }
        } else {
            searching
        }
    }

    private var offline: some View {
        placeholder {
            ContentUnavailableView {
                Label("You're Offline", systemImage: "wifi.slash")
            } description: {
                Text("Adding music needs your server.")
            } actions: {
                if model.offlineMode {
                    Button("Go Online") {
                        model.offlineMode = false
                        asked.attempt += 1
                    }
                    .buttonStyle(.glassProminent)
                }
            }
        }
    }

    /// Rows in the shape of what is coming, so nothing jumps when it arrives.
    @ViewBuilder private var searching: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text(asked.best ? (Asked.isLink(asked.input) ? "Reading the link…" : "Finding the best match…") : "Searching…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .listRowSeparator(.hidden)
        ForEach(0..<(asked.best ? 1 : 4), id: \.self) { index in
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(.quaternary).frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 8) {
                    Capsule().fill(.quaternary).frame(width: index.isMultiple(of: 2) ? 170 : 130, height: 12)
                    Capsule().fill(.quaternary).frame(width: index.isMultiple(of: 2) ? 100 : 120, height: 10)
                }
            }
            .opacity(1 - Double(index) * 0.2)
            .phaseAnimator([1.0, 0.45]) { row, strength in row.opacity(strength) } animation: { _ in .easeInOut(duration: 0.8) }
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder private func matches(_ found: Candidates) -> some View {
        heading("Pick One")
        ForEach(Array(found.candidates.enumerated()), id: \.offset) { _, wish in
            let input = wish.input ?? asked.input
            WishRow(wish: wish, addition: additions.addition(input), owned: owned.contains(wish), adding: adding == input, busy: adding != nil, played: { dismiss() }) {
                add(wish, input: input)
            }
        }
        Button {
            asked.best = true
        } label: {
            Label("None of These, Find the Best Match", systemImage: "sparkle.magnifyingglass")
                .labelStyle(InlineLabel())
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .listRowSeparator(.hidden, edges: .bottom)
        unreachable(found.unreachable)
    }

    @ViewBuilder private func nothing(_ found: Candidates) -> some View {
        placeholder {
            ContentUnavailableView {
                Label("Nothing Found", systemImage: "magnifyingglass")
            } description: {
                Text("No match for “\(asked.input)”. Check the spelling, or paste a link.")
            } actions: {
                Button("Try the Best Match on YouTube") { asked.best = true }.buttonStyle(.glass)
            }
        }
        unreachable(found.unreachable)
    }

    private func match(_ wish: Wish) -> some View {
        MatchCard(wish: wish, addition: additions.addition(asked.input), owned: owned.contains(wish), adding: adding == asked.input, busy: adding != nil, played: { dismiss() }) {
            add(wish, input: asked.input)
        }
        .listRowSeparator(.hidden)
    }

    @ViewBuilder private func unreachable(_ names: [String]) -> some View {
        if !names.isEmpty {
            Label("Couldn't reach \(names.map { Wish.sourceNames[$0] ?? $0 }.joined(separator: " and ")).", systemImage: "exclamationmark.triangle")
                .labelStyle(InlineLabel())
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
        }
    }

    /// Above the matches, which stay there to tap again.
    private func banner(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.circle.fill")
            .labelStyle(InlineLabel())
            .font(.subheadline)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.red.opacity(0.1), in: .rect(cornerRadius: 16))
            .listRowSeparator(.hidden)
    }

    private func heading(_ title: String) -> some View {
        Text(title)
            .font(.title3.bold())
            .padding(.top, 8)
            .listRowSeparator(.hidden)
            .accessibilityAddTraits(.isHeader)
    }

    private func placeholder(@ViewBuilder _ view: () -> some View) -> some View {
        view()
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .listRowSeparator(.hidden)
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
        addFailure = nil
        owned = []
        guard asked.input.count >= 2, let client = model.live else { return }
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
        #if DEBUG
        // Lets a simulator run add the n-th match, which it can't tap.
        if let pick = ProcessInfo.processInfo.environment["LODESONG_ADD_PICK"].flatMap(Int.init),
           shown.indices.contains(pick), additions.addition(shown[pick].input ?? asked.input) == nil {
            add(shown[pick], input: shown[pick].input ?? asked.input)
        }
        #endif
    }

    private func findOwned() async {
        let wishes = shown
        let songs = model.library.songs
        guard !wishes.isEmpty else { return owned = [] }
        // A big library takes a moment to compare.
        let matched = await Task.detached { wishes.filter { wish in songs.contains { wish.isSame(as: $0) } } }.value
        if !Task.isCancelled { owned = matched }
    }

    private func add(_ wish: Wish, input: String) {
        guard let client = model.live else { return }
        adding = input
        addFailure = nil
        let search = asked
        Task {
            do {
                try await additions.add(wish, input: input, client: client)
                Haptic.done()
            } catch {
                checkSignIn(error)
                // A newer search has nothing to do with this one.
                if asked == search { addFailure = error.localizedDescription }
            }
            adding = nil
        }
    }

    private func report(_ error: Error) {
        checkSignIn(error)
        failure = Failure(message: error.localizedDescription, connection: error is URLError)
    }

    private func checkSignIn(_ error: Error) {
        if error as? ServerError == .signedOut { model.needsSignIn = true }
    }
}
