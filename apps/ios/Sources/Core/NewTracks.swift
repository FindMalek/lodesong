/// What a sync added to the downloaded playlists.
struct NewTracks: Equatable {
    let playlist: String
    let name: String
    let count: Int

    static func found(before: [KeptCollection], after: [KeptCollection]) -> [NewTracks] {
        after.compactMap { kept in
            guard kept.ref.kind == .playlist, let old = before.first(where: { $0.ref == kept.ref }) else { return nil }
            let added = Set(kept.songs.map(\.id)).subtracting(old.songs.map(\.id))
            return added.isEmpty ? nil : NewTracks(playlist: kept.ref.id, name: kept.name, count: added.count)
        }
    }
}
