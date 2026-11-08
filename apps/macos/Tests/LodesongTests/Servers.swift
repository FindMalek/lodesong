import Darwin
import Foundation
import XCTest

/// The built server (`./dist/lodesong`) in front of the mock Navidrome, as playwright.config.ts runs them.
/// Ports are free ones picked per run (`LODESONG_HARNESS_PORT` pins the app port, the mock takes the next 19).
final class Servers {
    static let root = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    private(set) static var appPort = 0
    private static var mockPort = 0
    static var app: URL { URL(string: "http://127.0.0.1:\(appPort)")! }
    private static var children: [(name: String, process: Process, errors: URL)] = []
    private static var scratch: URL?
    private static var started = false

    /// That song's transcodes come the way Navidrome's do: no Range, no Content-Length.
    static func unsize(_ songId: String, on: Bool = true) async {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(mockPort)/mock/unsized?id=\(songId)&mode=\(on ? "on" : "off")")!)
        request.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: request)
    }

    static func start() async throws {
        if started { return }
        let binary = root.appendingPathComponent("dist/lodesong").path
        guard FileManager.default.isExecutableFile(atPath: binary) else {
            let message = "dist/lodesong is missing: run `bun scripts/build.ts` at the repo root first"
            if ProcessInfo.processInfo.environment["CI"] != nil { throw HarnessError(message) }
            throw XCTSkip(message)
        }
        let pinned = Int(ProcessInfo.processInfo.environment["LODESONG_HARNESS_PORT"] ?? "")
        if let pinned {
            appPort = pinned
            mockPort = pinned + 19
        } else {
            appPort = try freePort()
            mockPort = try freePort()
        }
        let mock = "http://127.0.0.1:\(mockPort)"
        let data = FileManager.default.temporaryDirectory.appendingPathComponent("lodesong-harness-\(getpid())")
        scratch = data
        atexit { Servers.stop() }
        do {
            try spawn("mock", ["bun", "test/mock/server.ts"], ["MOCK_PORT": String(mockPort)])
            try spawn(
                "server",
                [binary],
                [
                    "PORT": String(appPort), "NAVIDROME_URL": mock, "DATA_DIR": data.appendingPathComponent("data").path,
                    "UPLOAD_DIR": data.appendingPathComponent("uploads").path, "ONE_SESSION": "off",
                    "LYRICS_BACKFILL": "off", "GROQ_API_KEY": "e2e-groq-key", "GROQ_URL": "\(mock)/groq",
                    "LYTERION_URL": "\(mock)/lyterion", "LYTERION_TOKEN": "e2e-lyterion-token-0123456789",
                    "MUSICBRAINZ_URL": "\(mock)/musicbrainz", "LRCLIB_URL": "\(mock)/lrclib", "AUDIOMUSE_URL": "\(mock)/audiomuse",
                ])
            try await waitFor("mock", URL(string: "\(mock)/rest/ping")!)
            try await waitFor("server", URL(string: "\(app)/healthz")!)
        } catch {
            stop()
            throw error
        }
        started = true
    }

    static func stop() {
        for child in children {
            if child.process.isRunning { child.process.terminate() }
            try? FileManager.default.removeItem(at: child.errors)
        }
        children = []
        if let scratch { try? FileManager.default.removeItem(at: scratch) }
        scratch = nil
        started = false
    }

    /// A port the kernel just handed out, so nothing else listens on it.
    private static func freePort() throws -> Int {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw HarnessError("no socket to probe a free port") }
        defer { close(descriptor) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) }
        }
        guard bound == 0, named == 0 else { throw HarnessError("could not probe a free port") }
        return Int(UInt16(bigEndian: address.sin_port))
    }

    /// Runs the command under a shell that kills it when this process dies by any means (kill -9 included).
    private static func spawn(_ name: String, _ command: [String], _ environment: [String: String]) throws {
        let watch = """
        parent=$1; shift
        "$@" & child=$!
        trap 'kill $child 2>/dev/null' TERM INT
        ( while kill -0 $parent 2>/dev/null; do sleep 1; done; kill $child 2>/dev/null ) & watcher=$!
        wait $child; status=$?
        kill $watcher 2>/dev/null
        exit $status
        """
        let launch = command[0].hasPrefix("/") ? command : ["/usr/bin/env"] + command
        let errors = FileManager.default.temporaryDirectory.appendingPathComponent("lodesong-harness-\(getpid())-\(name).log")
        FileManager.default.createFile(atPath: errors.path, contents: nil)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", watch, "sh", String(getpid())] + launch
        process.currentDirectoryURL = root
        process.environment = ProcessInfo.processInfo.environment.merging(environment) { $1 }
        process.standardOutput = try FileHandle(forWritingTo: errors)
        process.standardError = process.standardOutput
        try process.run()
        children.append((name, process, errors))
    }

    private static func output(of name: String) -> String {
        guard let child = children.first(where: { $0.name == name }),
              let text = try? String(contentsOf: child.errors, encoding: .utf8) else { return "" }
        return String(text.suffix(2000))
    }

    /// 200 from the process this run started: if it exited (port taken, crash) that is what fails, not a foreign listener's answer.
    private static func waitFor(_ name: String, _ url: URL) async throws {
        guard let child = children.first(where: { $0.name == name }) else { throw HarnessError("\(name) was not started") }
        for _ in 0..<150 {
            if !child.process.isRunning {
                throw HarnessError("\(name) exited with \(child.process.terminationStatus) before \(url) answered:\n\(output(of: name))")
            }
            if let (_, response) = try? await URLSession.shared.data(from: url), (response as? HTTPURLResponse)?.statusCode == 200 {
                return
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw HarnessError("\(url) did not answer 200 in 30 s:\n\(output(of: name))")
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
