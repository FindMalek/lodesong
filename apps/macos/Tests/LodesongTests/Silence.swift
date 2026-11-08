import AppKit
import CoreAudio
import WebKit

/// The harness plays a real test tone through a real WKWebView. Its audio is muted at the page, below Web Audio: the
/// context still runs and the analyser still sees the tone, but the web process sends the device nothing. A WebKit
/// that can't mute stops the run rather than play the tone.
enum Silence {
    private static let audioMuted: UInt = 1
    private static let set = NSSelectorFromString("_setPageMuted:")
    private static let get = NSSelectorFromString("_mediaMutedState")

    @MainActor static func mute(_ web: WKWebView) {
        guard web.responds(to: set), web.responds(to: get) else {
            fatalError("WebKit lost _setPageMuted:: the harness would play its test tone through the speakers")
        }
        typealias Mute = @convention(c) (AnyObject, Selector, UInt) -> Void
        typealias State = @convention(c) (AnyObject, Selector) -> UInt
        unsafeBitCast(web.method(for: set), to: Mute.self)(web, set, audioMuted)
        guard unsafeBitCast(web.method(for: get), to: State.self)(web, get) & audioMuted != 0 else {
            fatalError("the page did not take the mute: the harness would play its test tone through the speakers")
        }
    }

    /// The GPU process that renders this web view's audio.
    @MainActor static func audioProcess(of web: WKWebView) -> pid_t? {
        let pid = (web.value(forKey: "_gpuProcessIdentifier") as? NSNumber)?.int32Value ?? 0
        return pid > 0 ? pid : nil
    }
}

/// The loudest sample a process hands the audio device (a Core Audio process tap, macOS 14.2), measured after WebKit's mute.
/// nil when the tap can't be made (no permission, a runner without audio): the caller then says it proved nothing.
@available(macOS 14.2, *)
enum SpeakerMeter {
    private final class Peak: @unchecked Sendable {
        var value: Float = 0
        var blocks = 0
    }

    static func peak(ofProcess pid: pid_t, seconds: Double) async -> Float? {
        guard let object = audioObject(pid: pid) else { return nil }
        let description = CATapDescription(stereoMixdownOfProcesses: [object])
        description.muteBehavior = .unmuted
        description.isPrivate = true
        var tap = AudioObjectID(kAudioObjectUnknown)
        guard AudioHardwareCreateProcessTap(description, &tap) == noErr else { return nil }
        defer { AudioHardwareDestroyProcessTap(tap) }
        let uid = "lodesong-harness-meter-\(getpid())"
        let aggregate: [String: Any] = [
            kAudioAggregateDeviceNameKey: "lodesong harness meter", kAudioAggregateDeviceUIDKey: uid,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: description.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
        ]
        var device = AudioObjectID(kAudioObjectUnknown)
        guard AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &device) == noErr else { return nil }
        defer { AudioHardwareDestroyAggregateDevice(device) }
        let peak = Peak()
        var procedure: AudioDeviceIOProcID?
        let made = AudioDeviceCreateIOProcIDWithBlock(&procedure, device, nil) { _, input, _, _, _ in
            peak.blocks += 1
            for buffer in UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input)) {
                guard let data = buffer.mData else { continue }
                let samples = data.bindMemory(to: Float.self, capacity: Int(buffer.mDataByteSize) / 4)
                for index in 0..<Int(buffer.mDataByteSize) / 4 { peak.value = max(peak.value, abs(samples[index])) }
            }
        }
        guard made == noErr, let procedure, AudioDeviceStart(device, procedure) == noErr else { return nil }
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        AudioDeviceStop(device, procedure)
        AudioDeviceDestroyIOProcID(device, procedure)
        return peak.blocks > 0 ? peak.value : nil
    }

    private static func audioObject(pid: pid_t) -> AudioObjectID? {
        var pid = pid
        var object = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyTranslatePIDToProcessObject, mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &object)
        return status == noErr && object != AudioObjectID(kAudioObjectUnknown) ? object : nil
    }
}
