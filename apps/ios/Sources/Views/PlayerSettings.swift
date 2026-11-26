import SwiftUI

/// How now playing looks and what its gestures and buttons do.
struct PlayerSettings: View {
    @AppStorage(Pref.playerStyle) private var style = "arpeggi"
    @AppStorage(Pref.coverShrinks) private var coverShrinks = true
    @AppStorage(Pref.showAlbum) private var showAlbum = true
    @AppStorage(Pref.streamInfo) private var streamInfo = true
    @AppStorage(Pref.scrollingTitles) private var scrollingTitles = true
    @AppStorage(Pref.playerBackground) private var background = "mesh"
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    @AppStorage(Pref.coverSwipe) private var coverSwipe = true
    @AppStorage(Pref.reverseCoverSwipe) private var reverseCoverSwipe = false
    @AppStorage(Pref.controlSwipe) private var controlSwipe = true
    @AppStorage(Pref.coverSkipSeconds) private var step = 10
    @AppStorage(Pref.miniPlayerSwipe) private var miniPlayerSwipe = true
    @AppStorage(Pref.lockSkipSeconds) private var lockSkipSeconds = 0
    @AppStorage(Pref.keepAwake) private var keepAwake = false

    var body: some View {
        Form {
            Section {
                PlayerStylePicker()
            } footer: {
                Text(style == "apple"
                    ? "Names on the left, a volume slider, shuffle and repeat in the queue."
                    : "Names in the middle, shuffle and repeat beside the controls, and no volume slider.")
            }
            Section("Look") {
                Toggle("Shrink Cover When Paused", isOn: $coverShrinks)
                Toggle("Show Album Name", isOn: $showAlbum)
                Toggle("Detailed Streaming Info", isOn: $streamInfo)
                Toggle("Scroll Long Titles", isOn: $scrollingTitles)
                Picker("Background", selection: $background) {
                    Text("Mesh").tag("mesh")
                    Text("Mono").tag("mono")
                }
                if background != "mono" { Toggle("Moving Background", isOn: $movingBackground) }
                Toggle("Keep Screen Awake", isOn: $keepAwake)
            }
            Section {
                Toggle("Swipe the Cover to Change Song", isOn: $coverSwipe)
                if coverSwipe { Toggle("Reverse Cover Swipe", isOn: $reverseCoverSwipe) }
                Toggle("Swipe the Controls to Step", isOn: $controlSwipe)
                Picker("Step Back and Forward", selection: Binding { Pref.stepSeconds(step) } set: { step = $0 }) {
                    ForEach([5, 10, 15, 30], id: \.self) { Text("\($0) Seconds").tag($0) }
                }
                Toggle("Swipe the Mini Player to Change Song", isOn: $miniPlayerSwipe)
            } header: {
                Text("Gestures")
            } footer: {
                Text(gestureHelp)
            }
            Section {
                NavigationLink("Bottom Buttons") { PlayerButtonsList() }
                Picker("Remote Controls", selection: $lockSkipSeconds) {
                    Text("Previous and Next").tag(0)
                    ForEach([10, 15, 30], id: \.self) { Text("Skip \($0) Seconds").tag($0) }
                }
            } footer: {
                Text("Remote controls are the lock screen, Control Center, headphones and the car.")
            }
        }
        .pickerStyle(.navigationLink)
        .navigationTitle("Player")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var gestureHelp: String {
        [
            coverSwipe ? "Swipe the cover \(reverseCoverSwipe ? "right" : "left") for the next song." : nil,
            controlSwipe ? "Swipe the names or the buttons right to step ahead, left to step back." : nil,
        ].compactMap { $0 }.joined(separator: " ")
    }
}

struct PlayerStylePicker: View {
    @AppStorage(Pref.playerStyle) private var style = "arpeggi"

    var body: some View {
        Picker("Player Style", selection: $style) {
            Text("Arpeggi Style").tag("arpeggi")
            Text("Apple Music Style").tag("apple")
        }
    }
}

private struct PlayerButtonsList: View {
    @AppStorage(Pref.playerButtonOrder) private var order = ""
    @AppStorage(Pref.hiddenPlayerButtons) private var hidden = PlayerButton.hiddenByDefault

    var body: some View {
        List {
            Section {
                ForEach(PlayerButton.ordered(order), id: \.self) { button in
                    Toggle(button.title, isOn: shown(button))
                }
                .onMove { source, target in
                    var buttons = PlayerButton.ordered(order)
                    buttons.move(fromOffsets: source, toOffset: target)
                    order = buttons.map(\.rawValue).joined(separator: ",")
                }
            } footer: {
                Text("The handle at the top of now playing always closes it.")
            }
            Button("Reset to Default") { (hidden, order) = (PlayerButton.hiddenByDefault, "") }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Bottom Buttons")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func shown(_ button: PlayerButton) -> Binding<Bool> {
        let hidden = Set(hidden.split(separator: ",").map(String.init))
        return Binding(
            get: { !hidden.contains(button.rawValue) },
            set: { self.hidden = ($0 ? hidden.subtracting([button.rawValue]) : hidden.union([button.rawValue])).sorted().joined(separator: ",") }
        )
    }
}
