import SwiftUI

// What the album and playlist pages share: search, header, download control and the top right menu.

/// The find field above the cover. It scrolls away with the page.
struct CollectionSearch: View {
    let prompt: String
    @Binding var query: String
    var focused: FocusState<Bool>.Binding

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                TextField(prompt, text: $query)
                    .focused(focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                if !query.isEmpty {
                    Button("Clear", systemImage: "xmark.circle.fill") { query = "" }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(Color.primary.opacity(0.08), in: .capsule)
            if focused.wrappedValue || !query.isEmpty {
                Button("Cancel") {
                    query = ""
                    focused.wrappedValue = false
                }
                .buttonStyle(.borderless)
            }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }
}

/// Large cover, name, who made it, then Shuffle, Play and Download, with the description under them so a long one never pushes them away.
struct CollectionHeader<Cover: View, Byline: View>: View {
    @EnvironmentObject private var player: PlayerModel
    let title: String
    let description: String?
    let details: String
    let songs: [Song]
    let download: DownloadControl
    @ViewBuilder let cover: Cover
    @ViewBuilder let byline: Byline
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            cover
                .frame(maxWidth: 270)
                .shadow(color: .black.opacity(0.3), radius: 22, y: 12)
                .padding(.top, 8)
                .padding(.bottom, 20)
            Text(title).font(.title2.bold()).multilineTextAlignment(.center).accessibilityAddTraits(.isHeader)
            byline.font(.title3).lineLimit(1).padding(.top, 2)
            if !details.isEmpty {
                Text(details).font(.footnote).foregroundStyle(.secondary).padding(.top, 4)
            }
            HStack(spacing: 16) {
                Button { player.startShuffled(songs) } label: {
                    Image(systemName: "shuffle").modifier(RoundControl())
                }
                .accessibilityLabel("Shuffle")
                .disabled(songs.isEmpty)
                Button { player.start(songs) } label: {
                    Label("Play", systemImage: "play.fill")
                        .font(.headline)
                        .lineLimit(1)
                        .foregroundStyle(.black)
                        .frame(maxWidth: 200, minHeight: 52)
                        // White in both appearances; the edge and shadow hold it apart from a light page.
                        .background(.white, in: .capsule)
                        .overlay { Capsule().strokeBorder(.black.opacity(0.08)) }
                        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                }
                .disabled(songs.isEmpty)
                download
            }
            .buttonStyle(PressedStyle())
            .padding(.top, 18)
            download.status.padding(.top, 10)
            if let description = description?.trimmingCharacters(in: .whitespacesAndNewlines), !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(expanded ? nil : 2)
                    .padding(.top, 14)
                    .onTapGesture { expanded.toggle() }
            }
        }
        .frame(maxWidth: .infinity)
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }
}

/// Dims what is pressed or disabled; also keeps a tap on the list row from firing every button in it.
private struct PressedStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(!enabled ? 0.4 : configuration.isPressed ? 0.7 : 1)
    }
}

private struct RoundControl: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.title3.weight(.semibold))
            .foregroundStyle(.primary)
            .frame(width: 52, height: 52)
            .background(Color.primary.opacity(0.1), in: .circle)
            .contentShape(.circle)
    }
}

/// Keeps an album or playlist on the phone, and says how far that has got.
struct DownloadControl: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel
    let state: DownloadState
    let songs: [Song]
    /// A kept playlist takes the songs added to it later; an album has nothing to add.
    let follows: Bool
    let keep: () -> Void
    let remove: () -> Void
    @State private var confirming = false

    private var failed: Bool { Self.failed(songs, downloads) }

    @MainActor private static func failed(_ songs: [Song], _ downloads: DownloadsModel) -> Bool {
        songs.contains { downloads.failed.contains($0.id) }
    }

    var body: some View {
        switch state {
        case .none:
            Button {
                Haptic.tap()
                keep()
            } label: {
                Image(systemName: "arrow.down").modifier(RoundControl())
            }
            .accessibilityLabel("Download")
            .disabled(model.offline)
        case .downloading(let done, let total):
            Menu {
                if failed { Button("Try Again", systemImage: "arrow.clockwise") { downloads.retry() } }
                if done == 0 {
                    Button("Cancel Download", systemImage: "xmark", role: .destructive, action: remove)
                } else {
                    // Files are already here (a kept playlist that grew, say), so this is not a harmless cancel.
                    Button("Remove Download", systemImage: "trash", role: .destructive) { confirming = true }
                }
            } label: {
                Image(systemName: failed ? "exclamationmark" : "arrow.down")
                    .modifier(RoundControl())
                    .overlay {
                        Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 3)
                        Circle()
                            .trim(from: 0, to: max(0.03, Double(done) / Double(max(total, 1))))
                            .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .padding(1.5)
                    }
            }
            .accessibilityLabel("Downloading \(done) of \(total)")
            .confirmationDialog("Delete the \(done) downloaded songs?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Remove Download", role: .destructive, action: remove)
            }
        case .downloaded:
            Menu {
                Button("Remove Download", systemImage: "trash", role: .destructive, action: remove)
            } label: {
                Image(systemName: "checkmark")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(.tint, in: .circle)
            }
            .accessibilityLabel("Downloaded")
        }
    }

    /// The line under the buttons; nothing when there is nothing to say.
    var status: some View { StatusLine(control: self) }

    private struct StatusLine: View {
        @EnvironmentObject private var model: AppModel
        @EnvironmentObject private var downloads: DownloadsModel
        let control: DownloadControl

        private var text: String? {
            switch control.state {
            case .none:
                return model.offline ? "Offline. Connect to download." : nil
            case .downloading(let done, let total):
                let count = "\(done) of \(total)"
                if model.offline { return "\(count) on this iPhone · waiting for a connection" }
                if DownloadControl.failed(control.songs, downloads) { return "\(count) on this iPhone · some songs failed" }
                return "Downloading \(count)" + (downloads.wifiOnly ? " · on Wi-Fi only" : "")
            case .downloaded:
                return control.follows ? "Downloaded · songs added later download too" : "Downloaded"
            }
        }

        var body: some View {
            if let text {
                Text(text).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
    }
}

/// The top right menu of an album or playlist.
struct CollectionMenu: ViewModifier {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    /// What the server calls it: `album` or `playlist`.
    let kind: String
    let id: String
    let songs: [Song]
    /// Only playlists can be reordered.
    let sort: Binding<SongSort>?
    @State private var showingDownloads = false
    @State private var link: SharedLink?
    @State private var sharing = false

    private struct SharedLink: Identifiable {
        let id: URL
    }

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem {
                    Menu("More", systemImage: "ellipsis") {
                        Section {
                            Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(songs) }
                            Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(songs) }
                        }
                        .disabled(songs.isEmpty)
                        Section {
                            if let sort {
                                Picker(selection: sort) {
                                    ForEach(SongSort.allCases, id: \.self) { Text($0.label).tag($0) }
                                } label: {
                                    Label("Sort By", systemImage: "arrow.up.arrow.down")
                                    Text(sort.wrappedValue.label)
                                }
                                .pickerStyle(.menu)
                            }
                            Button("Share Link", systemImage: "square.and.arrow.up", action: share)
                                .disabled(model.offline || model.live == nil || sharing)
                            Button("Download Settings", systemImage: "arrow.down.circle") { showingDownloads = true }
                        }
                    }
                }
            }
            .sheet(isPresented: $showingDownloads) {
                NavigationStack {
                    DownloadsView()
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button("Done", systemImage: "checkmark") { showingDownloads = false } }
                }
            }
            .sheet(item: $link) { link in
                ShareSheet(url: link.id).presentationDetents([.medium, .large])
            }
    }

    /// The link is only made when asked for: each one is kept by the server until it is stopped or expires.
    private func share() {
        guard let client = model.live else { return }
        sharing = true
        Task {
            defer { sharing = false }
            do {
                link = SharedLink(id: try await client.shareLink(kind: kind, id: id))
            } catch {
                Popup.show("Can't Share", message: error.localizedDescription)
            }
        }
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
