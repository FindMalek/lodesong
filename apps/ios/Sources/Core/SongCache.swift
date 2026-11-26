import Foundation

/// Songs of the queue fetched whole. Temporary, iOS may clear it and a song leaves once the queue has moved
/// past it; kept, it stays until the size limit pushes it out. Never the user's downloads, which live elsewhere.
final class SongCache: @unchecked Sendable {
    static let temporary = URL.cachesDirectory.appending(path: "ahead")
    static let kept = URL.applicationSupportDirectory.appending(path: "cache")

    let folder: URL

    init(folder: URL) {
        self.folder = folder
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // It all comes back from the server, so it stays out of iCloud backups.
        var excluded = folder
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? excluded.setResourceValues(values)
    }

    /// Removes the oldest songs not in `ids` until the cache is no bigger than `limit`; zero is no limit.
    func trim(to limit: Int, keeping ids: [String]) {
        guard limit > 0 else { return }
        let wanted = Set(ids.map(DownloadLibrary.fileName))
        let files = names().map { name in
            let url = folder.appendingPathComponent(name)
            let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            return (name: name, url: url, size: values?.fileSize ?? 0, date: values?.contentModificationDate ?? .distantPast)
        }
        var total = files.reduce(0) { $0 + $1.size }
        for file in files.sorted(by: { $0.date < $1.date }) where total > limit && !wanted.contains(String(file.name.prefix { $0 != "." })) {
            try? FileManager.default.removeItem(at: file.url)
            total -= file.size
        }
    }

    /// Bytes of every file under `root`.
    static func size(of root: URL) -> Int {
        files(under: root).reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }

    /// Empties it for every account, leaving the folders for whoever is writing there.
    static func clear(_ root: URL) {
        for file in files(under: root) { try? FileManager.default.removeItem(at: file) }
    }

    private static func files(under root: URL) -> [URL] {
        let found = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])?.allObjects as? [URL] ?? []
        return found.filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
    }

    /// A copy of this song good enough for `bitRate` (zero is full quality); nil takes any, as when offline.
    /// A copy made under a limit is named `id.limit.kind`, a full one `id.kind`.
    func file(_ id: String, bitRate: Int? = nil) -> URL? {
        let prefix = "\(DownloadLibrary.fileName(id))."
        return names().first { name in
            guard name.hasPrefix(prefix) else { return false }
            let parts = name.split(separator: ".")
            guard let bitRate, parts.count == 3, let made = Int(parts[1]) else { return true }
            return bitRate > 0 && made >= bitRate
        }.map { folder.appendingPathComponent($0) }
    }

    /// Drops every song not in `ids`.
    func prune(keeping ids: [String]) {
        let wanted = Set(ids.map(DownloadLibrary.fileName))
        for name in names() where !wanted.contains(String(name.prefix { $0 != "." })) {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
    }

    /// One at a time, in queue order. Stops when the network does, or when `ids` alone fill the size limit.
    /// A conversion the server can't make in the first format is asked for in the next.
    func fill(_ songs: [Song], limit: Int, formats: [StreamFormat] = [.mp3], maxBytes: Int = 0, keeping ids: [String] = [], client: ServerClient, added: @Sendable () async -> Void) async {
        for song in songs where file(song.id, bitRate: limit) == nil {
            let suffix = song.suffix?.lowercased()
            let raw = limit == 0 && (suffix.map(AudioSource.native.contains) ?? true)
            for format in raw ? [.mp3] : formats {
                var request = URLRequest(url: client.streamURL(song: song.id, source: raw ? .original : .transcoded, bitRate: limit > 0 ? limit : 320, format: format))
                request.setValue("1", forHTTPHeaderField: "x-lodesong")
                do {
                    let (temporary, response) = try await client.session.download(for: request)
                    defer { try? FileManager.default.removeItem(at: temporary) }
                    if Task.isCancelled { return }
                    guard (response as? HTTPURLResponse)?.statusCode == 200,
                          let kind = DownloadLibrary.audioKind(temporary, suffix: raw ? suffix : nil) else { continue }
                    let name = DownloadLibrary.fileName(song.id)
                    let target = folder.appendingPathComponent(limit > 0 ? "\(name).\(limit).\(kind)" : "\(name).\(kind)")
                    // A copy not good enough any more gives way.
                    while let old = file(song.id) { try FileManager.default.removeItem(at: old) }
                    try FileManager.default.moveItem(at: temporary, to: target)
                    if !raw, DownloadLibrary.isShort(target, expected: song.duration) {
                        try? FileManager.default.removeItem(at: target)
                        continue
                    }
                    // The age the size limit goes by is when it was cached.
                    try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: target.path)
                    trim(to: maxBytes, keeping: ids)
                    if maxBytes > 0, Self.size(of: folder) > maxBytes {
                        try? FileManager.default.removeItem(at: target)
                        return
                    }
                    await added()
                    break
                } catch {
                    if !Task.isCancelled { AppLog.shared.add("Caching ahead stopped: \(error.localizedDescription)") }
                    return
                }
            }
        }
    }

    private func names() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    }
}
