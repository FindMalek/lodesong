import SwiftUI

/// Where the sound goes. Alone, it is the AirPlay picker; with other lodesong devices online, a list of them and AirPlay.
struct DeviceButton: View {
    @EnvironmentObject private var player: PlayerModel
    @Binding var showing: Bool

    var body: some View {
        Group {
            if player.mirror.devices.contains(where: { $0.id != player.deviceID }) {
                Button { showing = true } label: {
                    Image(systemName: "hifispeaker.and.appletv")
                        .font(.title3)
                        .foregroundStyle(.white.opacity(player.isRemote ? 1 : 0.7))
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Devices")
                .accessibilityValue(player.mirror.playingOn.map { "Playing on \($0.name)" } ?? "Playing here")
            } else {
                RoutePicker().frame(width: 44, height: 44).accessibilityLabel("AirPlay")
            }
        }
    }
}

struct DeviceList: View {
    @EnvironmentObject private var player: PlayerModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let here = UIDevice.current.userInterfaceIdiom == .pad ? "This iPad" : "This iPhone"
        let devices = player.mirror.devices
        let active = devices.first(where: \.active)?.id ?? player.deviceID
        NavigationStack {
            List {
                Section("lodesong") {
                    row(here, id: player.deviceID, active: active)
                    ForEach(devices.filter { $0.id != player.deviceID }) { row($0.name, id: $0.id, active: active) }
                }
                Section {
                    Label("AirPlay and Bluetooth", systemImage: "airplayaudio")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        // The system only opens its list from its own button, so that one covers the row, unseen.
                        .overlay { RoutePicker(tint: .clear, activeTint: .clear) }
                        .accessibilityElement(children: .contain)
                }
            }
            .navigationTitle("Devices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ name: String, id: String, active: String) -> some View {
        Button {
            Haptic.tap()
            if id != active { player.transfer(to: id) }
            dismiss()
        } label: {
            HStack {
                Text(name).foregroundStyle(Color.primary)
                Spacer()
                if id == active { Image(systemName: "checkmark").fontWeight(.semibold) }
            }
            .contentShape(.rect)
        }
        .accessibilityAddTraits(id == active ? .isSelected : [])
    }
}

/// Takes the stream line's place while another device plays.
struct PlayingOn: View {
    let device: String

    var body: some View {
        Label("Playing on \(device)", systemImage: "hifispeaker.fill")
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
    }
}

/// The playing device's volume. Off for one that doesn't say its level, an iPhone for one.
struct RemoteVolumeSlider: View {
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        let level = player.mirror.state?.volume
        let shown = player.mirror.state?.muted == true ? 0 : level ?? 0
        HStack(spacing: 12) {
            Image(systemName: "speaker.fill")
            ThickSlider(
                value: shown, label: "Volume of the playing device", valueText: "\(Int(shown * 100)) percent",
                changed: player.setRemoteVolume, ended: player.setRemoteVolume
            )
            Image(systemName: "speaker.wave.3.fill")
        }
        .font(.footnote)
        .foregroundStyle(.white.opacity(0.6))
        .disabled(level == nil)
        .opacity(level == nil ? 0.4 : 1)
    }
}
