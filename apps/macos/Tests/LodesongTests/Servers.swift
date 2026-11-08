import Foundation
import XCTest

/// The built server (`./dist/lodesong`) in front of the mock Navidrome, as playwright.config.ts runs them.
final class Servers {
    static let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    static let appPort = Int(ProcessInfo.processInfo.environment["LODESONG_HARNESS_PORT"] ?? "") ?? 4780
    static let mockPort = appPort + 19
    static var app: URL { URL(string: "http://127.0.0.1:\(appPort)")! }
    private static var processes: [Process] = []
    private static var started = false

    static func start() async throws {
        if started { return }
        let binary = root.appendingPathComponent("dist/lodesong").path
        guard FileManager.default.isExecutableFile(atPath: binary) else {
            let message = "dist/lodesong is missing: run `bun scripts/build.ts` at the repo root first"
            if ProcessInfo.processInfo.environment["CI"] != nil { throw HarnessError(message) }
            throw XCTSkip(message)
        }
        let mock = "http://127.0.0.1:\(mockPort)"
        let data = FileManager.default.temporaryDirectory.appendingPathComponent("lodesong-harness-\(getpid())")
        try spawn(["bun", "test/mock/server.ts"], ["MOCK_PORT": String(mockPort)])
        try spawn(
            [binary],
            [
                "PORT": String(appPort), "NAVIDROME_URL": mock, "DATA_DIR": data.appendingPathComponent("data").path,
                "UPLOAD_DIR": data.appendingPathComponent("uploads").path, "ONE_SESSION": "off",
                "LYRICS_BACKFILL": "off", "GROQ_API_KEY": "e2e-groq-key", "GROQ_URL": "\(mock)/groq",
                "LYTERION_URL": "\(mock)/lyterion", "LYTERION_TOKEN": "e2e-lyterion-token-0123456789",
                "MUSICBRAINZ_URL": "\(mock)/musicbrainz", "LRCLIB_URL": "\(mock)/lrclib", "AUDIOMUSE_URL": "\(mock)/audiomuse",
            ])
        started = true
        for url in ["\(mock)/rest/ping", "\(app)/healthz"] { try await waitFor(URL(string: url)!) }
    }

    static func stop() {
        for process in processes where process.isRunning { process.terminate() }
        processes = []
        started = false
    }

    private static func spawn(_ command: [String], _ environment: [String: String]) throws {
        let process = Process()
        if command[0].hasPrefix("/") {
            process.executableURL = URL(fileURLWithPath: command[0])
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = command
        }
        process.currentDirectoryURL = root
        process.environment = ProcessInfo.processInfo.environment.merging(environment) { $1 }
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        processes.append(process)
    }

    private static func waitFor(_ url: URL) async throws {
        for _ in 0..<150 {
            if let (_, response) = try? await URLSession.shared.data(from: url), (response as? HTTPURLResponse) != nil { return }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw HarnessError("\(url) did not come up")
    }
}

func trace(_ text: String) {
    let line = Data("harness: \(text)\n".utf8)
    FileHandle.standardError.write(line)
    guard let path = ProcessInfo.processInfo.environment["LODESONG_HARNESS_LOG"] else { return }
    if let handle = FileHandle(forWritingAtPath: path) {
        handle.seekToEndOfFile()
        handle.write(line)
        try? handle.close()
    } else {
        FileManager.default.createFile(atPath: path, contents: line)
    }
}

struct HarnessError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}
