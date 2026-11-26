import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var model: AppModel
    @State private var server = ""
    @State private var user = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("music.example.com", text: $server)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                }
                Section("Account") {
                    TextField("Username", text: $user).textContentType(.username)
                    SecureField("Password", text: $password).textContentType(.password)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                Section {
                    Button(busy ? "Signing in…" : "Sign In", action: submit)
                        .disabled(busy || server.isEmpty || user.isEmpty || password.isEmpty)
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .navigationTitle("lodesong")
        }
        .onAppear {
            server = model.client?.server.absoluteString ?? server
            user = model.user
        }
    }

    private func submit() {
        guard let url = ServerClient.normalize(server) else {
            error = "That isn't a server address."
            return
        }
        busy = true
        error = nil
        Task {
            do {
                try await model.signIn(server: url, user: user, password: password)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
