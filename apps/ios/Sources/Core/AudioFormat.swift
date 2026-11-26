import Foundation

/// Which bytes of a song the player asks for. Matrix measured on iOS 27.2, see #671.
enum AudioSource: Equatable {
    /// The downloaded file.
    case file
    /// The file as it is on the server.
    case original
    /// MP3 made by the server on the way out.
    case transcoded

    /// iOS plays these as they are. Ogg Vorbis, WebM and WMA it does not; `ogg` can hold Opus or Vorbis,
    /// so it is tried as is and transcoded when that fails.
    static let native: Set<String> = ["mp3", "m4a", "m4b", "mp4", "aac", "alac", "flac", "wav", "aif", "aiff", "caf", "opus", "ogg", "oga"]

    /// The best source that has not failed yet, or nil when there is nothing left to try.
    /// `limited` asks the server for a smaller copy first; a downloaded file still wins.
    static func pick(suffix: String?, hasFile: Bool, limited: Bool = false, failed: [AudioSource]) -> AudioSource? {
        var choices: [AudioSource] = []
        if hasFile { choices.append(.file) }
        if limited { choices.append(.transcoded) }
        if suffix.map({ native.contains($0.lowercased()) }) ?? true { choices.append(.original) }
        choices.append(.transcoded)
        return choices.first { !failed.contains($0) }
    }

    /// iOS goes by the file extension, and will not open an Ogg file saved without one unless told the type.
    static func mimeType(file: URL, suffix: String?) -> String? {
        guard !native.contains(file.pathExtension.lowercased()) else { return nil }
        switch suffix?.lowercased() {
        case "opus", "ogg", "oga": return "audio/ogg"
        case "mp3": return "audio/mpeg"
        case "flac": return "audio/flac"
        case "m4a", "m4b", "mp4", "alac": return "audio/mp4"
        case "aac": return "audio/aac"
        case "wav": return "audio/wav"
        default: return nil
        }
    }
}

extension ServerClient {
    /// `raw` keeps byte ranges, which seeking needs. A transcode has none, so it asks for MP3, the format
    /// iOS plays from a stream of unknown length.
    func streamURL(song id: String, source: AudioSource, bitRate: Int = 320) -> URL {
        url("rest/stream", source == .transcoded ? ["id": id, "format": "mp3", "maxBitRate": String(bitRate)] : ["id": id, "format": "raw"])
    }
}

extension ReplayGain {
    /// The linear volume these tags ask for. Only ever turns down: a player can't go above full volume.
    func volume(album: Bool) -> Float {
        guard let decibels = album ? albumGain ?? trackGain : trackGain ?? albumGain, decibels.isFinite else { return 1 }
        var factor = pow(10, max(-24, min(24, decibels)) / 20)
        if let peak = album ? albumPeak ?? trackPeak : trackPeak ?? albumPeak, peak > 0 { factor = min(factor, 1 / peak) }
        return Float(min(1, factor))
    }
}
