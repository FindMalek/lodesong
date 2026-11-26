import SwiftUI

/// Pick a playlist for these songs, or make one for them.
struct AddToPlaylistView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let songs: [Song]
    @State private var filter = ""
    @State private var adding: String?
    @State private var creating = false

    private var playlists: [Playlist] {
        let mine = model.library.playlists.filter { $0.editable(by: model.user) && (filter.isEmpty || $0.name.localizedStandardContains(filter)) }
        return PlaylistSort.updated.sorted(mine, name: \.name)
    }

    var body: some View {
        NavigationStack {
            List {
                if !model.canEdit { EditingOffline() }
                Section {
                    Button("New Playlist…", systemImage: "plus") { creating = true }
                }
                Section {
                    ForEach(playlists) { playlist in
                        Button { choose(playlist) } label: {
                            HStack(spacing: 12) {
                                PlaylistCover(playlist: playlist, size: 120, radius: 6).frame(width: 48, height: 48)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(playlist.name).lineLimit(1)
                                    Text(playlist.songCount == 1 ? "1 song" : "\(playlist.songCount ?? 0) songs").font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                if adding == playlist.id { ProgressView() }
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                } footer: {
                    Text("Smart, read-only and other people's playlists aren't listed.")
                }
            }
            .disabled(!model.canEdit || adding != nil)
            .searchable(text: $filter, prompt: "Find a Playlist")
            .navigationTitle(songs.count == 1 ? "Add to Playlist" : "Add \(songs.count) Songs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", systemImage: "xmark") { dismiss() } } }
            .navigationDestination(isPresented: $creating) {
                PlaylistForm(playlist: nil, songs: songs, done: { dismiss() })
            }
        }
    }

    private func choose(_ playlist: Playlist) {
        let there = Set(model.entries(playlist: playlist.id).map(\.id))
        let again = songs.filter { there.contains($0.id) }.count
        guard again > 0 else { return add(playlist) }
        let message = songs.count == 1 ? "This song is already in “\(playlist.name)”." : "\(again) of these songs are already in “\(playlist.name)”."
        Popup.show("Add Again?", message: message, action: "Add") { add(playlist) }
    }

    private func add(_ playlist: Playlist) {
        adding = playlist.id
        Task {
            defer { adding = nil }
            do {
                let ids = songs.map(\.id)
                try await model.editPlaylists(playlist.id) { try await $0.addToPlaylist(playlist.id, songs: ids); return nil }
                Haptic.done()
                dismiss()
            } catch {
                Popup.show("Can't Add", message: error.localizedDescription)
            }
        }
    }
}

private struct EditingOffline: View {
    var body: some View {
        Label("You're offline. Playlists can be changed once your server is reachable.", systemImage: "wifi.slash")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
}

struct PlaylistEditorView: View {
    @Environment(\.dismiss) private var dismiss
    /// Nil makes a new one.
    let playlist: Playlist?
    var songs: [Song] = []

    var body: some View {
        NavigationStack {
            PlaylistForm(playlist: playlist, songs: songs, cancellable: true, done: { dismiss() })
        }
    }
}

/// Name, description, who sees it and the songs in order. Nothing is sent until Save.
private struct PlaylistForm: View {
    /// A place in the list, so the same song twice stays two rows.
    private struct Entry: Identifiable {
        let id = UUID()
        let song: Song
    }

    @EnvironmentObject private var model: AppModel
    let playlist: Playlist?
    var cancellable = false
    let done: () -> Void
    @State private var name: String
    @State private var comment: String
    @State private var isPublic: Bool
    @State private var entries: [Entry]
    /// The song ids the edit started from.
    @State private var original: [String]
    @State private var saving = false
    @State private var discarding = false

    init(playlist: Playlist?, songs: [Song], cancellable: Bool = false, done: @escaping () -> Void) {
        self.playlist = playlist
        self.cancellable = cancellable
        self.done = done
        _name = State(initialValue: playlist?.name ?? "")
        _comment = State(initialValue: playlist?.comment ?? "")
        _isPublic = State(initialValue: playlist?.public ?? false)
        _entries = State(initialValue: songs.map { Entry(song: $0) })
        _original = State(initialValue: songs.map(\.id))
    }

    private var title: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var ids: [String] { entries.map(\.song.id) }

    private var changed: Bool {
        guard let playlist else { return !title.isEmpty || !comment.isEmpty }
        return name != playlist.name || comment != playlist.comment ?? "" || isPublic != playlist.public ?? false || ids != original
    }

    var body: some View {
        List {
            if !model.canEdit { EditingOffline() }
            Section {
                TextField("Playlist Name", text: $name).font(.headline)
                TextField("Description", text: $comment, axis: .vertical).lineLimit(1...4)
            }
            Section {
                Toggle("Public Playlist", isOn: $isPublic)
            } footer: {
                Text("Everyone with an account on this server can see and play a public playlist.")
            }
            if !entries.isEmpty {
                Section(entries.count == 1 ? "1 Song" : "\(entries.count) Songs") {
                    ForEach(entries) { entry in
                        HStack(spacing: 12) {
                            Artwork(id: entry.song.coverArt, size: 120, radius: 6).frame(width: 40, height: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.song.title).lineLimit(1)
                                Text(entry.song.artist ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                    // A new playlist takes the songs it was made for; only an existing one is rearranged.
                    .onMove(perform: playlist == nil ? nil : { entries.move(fromOffsets: $0, toOffset: $1) })
                    .onDelete(perform: playlist == nil ? nil : { entries.remove(atOffsets: $0) })
                }
            }
            if let playlist {
                Section {
                    Button("Delete Playlist", role: .destructive) { PlaylistActions.delete(playlist, model: model, then: done) }
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .disabled(!model.canEdit || saving)
        .navigationTitle(playlist == nil ? "New Playlist" : "Edit Playlist")
        .navigationBarTitleDisplayMode(.inline)
        // A swipe must not throw the changes away.
        .interactiveDismissDisabled(changed || saving)
        .toolbar {
            if cancellable {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { if changed { discarding = true } else { done() } }
                        .disabled(saving)
                        .confirmationDialog("Discard your changes?", isPresented: $discarding, titleVisibility: .visible) {
                            Button("Discard Changes", role: .destructive, action: done)
                        }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView()
                } else {
                    Button(playlist == nil ? "Create" : "Save", systemImage: "checkmark", action: confirm)
                        .disabled(title.isEmpty || !model.canEdit || (playlist != nil && !changed))
                }
            }
        }
    }

    private func confirm() {
        let removed = playlist == nil ? 0 : original.count - entries.count
        guard removed > 0 else { return save() }
        Popup.show(removed == 1 ? "Remove 1 Song?" : "Remove \(removed) Songs?", message: "They stay in your library.", action: "Remove", destructive: true, perform: save)
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                var unfinished: Error?
                if let playlist { try await update(playlist) } else { unfinished = try await create() }
                Haptic.done()
                done()
                if let unfinished {
                    // An alert shown while the sheet is still closing would go with it.
                    try? await Task.sleep(for: .seconds(0.7))
                    Popup.show("Created Without Details", message: unfinished.localizedDescription)
                }
            } catch PlaylistEditError.changedElsewhere {
                // The library has just been refreshed: start the songs over from what is there now.
                let fresh = playlist.map { model.entries(playlist: $0.id) } ?? []
                entries = fresh.map { Entry(song: $0) }
                original = fresh.map(\.id)
                Popup.show("Can't Save", message: PlaylistEditError.changedElsewhere.localizedDescription)
            } catch let error as PlaylistEditError where error != .hiddenSongs {
                // The server has these songs now, so the next save starts from them.
                original = ids
                Popup.show("Songs Saved", message: error.localizedDescription)
            } catch {
                Popup.show("Can't Save", message: error.localizedDescription)
            }
        }
    }

    private func update(_ playlist: Playlist) async throws {
        let (old, new) = (original, ids)
        let rename = title == playlist.name ? nil : title
        let description = comment == playlist.comment ?? "" ? nil : comment
        let visibility = isPublic == playlist.public ?? false ? nil : isPublic
        try await model.editPlaylists(playlist.id) { client in
            try await client.savePlaylist(playlist.id, from: old, to: new, name: rename, comment: description, isPublic: visibility)
            return nil
        }
    }

    /// Answers what went wrong after the playlist was made.
    private func create() async throws -> Error? {
        var unfinished: Error?
        let (title, comment, isPublic, ids) = (title, comment, isPublic, ids)
        try await model.editPlaylists(nil) { client in
            let id = try await client.createPlaylist(name: title, songs: ids)
            if let id, !comment.isEmpty || isPublic {
                // The playlist exists now, so a failure here must not offer to create it again.
                do {
                    try await client.updatePlaylist(id, comment: comment.isEmpty ? nil : comment, isPublic: isPublic ? true : nil)
                } catch {
                    unfinished = error
                }
            }
            return id
        }
        return unfinished
    }
}
