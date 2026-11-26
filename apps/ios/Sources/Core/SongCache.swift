import Foundation

/// The next few songs of the queue, fetched whole before their turn. Temporary: iOS may clear it,
/// and a song leaves once the queue has moved past it.
final class SongCache: @unchecked Sendable {
    let folder: URL

    init(folder: URL) {
        self.folder = folder
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    /// The copy of this song made at this bit rate, zero being the file as it is.
    func file(_ id: String, limit: Int) -> URL? {
        let prefix = "\(limit)-\(DownloadLibrary.fileName(id))."
        return names().first { $0.hasPrefix(prefix) }.map { folder.appendingPathComponent($0) }
    }

    /// Drops every copy but those of `ahead` at this bit rate, and any of the song now on.
    func prune(ahead: [String], current: String?, limit: Int) {
        let wanted = ahead.map { "\(limit)-\(DownloadLibrary.fileName($0))" }
        let now = current.map(DownloadLibrary.fileName)
        for name in names() {
            let stem = String(name.prefix { $0 != "." })
            if wanted.contains(stem) || String(stem.drop { $0 != "-" }.dropFirst()) == now { continue }
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
    }

    /// One at a time, in queue order. Stops when the network does.
    func fill(_ songs: [Song], limit: Int, client: ServerClient, added: @Sendable () async -> Void) async {
        for song in songs where file(song.id, limit: limit) == nil {
            let suffix = song.suffix?.lowercased()
            let raw = limit == 0 && (suffix.map(AudioSource.native.contains) ?? true)
            var request = URLRequest(url: client.streamURL(song: song.id, source: raw ? .original : .transcoded, bitRate: limit > 0 ? limit : 320))
            request.setValue("1", forHTTPHeaderField: "x-lodesong")
            do {
                let (temporary, response) = try await client.session.download(for: request)
                defer { try? FileManager.default.removeItem(at: temporary) }
                if Task.isCancelled { return }
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      let kind = DownloadLibrary.audioKind(temporary, suffix: raw ? suffix : nil) else { continue }
                let target = folder.appendingPathComponent("\(limit)-\(DownloadLibrary.fileName(song.id)).\(kind)")
                try FileManager.default.moveItem(at: temporary, to: target)
                if !raw, DownloadLibrary.isShort(target, expected: song.duration) {
                    try? FileManager.default.removeItem(at: target)
                    continue
                }
                await added()
            } catch {
                if !Task.isCancelled { AppLog.shared.add("Caching ahead stopped: \(error.localizedDescription)") }
                return
            }
        }
    }

    private func names() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    }
}
