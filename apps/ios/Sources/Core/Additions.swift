import Foundation

// Music outside the library, added through lodesong's `/api/wishlist`, which hands it to Lyterion (docs/lyterion.md).

/// A song as Lyterion describes it before it is in the library.
struct Wish: Codable, Equatable {
    var title: String
    var artists: [String]
    var durationMs: Double?
    var source: String?
    /// What to send back to add this one. A preview has none: whatever was asked is sent.
    var input: String?
    /// A `data:` URI, inlined by the server.
    var cover: String?
}

struct Candidates: Decodable, Equatable {
    var candidates: [Wish]
    /// Sources that didn't answer, so their matches are missing.
    var unreachable: [String]
}

/// A song that was added, followed until the library has it.
struct Addition: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case working, placed, review, missing }

    /// Lyterion's recording id.
    let id: String
    let input: String
    var wish: Wish
    var status = Status.working
    var stage = "queued"
    /// The library's copy, once Navidrome has scanned it.
    var song: Song?
    var looks = 0

    /// Navidrome scans a little after the file is placed.
    static let maxLooks = 20

    var unsettled: Bool {
        status == .working || (status == .placed && song == nil && !wish.artists.isEmpty && looks < Self.maxLooks)
    }
}

extension ServerClient {
    /// The server decides who may add: Lyterion set up and not the public demo.
    func canAddMusic() async throws -> Bool {
        struct Session: Decodable { var lyterionAdd: Bool? }
        let (data, status) = try await send(URLRequest(url: url("auth/session")))
        if status == 401 { throw ServerError.signedOut }
        guard status == 200 else { throw ServerError.message("The server answered \(status).") }
        return try JSONDecoder().decode(Session.self, from: data).lyterionAdd == true
    }

    /// Matches for a typed name.
    func findMusic(_ name: String) async throws -> Candidates {
        try await wishlist("search", ["input": name])
    }

    /// What a link, or the best match for a name, would add.
    func previewMusic(_ input: String) async throws -> Wish {
        try await wishlist("preview", ["input": input])
    }

    func addMusic(_ wish: Wish, input: String) async throws -> Addition {
        struct Added: Decodable {
            let recordingId: String
            var meta: Wish?
        }
        let added: Added = try await wishlist("add", ["input": input])
        var meta = added.meta ?? wish
        meta.cover = wish.cover
        return Addition(id: added.recordingId, input: input, wish: meta)
    }

    /// One step further: Lyterion's state while it works, then a look for the file in the library.
    func advanced(_ addition: Addition) async throws -> Addition {
        struct State: Decodable {
            let status: String
            var stage: String?
        }
        var next = addition
        if next.status == .working {
            let state: State = try await wishlist("status", ["recordingId": next.id])
            next.stage = state.stage ?? next.stage
            // A scan moves `placed` on to these, which Lyterion may still answer as missing.
            next.status = ["linked", "existing"].contains(next.stage) ? .placed : Addition.Status(rawValue: state.status) ?? .missing
        }
        if next.status == .placed, next.song == nil, let artist = next.wish.artists.first {
            next.looks += 1
            // Both must match: a same-titled song by someone else is not the one just added.
            let wanted = (SearchText.normalize(next.wish.title), SearchText.normalize(artist))
            next.song = try? await songs(matching: "\(artist) \(next.wish.title)").first {
                (SearchText.normalize($0.title), SearchText.normalize($0.artist ?? "")) == wanted
            }
        }
        return next
    }

    private func wishlist<Answer: Decodable>(_ step: String, _ body: [String: String]) async throws -> Answer {
        var request = URLRequest(url: url("api/wishlist/\(step)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, status) = try await send(request)
        if status == 401 { throw ServerError.signedOut }
        guard status == 200 else {
            let reason = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw ServerError.message(reason ?? "The server answered \(status).")
        }
        return try JSONDecoder().decode(Answer.self, from: data)
    }
}
