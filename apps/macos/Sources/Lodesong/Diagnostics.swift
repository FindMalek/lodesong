import CoreAudio
import Foundation

/// What Help > Copy Audio Diagnostics puts on the clipboard: the page's own report (`window.keepNative.diagnostics()`,
/// with urls, tokens and cookies removed) and what only the app knows around it. It names the song, the output device
/// and the OS; it holds no password, cookie or server address.
enum Diagnostics {
    /// What the page said when asked for its report.
    enum Page {
        case text(String)
        case missing
        case error(String)
        case timeout(seconds: Int)
    }

    struct Output: Sendable {
        var device: String?
        var sampleRate: Double?
        var muted: Bool?
        var volume: Double?
        var transport: String?

        var dictionary: [String: Any] {
            var out: [String: Any] = ["device": device ?? "none"]
            if let sampleRate { out["sampleRate"] = sampleRate }
            if let muted { out["muted"] = muted }
            if let volume { out["volume"] = (volume * 1000).rounded() / 1000 }
            if let transport { out["transport"] = transport }
            return out
        }

        var findings: [String] {
            var out: [String] = []
            if device == nil { out.append("the Mac has no default output device") }
            if muted == true { out.append("the Mac's output is muted") }
            if volume == 0 { out.append("the Mac's output volume is 0") }
            return out
        }
    }

    /// Whether the player's web view can be inspected from Safari (`defaults write engineer.findmalek.lodesong inspectable -bool YES`).
    static func inspectable(_ defaults: UserDefaults = .standard) -> Bool { defaults.bool(forKey: "inspectable") }

    static func app(inspectable: Bool, output: Output) -> [String: Any] {
        let info = Bundle.main.infoDictionary ?? [:]
        let webKit = Bundle(identifier: "com.apple.WebKit")?.infoDictionary ?? [:]
        return [
            "version": info["CFBundleShortVersionString"] as? String ?? "unknown",
            "build": info["CFBundleVersion"] as? String ?? "unknown",
            "macOS": ProcessInfo.processInfo.operatingSystemVersionString,
            "webKit": webKit["CFBundleVersion"] as? String ?? "unknown",
            "inspectable": inspectable,
            "output": output.dictionary,
        ]
    }

    /// The report text and its findings: the page's, then the app's own. A page that said nothing, threw or was too slow
    /// still gets a report that says which.
    static func report(page: Page, app: [String: Any], findings extra: [String] = []) -> (text: String, findings: [String]) {
        var report: [String: Any] = ["app": app]
        var findings = extra
        switch page {
        case .text(let text):
            if let data = text.data(using: .utf8), var parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                findings = (parsed.removeValue(forKey: "findings") as? [String] ?? []) + extra
                report.merge(parsed) { mine, _ in mine }
            } else {
                findings.insert("the page's report was not JSON", at: 0)
            }
        case .missing:
            findings.insert("the page has no audio bridge: it is still loading, or it is older than this app", at: 0)
        case .error(let name):
            findings.insert("the page's report threw \(name)", at: 0)
        case .timeout(let seconds):
            findings.insert("the page did not answer within \(seconds) s", at: 0)
        }
        return (assemble(findings: findings, rest: report), findings)
    }

    /// `findings` first, then the rest sorted: JSONSerialization can't order keys, so the two parts are joined by hand.
    private static func assemble(findings: [String], rest: [String: Any]) -> String {
        func pretty(_ object: [String: Any]) -> String {
            let options: JSONSerialization.WritingOptions = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            return (try? JSONSerialization.data(withJSONObject: object, options: options)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        }
        let head = pretty(["findings": findings]), tail = pretty(rest)
        return String(head.dropLast(2)) + ",\n" + String(tail.dropFirst(2))
    }

    /// Core Audio's answers can block on a misbehaving device: call this off the main actor.
    static func defaultOutput() -> Output {
        guard let device = property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID.self),
              device != AudioObjectID(kAudioObjectUnknown)
        else { return Output() }
        var out = Output(device: name(of: device))
        out.sampleRate = property(device, kAudioDevicePropertyNominalSampleRate, Float64.self)
        out.muted = property(device, kAudioDevicePropertyMute, UInt32.self, scope: kAudioDevicePropertyScopeOutput).map { $0 != 0 }
        out.volume = property(device, kAudioDevicePropertyVolumeScalar, Float32.self, scope: kAudioDevicePropertyScopeOutput).map(Double.init)
        out.transport = property(device, kAudioDevicePropertyTransportType, UInt32.self).map(fourCC)
        return out
    }

    private static func name(of device: AudioObjectID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        var name: Unmanaged<CFString>?
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &name) == noErr, let name else { return nil }
        return name.takeRetainedValue() as String
    }

    private static func property<T>(
        _ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _: T.Type,
        scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
    ) -> T? {
        var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(MemoryLayout<T>.size)
        let value = UnsafeMutablePointer<T>.allocate(capacity: 1)
        defer { value.deallocate() }
        guard AudioObjectGetPropertyData(object, &address, 0, nil, &size, value) == noErr else { return nil }
        return value.pointee
    }

    private static func fourCC(_ code: UInt32) -> String {
        let bytes = [24, 16, 8, 0].map { UInt8((code >> $0) & 0xFF) }
        return String(bytes: bytes, encoding: .ascii) ?? String(code)
    }
}
