import Foundation

/// A stored order of sections, with any it doesn't name at the end.
func storedOrder<Section: RawRepresentable & CaseIterable & Hashable>(_ raw: String) -> [Section] where Section.RawValue == String {
    var seen = Set<Section>()
    let named = raw.split(separator: ",").compactMap { Section(rawValue: String($0)) }.filter { seen.insert($0).inserted }
    return named + Section.allCases.filter { !seen.contains($0) }
}

/// What an artist's releases are split into, by what the server tagged them as. Matches the web player.
enum ReleaseKind: String, CaseIterable {
    case album, ep, single, live, compilation, other

    var title: String {
        switch self {
        case .album: return "Albums"
        case .ep: return "EPs"
        case .single: return "Singles"
        case .live: return "Live"
        case .compilation: return "Compilations"
        case .other: return "Other Releases"
        }
    }
}

extension Album {
    var releaseKind: ReleaseKind {
        let types = (releaseTypes ?? []).map { $0.lowercased() }
        if isCompilation == true || types.contains("compilation") { return .compilation }
        if types.contains("live") { return .live }
        if types.contains("single") { return .single }
        if types.contains("ep") { return .ep }
        return types.isEmpty || types.contains("album") ? .album : .other
    }
}

extension Song {
    var genreNames: [String] {
        let named = (genres ?? []).map(\.name).filter { !$0.isEmpty }
        return named.isEmpty ? [genre].compactMap { $0 }.filter { !$0.isEmpty } : named
    }
}

/// Every genre of these songs by name, with its songs. A song with several is in each.
func genreList(_ songs: [Song]) -> [(name: String, songs: [Song])] {
    var found: [String: [Song]] = [:]
    for song in songs {
        for name in Set(song.genreNames) { found[name, default: []].append(song) }
    }
    return found.keys.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.map { ($0, found[$0]!) }
}

/// A server's biography is a bit of HTML that ends in a "Read more" link.
func plainBiography(_ html: String) -> String {
    var text = html.replacingOccurrences(of: #"(?s)<a [^>]*>.*?</a>\.?"#, with: "", options: .regularExpression)
    text = text.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
    for (entity, character) in [("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", " "), ("&amp;", "&")] {
        text = text.replacingOccurrences(of: entity, with: character)
    }
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
}

struct MusicFolder: Identifiable, Hashable {
    let id: String
    let name: String
}

/// The one music folder being browsed, and which songs the server says are in it.
struct FolderChoice: Codable, Equatable {
    let id: String
    let name: String
    var songs: [String]
}
