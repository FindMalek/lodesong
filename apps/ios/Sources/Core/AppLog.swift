import Foundation

/// What went wrong lately, kept on the phone for the Logs page. The newest lines only.
final class AppLog: @unchecked Sendable {
    static let shared = AppLog(file: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("log.txt"))

    private static let limit = 500
    private let file: URL
    private let lock = NSLock()
    private var kept: [String]

    init(file: URL) {
        self.file = file
        kept = (try? String(contentsOf: file, encoding: .utf8))?.split(separator: "\n").map(String.init) ?? []
    }

    var lines: [String] {
        lock.lock()
        defer { lock.unlock() }
        return kept
    }

    func add(_ message: String) {
        lock.lock()
        defer { lock.unlock() }
        let time = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate, .withTime, .withColonSeparatorInTime, .withSpaceBetweenDateAndTime])
        kept = Array((kept + ["\(time)  \(message.replacingOccurrences(of: "\n", with: " "))"]).suffix(Self.limit))
        try? kept.joined(separator: "\n").write(to: file, atomically: true, encoding: .utf8)
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }
        kept = []
        try? FileManager.default.removeItem(at: file)
    }

    /// Takes the host out of every address, and any of `hosts` named on its own.
    static func redact(_ text: String, hosts: [String]) -> String {
        var out = text.replacingOccurrences(of: #"(https?|wss?)://[^/\s"?]+"#, with: "$1://[server]", options: .regularExpression)
        for host in hosts where !host.isEmpty {
            out = out.replacingOccurrences(of: host, with: "[server]", options: .caseInsensitive)
        }
        return out
    }
}
