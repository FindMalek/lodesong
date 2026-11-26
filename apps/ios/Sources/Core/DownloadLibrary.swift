import AVFoundation
import Foundation

enum DownloadQuality: Int, CaseIterable {
    case original = 0, high = 320, medium = 192, low = 128
}

struct DownloadRef: Codable, Hashable {
    enum Kind: String, Codable { case playlist, album }
    let kind: Kind
    let id: String
}

/// A playlist or album the user chose to keep, with its songs as of the last time the library had it.
struct KeptCollection: Codable, Identifiable {
    let ref: DownloadRef
    var name: String
    var songs: [Song]
    var onServer = true
    var id: DownloadRef { ref }
}

/// What is kept and which files are on the phone. Only a library that actually has a collection can change it,
/// so an unreachable server, a failed sync or an emptied library never costs a download.
final class DownloadLibrary: @unchecked Sendable {
    private struct Manifest: Codable {
        var collections: [KeptCollection] = []
        /// Song id to a path under `root`. Relative, because iOS moves the app's folder on updates and re-signing.
        var files: [String: String] = [:]
        /// Removed by hand, so downloading every playlist leaves them alone. Optional: older lists don't have it.
        var skipped: [DownloadRef]?
    }

    /// What iOS plays as it is. Anything else (Vorbis, WMA…) is asked for as mp3, `ogg` too: it may hold Vorbis.
    private static let playable: Set<String> = ["mp3", "m4a", "m4b", "mp4", "aac", "flac", "wav", "aif", "aiff", "caf", "opus"]

    /// Names this account's folder. Transfers carry it, so one account's file never lands in another's.
    var key: String { root.lastPathComponent }

    private let root: URL
    private var manifest = Manifest()
    private let lock = NSRecursiveLock()
    private var manifestURL: URL { root.appendingPathComponent("manifest.json") }

    /// Song and playlist ids are only unique within one server, so each server and user has its own folder.
    /// `server` is the account's main address: another way to reach the same server (home or away) must pass the same one.
    /// The scheme is left out, so moving to https keeps the downloads.
    static func folder(server: URL, user: String) -> String {
        let port = server.port.map { ":\($0)" } ?? ""
        return fileName("\((server.host ?? "").lowercased())\(port)\(server.path)|\(user.lowercased())")
    }

    init(root: URL) {
        self.root = root
        for name in ["files", "resume"] {
            try? FileManager.default.createDirectory(at: root.appendingPathComponent(name), withIntermediateDirectories: true)
        }
        var folder = root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
        guard let data = try? Data(contentsOf: manifestURL) else { return }
        do {
            manifest = try JSONDecoder().decode(Manifest.self, from: data)
        } catch {
            // Keep the unreadable list around instead of writing over it; the audio files stay where they are.
            try? FileManager.default.moveItem(at: manifestURL, to: root.appendingPathComponent("manifest-\(UUID().uuidString).bad"))
        }
        manifest.files = manifest.files.filter { FileManager.default.fileExists(atPath: root.appendingPathComponent($0.value).path) }
    }

    var collections: [KeptCollection] { locked { manifest.collections } }

    func keep(_ ref: DownloadRef, from store: LibraryStore) {
        locked {
            guard !manifest.collections.contains(where: { $0.ref == ref }), let found = Self.find(ref, in: store, songs: store.songs()) else { return }
            manifest.skipped?.removeAll { $0 == ref }
            manifest.collections.append(found)
            save()
        }
    }

    /// Keeps every playlist with songs in it, except the ones removed by hand.
    func keepPlaylists(from store: LibraryStore) {
        locked {
            let known = Set(manifest.collections.map(\.ref) + (manifest.skipped ?? []))
            let songs = store.songs()
            let added = store.playlists().compactMap { playlist -> KeptCollection? in
                let ref = DownloadRef(kind: .playlist, id: playlist.id)
                guard !known.contains(ref), let found = Self.find(ref, in: store, songs: songs), !found.songs.isEmpty else { return nil }
                return found
            }
            guard !added.isEmpty else { return }
            manifest.collections += added
            save()
        }
    }

    /// Every song with a file on the phone, once, by title.
    func downloaded() -> [Song] {
        locked {
            var seen = Set<String>()
            return manifest.collections.flatMap(\.songs)
                .filter { manifest.files[$0.id] != nil && seen.insert($0.id).inserted }
                .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        }
    }

    func remove(_ ref: DownloadRef) {
        locked {
            manifest.collections.removeAll { $0.ref == ref }
            manifest.skipped = (manifest.skipped ?? []).filter { $0 != ref } + [ref]
            sweep()
        }
    }

    /// Brings every kept collection in line with the library: new songs, removed songs, order.
    func reconcile(with store: LibraryStore) {
        locked {
            let songs = store.songs()
            guard !manifest.collections.isEmpty, !songs.isEmpty else { return }
            manifest.collections = manifest.collections.map { kept in
                if let found = Self.find(kept.ref, in: store, songs: songs) { return found }
                // Gone from the server (or renamed ids after a rescan): the files stay until the user removes them.
                var missing = kept
                missing.onServer = false
                return missing
            }
            sweep()
        }
    }

    /// Songs some kept collection needs and the phone doesn't have, in playlist order.
    func pending() -> [Song] {
        locked {
            var seen = Set(manifest.files.keys)
            return manifest.collections.flatMap(\.songs).filter { seen.insert($0.id).inserted }
        }
    }

    func progress(_ ref: DownloadRef) -> (done: Int, total: Int)? {
        locked {
            guard let kept = manifest.collections.first(where: { $0.ref == ref }) else { return nil }
            let ids = Set(kept.songs.map(\.id))
            return (ids.filter { manifest.files[$0] != nil }.count, ids.count)
        }
    }

    func bytes(_ ref: DownloadRef) -> Int {
        locked { size(of: Set(manifest.collections.first { $0.ref == ref }?.songs.map(\.id) ?? [])) }
    }

    /// Everything on the phone; a song in two playlists counts once.
    func totalBytes() -> Int {
        locked { size(of: Set(manifest.files.keys)) }
    }

    func localURL(song id: String) -> URL? {
        locked {
            guard let path = manifest.files[id] else { return nil }
            let url = root.appendingPathComponent(path)
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
    }

    /// Takes a finished transfer. Only real audio is kept: an error page or a Subsonic error is refused.
    @discardableResult
    func accept(song id: String, file: URL, status: Int, requested: URL) -> Bool {
        locked {
            let raw = URLComponents(url: requested, resolvingAgainstBaseURL: false)?.queryItems?.contains { $0.name == "format" && $0.value == "raw" } ?? false
            guard status == 200 || status == 206,
                  let song = manifest.collections.lazy.flatMap(\.songs).first(where: { $0.id == id }),
                  // A transcode is never in the source's format, whatever its first bytes leave open.
                  let kind = Self.audioKind(file, suffix: raw ? song.suffix?.lowercased() : nil) else { return false }
            let path = "files/\(Self.fileName(id)).\(kind)"
            let target = root.appendingPathComponent(path)
            try? FileManager.default.removeItem(at: target)
            do { try FileManager.default.moveItem(at: file, to: target) } catch { return false }
            // A transcode that stopped early can still end cleanly. A raw file is checked by its length in transit.
            if !raw, Self.isShort(target, expected: song.duration) {
                try? FileManager.default.removeItem(at: target)
                return false
            }
            manifest.files[id] = path
            save()
            return true
        }
    }

    func resumeData(song id: String) -> Data? { try? Data(contentsOf: resumeURL(id)) }

    func setResumeData(_ data: Data?, song id: String) {
        guard let data else {
            try? FileManager.default.removeItem(at: resumeURL(id))
            return
        }
        try? data.write(to: resumeURL(id), options: .atomic)
    }

    /// `original` keeps the file as it is on the server when iOS can play it.
    static func url(_ song: Song, quality: DownloadQuality, client: ServerClient) -> URL {
        if quality == .original, playable.contains(song.suffix?.lowercased() ?? "") {
            return client.url("rest/stream", ["id": song.id, "format": "raw"])
        }
        let bitRate = quality == .original ? DownloadQuality.high : quality
        return client.url("rest/stream", ["id": song.id, "format": "mp3", "maxBitRate": String(bitRate.rawValue)])
    }

    /// Only says yes when the file's length can be read and is clearly less than the song's.
    static func isShort(_ file: URL, expected: Int?) -> Bool {
        guard let expected, expected > 0, let audio = try? AVAudioFile(forReading: file) else { return false }
        return Double(audio.length) / audio.fileFormat.sampleRate < Double(expected) * 0.9 - 2
    }

    /// The extension the file should have, read from its first bytes: the player goes by the extension.
    static func audioKind(_ file: URL, suffix: String?) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
        defer { try? handle.close() }
        let head = [UInt8]((try? handle.read(upToCount: 4096)) ?? Data())
        guard head.count >= 12 else { return nil }
        func text(_ at: Int, _ value: String) -> Bool { head[at..<at + value.utf8.count].elementsEqual(value.utf8) }
        if text(0, "ID3") { return suffix == "flac" || suffix == "aac" ? suffix : "mp3" }
        if text(0, "fLaC") { return "flac" }
        if text(0, "RIFF"), text(8, "WAVE") { return "wav" }
        if text(0, "FORM"), text(8, "AIF") { return "aiff" }
        if text(4, "ftyp") { return "m4a" }
        if text(0, "caff") { return "caf" }
        // Ogg only when it holds Opus: iOS can't open Vorbis.
        if head.count >= 36, text(0, "OggS"), text(28, "OpusHead") { return "opus" }
        // A bare MPEG or ADTS frame, sometimes after zero padding.
        guard let start = head.firstIndex(where: { $0 != 0 }), start + 1 < head.count, head[start] == 0xFF, head[start + 1] & 0xE0 == 0xE0 else { return nil }
        return head[start + 1] & 0xF6 == 0xF0 ? "aac" : "mp3"
    }

    private static func find(_ ref: DownloadRef, in store: LibraryStore, songs: [Song]) -> KeptCollection? {
        switch ref.kind {
        case .playlist:
            guard let playlist = store.playlists().first(where: { $0.id == ref.id }) else { return nil }
            let entries = store.entries(playlist: ref.id)
            // The server counts songs but none are stored: not synced yet, which is no reason to delete.
            guard !entries.isEmpty || (playlist.songCount ?? 0) == 0 else { return nil }
            return KeptCollection(ref: ref, name: playlist.name, songs: entries)
        case .album:
            let tracks = songs.filter { $0.albumId == ref.id }.sorted { ($0.discNumber ?? 1, $0.track ?? 0) < ($1.discNumber ?? 1, $1.track ?? 0) }
            guard !tracks.isEmpty else { return nil }
            let name = store.albums().first { $0.id == ref.id }?.name ?? tracks[0].album ?? "Album"
            return KeptCollection(ref: ref, name: name, songs: tracks)
        }
    }

    static func fileName(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id
    }

    private func resumeURL(_ id: String) -> URL { root.appendingPathComponent("resume/\(Self.fileName(id))") }

    private func size(of ids: Set<String>) -> Int {
        ids.compactMap { manifest.files[$0] }.reduce(0) { total, path in
            total + ((try? root.appendingPathComponent(path).resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    /// Deletes the files no kept collection needs any more. The list is saved first, so a crash leaves a stray file, never a missing one.
    private func sweep() {
        let wanted = Set(manifest.collections.flatMap(\.songs).map(\.id))
        let unwanted = manifest.files.filter { !wanted.contains($0.key) }
        for id in unwanted.keys { manifest.files[id] = nil }
        save()
        for (id, path) in unwanted {
            try? FileManager.default.removeItem(at: root.appendingPathComponent(path))
            setResumeData(nil, song: id)
        }
    }

    private func save() {
        try? JSONEncoder().encode(manifest).write(to: manifestURL, options: .atomic)
    }

    private func locked<Value>(_ work: () -> Value) -> Value {
        lock.lock()
        defer { lock.unlock() }
        return work()
    }
}
