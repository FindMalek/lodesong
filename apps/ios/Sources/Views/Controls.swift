import AVKit
import MediaPlayer
import SwiftUI

/// A thick bar that swells while it is held, used for the track position and the volume.
struct ThickSlider: View {
    let value: Double
    let label: String
    let valueText: String
    var changed: (Double) -> Void = { _ in }
    let ended: (Double) -> Void
    @State private var start: Double?
    @State private var dragged = 0.0

    private var shown: Double { min(1, max(0, start == nil ? value : dragged)) }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(.white.opacity(0.22))
                Rectangle().fill(.white.opacity(start == nil ? 0.6 : 1)).frame(width: proxy.size.width * shown)
            }
            .frame(height: start == nil ? 8 : 16)
            .clipShape(.capsule)
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        if start == nil {
                            start = value
                            Haptic.tap()
                        }
                        dragged = min(1, max(0, (start ?? 0) + drag.translation.width / max(1, proxy.size.width)))
                        changed(dragged)
                    }
                    .onEnded { _ in
                        ended(dragged)
                        start = nil
                    }
            )
        }
        .frame(height: 24)
        .padding(.horizontal, start == nil ? 0 : -6)
        .animation(.spring(duration: 0.25), value: start == nil)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue(valueText)
        .accessibilityAdjustableAction { direction in
            ended(min(1, max(0, value + (direction == .increment ? 0.05 : -0.05))))
        }
    }
}

struct Scrubber: View {
    let position: TimeInterval
    let duration: TimeInterval
    let seek: (TimeInterval) -> Void
    @State private var dragging: Double?

    var body: some View {
        let elapsed = dragging.map { $0 * duration } ?? position
        VStack(spacing: 2) {
            ThickSlider(
                value: duration > 0 ? position / duration : 0,
                label: "Track position",
                valueText: "\(timeText(position)) of \(timeText(duration))",
                changed: { dragging = $0 },
                ended: { fraction in
                    dragging = nil
                    seek(fraction * duration)
                }
            )
            HStack {
                Text(timeText(elapsed))
                Spacer()
                Text("-" + timeText(duration - elapsed))
            }
            .font(.caption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(.white.opacity(0.6))
        }
        .disabled(duration <= 0)
    }
}

/// The phone's own volume. iOS only lets an app change it through the slider inside `MPVolumeView`.
@MainActor
final class SystemVolume: ObservableObject {
    @Published var level = Double(AVAudioSession.sharedInstance().outputVolume)
    let view = MPVolumeView(frame: CGRect(x: 0, y: 0, width: 100, height: 20))
    private var observation: NSKeyValueObservation?

    init() {
        observation = AVAudioSession.sharedInstance().observe(\.outputVolume) { [weak self] session, _ in
            let level = Double(session.outputVolume)
            Task { @MainActor in self?.level = level }
        }
    }

    func set(_ value: Double) {
        level = value
        view.subviews.compactMap { $0 as? UISlider }.first?.value = Float(value)
    }
}

/// Must be on screen, however faint, or the system shows its own volume overlay instead.
private struct HiddenVolumeView: UIViewRepresentable {
    let view: MPVolumeView
    func makeUIView(context: Context) -> MPVolumeView { view }
    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

struct VolumeSlider: View {
    @StateObject private var volume = SystemVolume()

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "speaker.fill")
            ThickSlider(
                value: volume.level, label: "Volume", valueText: "\(Int(volume.level * 100)) percent",
                changed: volume.set, ended: volume.set
            )
            Image(systemName: "speaker.wave.3.fill")
        }
        .font(.footnote)
        .foregroundStyle(.white.opacity(0.6))
        .background { HiddenVolumeView(view: volume.view).frame(width: 100, height: 20).opacity(0.01).allowsHitTesting(false).accessibilityHidden(true) }
        .clipped()
    }
}

struct RoutePicker: UIViewRepresentable {
    var tint = UIColor.white.withAlphaComponent(0.7)
    var activeTint = UIColor.white

    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = tint
        picker.activeTintColor = activeTint
        picker.prioritizesVideoDevices = false
        return picker
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
