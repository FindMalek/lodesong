import Foundation

/// "FLAC · 44.1 kHz · 1011 kbps": what is reaching the speaker.
enum StreamLine {
    /// `limit` is the bit rate a conversion was asked for. `fileType` and `fileBytes` describe a copy on the phone.
    static func text(_ song: Song, source: AudioSource, limit: Int, format: StreamFormat = .mp3, fileType: String? = nil, fileBytes: Int? = nil) -> String {
        let original = song.suffix?.uppercased()
        if source == .transcoded || source == .fallback {
            return converted(original, to: format.title, min(limit, song.bitRate ?? limit))
        }
        if source == .file, let fileBytes, let seconds = song.duration, seconds > 0 {
            let rate = fileBytes * 8 / seconds / 1000
            // A converted download or cached copy is of a smaller size or another type.
            let smaller = song.bitRate.map { rate < $0 * 4 / 5 } ?? false
            let type = fileType?.lowercased()
            let made = type.flatMap(StreamFormat.init)
            // An Ogg file saved as `.opus` is the server's own.
            let ownOpus = made == .opus && (original == "OGG" || original == "OGA")
            if smaller || (made != nil && !ownOpus && original != nil && original != made?.rawValue.uppercased()) {
                let usual = [64, 96, 128, 160, 192, 256, 320].min { abs($0 - rate) < abs($1 - rate) }!
                return converted(original, to: made?.title ?? "MP3", abs(usual - rate) * 10 <= usual ? usual : rate)
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

    private static func converted(_ from: String?, to: String, _ rate: Int) -> String {
        let type = from.map { $0 == to.uppercased() ? to : "\($0) → \(to)" } ?? to
        return "\(type) · \(rate) kbps"
    }
}
