import Foundation
import XCTest
@testable import Lodesong

@MainActor final class UpdaterSwapTests: XCTestCase {
    private func run(_ script: String) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", script]
        try process.run()
        process.waitUntilExit()
    }

    func testMissingUpdateLeavesTheInstalledAppAlone() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let current = dir.appendingPathComponent("lodesong.app")
        try FileManager.default.createDirectory(at: current, withIntermediateDirectories: true)
        try "old".write(to: current.appendingPathComponent("marker"), atomically: true, encoding: .utf8)
        try run(Updater.swapScript(pid: 999_999, current: current.path, staged: dir.appendingPathComponent("gone.app").path, open: "true"))
        XCTAssertEqual(try String(contentsOf: current.appendingPathComponent("marker")), "old")
    }

    func testAReadyUpdateReplacesTheApp() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let current = dir.appendingPathComponent("lodesong.app"), staged = dir.appendingPathComponent("new.app")
        for (url, text) in [(current, "old"), (staged, "new")] {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try text.write(to: url.appendingPathComponent("marker"), atomically: true, encoding: .utf8)
        }
        try run(Updater.swapScript(pid: 999_999, current: current.path, staged: staged.path, open: "true"))
        XCTAssertEqual(try String(contentsOf: current.appendingPathComponent("marker")), "new")
        XCTAssertFalse(FileManager.default.fileExists(atPath: current.path + ".old"))
    }
}
