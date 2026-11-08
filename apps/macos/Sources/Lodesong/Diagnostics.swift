import AppKit
import CoreAudio
import Foundation

/// What Help > Copy Audio Diagnostics puts on the clipboard: the page's own report (`window.keepNative.diagnostics()`,
/// already stripped of tokens and cookies) with what only the app knows around it. No server address, no login.
enum Diagnostics {
    static func app() -> [String: Any] {
        let info = Bundle.main.infoDictionary ?? [:]
        let webKit = Bundle(identifier: "com.apple.WebKit")?.infoDictionary ?? [:]
        return [
            "version": info["CFBundleShortVersionString"] as? String ?? "unknown",
            "build": info["CFBundleVersion"] as? String ?? "unknown",
            "macOS": ProcessInfo.processInfo.operatingSystemVersionString,
            "webKit": webKit["CFBundleVersion"] as? String ?? "unknown",
            "inspectable": UserDefaults.standard.bool(forKey: "inspectable"),
            "output": defaultOutput(),
        ]
    }

    /// The page's report with the app's added; a page that did not answer still gets a report saying so.
    static func report(page: String?, app: [String: Any] = Diagnostics.app()) -> String {
        var report: [String: Any] = ["app": app]
        if let page, let data = page.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            report.merge(parsed) { mine, _ in mine }
        } else {
            report["page"] = "the page did not answer: it may still be loading, or it is older than the app"
        }
        let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    private static func defaultOutput() -> [String: Any] {
        guard let device = property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID.self),
              device != AudioObjectID(kAudioObjectUnknown)
        else { return ["device": "none"] }
        var out: [String: Any] = [:]
        if let name = property(device, kAudioObjectPropertyName, CFString.self) { out["device"] = name as String }
        if let rate = property(device, kAudioDevicePropertyNominalSampleRate, Float64.self) { out["sampleRate"] = rate }
        if let muted = property(device, kAudioDevicePropertyMute, UInt32.self, scope: kAudioDevicePropertyScopeOutput) { out["muted"] = muted != 0 }
        if let volume = property(device, kAudioDevicePropertyVolumeScalar, Float32.self, scope: kAudioDevicePropertyScopeOutput) { out["volume"] = Double(volume) }
        if let transport = property(device, kAudioDevicePropertyTransportType, UInt32.self) { out["transport"] = fourCC(transport) }
        return out
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
