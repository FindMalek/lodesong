import SwiftUI

/// First launch: where is your lodesong? Saved on this phone; the page's own sign-in comes next.
struct SetupView: View {
    @EnvironmentObject private var model: AppModel
    @State private var text = ""
    @State private var invalid = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            HStack(spacing: 10) {
                Rectangle().fill(Color.primary).frame(width: 12, height: 12)
                Text("lodesong").font(.system(.title3, design: .monospaced).weight(.medium))
            }
            Text("where is your lodesong?").font(.largeTitle.weight(.medium))
            Text("The address you open it at in a browser, like https://music.example.com. On your home network it can be an IP and port.")
                .foregroundStyle(.secondary)
            TextField("https://music.example.com", text: $text)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(connect)
                .padding(12)
                .overlay(Rectangle().stroke(invalid ? Color.red : Color.secondary.opacity(0.5), lineWidth: 1))
            if invalid {
                Text("That doesn't look like an address.").font(.footnote).foregroundStyle(.red)
            }
            Button(action: connect) {
                Text("connect").frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(.primary)
            Spacer()
            Spacer()
        }
        .padding(24)
        .onAppear { focused = true }
    }

    private func connect() {
        guard let url = AppModel.normalize(text) else {
            invalid = true
            return
        }
        invalid = false
        model.server = url
    }
}
