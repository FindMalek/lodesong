import Foundation

/// "FLAC · 44.1 kHz · 1011 kbps": what is reaching the speaker.
enum StreamLine {
    /// `limit` is the bit rate a conversion was asked for. `fileType` and `fileBytes` describe a copy on the phone.
    static func text(_ song: Song, source: AudioSource, limit: Int, fileType: String? = nil, fileBytes: Int? = nil) -> String {
        let original = song.suffix?.uppercased()
        if source == .transcoded {
            return converted(original, min(limit, song.bitRate ?? limit))
        }
        if source == .file, let fileBytes, let seconds = song.duration, seconds > 0 {
            let rate = fileBytes * 8 / seconds / 1000
            // A download or a cached copy that was converted is always MP3, and of a smaller size or another type.
            let smaller = song.bitRate.map { rate < $0 * 4 / 5 } ?? false
            if smaller || (fileType?.lowercased() == "mp3" && original != nil && original != "MP3") {
                let usual = [64, 96, 128, 160, 192, 256, 320].min { abs($0 - rate) < abs($1 - rate) }!
                return converted(original, abs(usual - rate) * 10 <= usual ? usual : rate)
            }
        }
        var parts = [original].compactMap { $0 }
        if let hertz = song.samplingRate, hertz > 0 {
            let kilo = "\((Double(hertz) / 1000).formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "en_US")))) kHz"
            parts.append(song.bitDepth.map { $0 > 0 ? "\($0)-bit/\(kilo)" : kilo } ?? kilo)
        }
        if let rate = song.bitRate, rate > 0 { parts.append("\(rate) kbps") }
        return parts.joined(separator: " · ")
    }

    private static func converted(_ from: String?, _ rate: Int) -> String {
        let type = from.map { $0 == "MP3" ? $0 : "\($0) → MP3" } ?? "MP3"
        return "\(type) · \(rate) kbps"
    }
}
