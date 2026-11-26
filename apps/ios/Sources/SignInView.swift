import SwiftUI

struct SignInView: View {
    private enum Field { case server, user, password }

    @EnvironmentObject private var model: AppModel
    @State private var server = ""
    @State private var user = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @FocusState private var focus: Field?

    private var ready: Bool { !busy && !server.isEmpty && !user.isEmpty && !password.isEmpty }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    Image(systemName: "waveform.circle.fill")
                        .font(.system(size: 72))
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    Text("lodesong").font(.largeTitle.bold())
                    Text("Sign in to your music server.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(.top, 56)
                VStack(spacing: 0) {
                    TextField("music.example.com", text: $server)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .focused($focus, equals: .server)
                        .submitLabel(.next)
                        .onSubmit { focus = .user }
                        .accessibilityLabel("Server")
                        .padding(16)
                    Divider().padding(.leading, 16)
                    TextField("Username", text: $user)
                        .textContentType(.username)
                        .focused($focus, equals: .user)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                        .padding(16)
                    Divider().padding(.leading, 16)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { if ready { submit() } }
                        .padding(16)
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 22))
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(action: submit) {
                    Group {
                        if busy { ProgressView() } else { Text("Sign In") }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.glassProminent)
                .disabled(!ready)
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .tint(.accent)
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
                Haptic.done()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
