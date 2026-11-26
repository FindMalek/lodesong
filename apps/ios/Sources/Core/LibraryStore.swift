import Foundation
import SQLite3

/// The library on the phone. Screens only read from here, so they work with no network.
final class LibraryStore: @unchecked Sendable {
    private var db: OpaquePointer?
    private let lock = NSRecursiveLock()
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(path: String) throws {
        guard sqlite3_open(path, &db) == SQLITE_OK else { throw ServerError.message("Can't open the library database.") }
        try run("create table if not exists item (kind text not null, parent text not null, pos integer not null, json blob not null, primary key (kind, parent, pos))")
    }

    deinit { sqlite3_close(db) }

    func artists() -> [Artist] { read("artist") }
    func albums() -> [Album] { read("album") }
    func songs() -> [Song] { read("song") }
    func playlists() -> [Playlist] { read("playlist") }
    func entries(playlist id: String) -> [Song] { read("entry", parent: id) }

    /// The `changed` stamp of every playlist whose songs are stored, so a sync only refetches the others.
    func playlistStamps() -> [String: String] {
        Dictionary(playlists().compactMap { list in list.changed.map { (list.id, $0) } }, uniquingKeysWith: { first, _ in first })
    }

    /// All or nothing: a failed write leaves the library as it was.
    func apply(_ snapshot: LibrarySnapshot) throws {
        lock.lock()
        defer { lock.unlock() }
        let gone = Set(playlists().map(\.id)).subtracting(snapshot.playlists.map(\.id))
        try run("begin")
        do {
            try replace("artist", with: snapshot.artists)
            try replace("album", with: snapshot.albums)
            try replace("song", with: snapshot.songs)
            try replace("playlist", with: snapshot.playlists)
            for (id, songs) in snapshot.entries { try replace("entry", parent: id, with: songs) }
            for id in gone { try replace("entry", parent: id, with: [Song]()) }
            try run("commit")
        } catch {
            try? run("rollback")
            throw error
        }
    }

    func clear() throws { try run("delete from item") }

    /// Replaces one kind of row, all or nothing.
    func save<Item: Encodable>(_ kind: String, _ items: [Item]) throws {
        lock.lock()
        defer { lock.unlock() }
        try run("begin")
        do {
            try replace(kind, with: items)
            try run("commit")
        } catch {
            try? run("rollback")
            throw error
        }
    }

    func load<Item: Decodable>(_ kind: String) -> [Item] { read(kind) }

    private func replace<Item: Encodable>(_ kind: String, parent: String = "", with items: [Item]) throws {
        try run("delete from item where kind = ? and parent = ?", [kind, parent])
        for (index, item) in items.enumerated() {
            try run("insert into item (kind, parent, pos, json) values (?, ?, ?, ?)", [kind, parent, index, try JSONEncoder().encode(item)])
        }
    }

    private func read<Item: Decodable>(_ kind: String, parent: String = "") -> [Item] {
        lock.lock()
        defer { lock.unlock() }
        guard let statement = try? prepare("select json from item where kind = ? and parent = ? order by pos", [kind, parent]) else { return [] }
        defer { sqlite3_finalize(statement) }
        var items: [Item] = []
        let decoder = JSONDecoder()
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let bytes = sqlite3_column_blob(statement, 0) else { continue }
            let data = Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
            if let item = try? decoder.decode(Item.self, from: data) { items.append(item) }
        }
        return items
    }

    private func prepare(_ sql: String, _ values: [Any]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw failure() }
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            switch value {
            case let text as String: sqlite3_bind_text(statement, index, text, -1, Self.transient)
            case let number as Int: sqlite3_bind_int64(statement, index, Int64(number))
            case let data as Data: _ = data.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32(data.count), Self.transient) }
            default: sqlite3_bind_null(statement, index)
            }
        }
        return statement
    }

    private func run(_ sql: String, _ values: [Any] = []) throws {
        lock.lock()
        defer { lock.unlock() }
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw failure() }
    }

    private func failure() -> ServerError { .message(String(cString: sqlite3_errmsg(db))) }
}
