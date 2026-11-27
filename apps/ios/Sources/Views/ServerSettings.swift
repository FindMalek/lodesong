import SwiftUI

/// The second way to reach the same server, say from outside home.
struct ServerSettings: View {
    @EnvironmentObject private var model: AppModel
    @State private var address = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section {
                LabeledContent("Main", value: model.mainServer?.absoluteString ?? "")
                if let second = model.secondServer {
                    LabeledContent("Second", value: second.absoluteString)
                }
                if let main = model.mainServer, let second = model.secondServer, !model.switchesByItself {
                    Picker("Use", selection: Binding(get: { model.client?.server ?? main }, set: { model.use($0) })) {
                        Text("Main").tag(main)
                        Text("Second").tag(second)
                    }
                } else {
                    LabeledContent("In Use", value: model.client?.server.host() ?? "")
                }
            } footer: {
                if model.secondServer != nil && !model.switchesByItself {
                    Text("Switching is automatic only when both addresses use https. A plain http address is trusted on whatever network you are on. Downloads stay as they are.")
                } else {
                    Text("With two https addresses, the main one is tried first and the second when it doesn't answer. Downloads stay as they are.")
                }
            }
            if model.secondServer != nil {
                Section {
                    Button("Remove Second Address", role: .destructive) { model.removeSecondServer() }
                }
            } else {
                Section {
                    TextField("music.example.com", text: $address)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .accessibilityLabel("Second address")
                    SecureField("Password for \(model.user)", text: $password)
                        .textContentType(.password)
                    Button {
                        add()
                    } label: {
                        HStack {
                            Text("Add Second Address")
                            Spacer()
                            if busy { ProgressView() }
                        }
                    }
                    .disabled(busy || address.isEmpty || password.isEmpty || model.offlineMode)
                } footer: {
                    Text(error ?? "Use the same server. It signs in there once, so it needs your password.")
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            }
        }
        .navigationTitle("Server Addresses")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func add() {
        guard let url = ServerClient.normalize(address), url != model.mainServer else {
            error = "That isn't another server address."
            return
        }
        busy = true
        error = nil
        Task {
            do {
                try await model.addSecondServer(url, password: password)
                password = ""
                Haptic.done()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
