import SwiftUI

/// Playlists and their folders, as a grid or a list. `folder` is nil at the top.
struct PlaylistsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel
    @EnvironmentObject private var router: Router
    var folder: String?
    @AppStorage("playlistsLayout") private var layout = "grid"
    @AppStorage("playlistsSort") private var sort = PlaylistSort.title
    @AppStorage("playlistsDownloadedOnly") private var downloadedOnly = false
    @State private var filter = ""

    /// What this page shows: the folder's own contents, or while searching everything under it that matches.
    private struct Page {
        var title = "Playlists"
        var chain: [String] = []
        var folders: [FolderNode] = []
        var playlists: [Playlist] = []
        var empty: Bool { folders.isEmpty && playlists.isEmpty }
    }

    private var page: Page {
        var tree = FolderNode.tree(model.library.playlists, model.library.shelf)
        if downloadedOnly { tree = tree.keeping { downloads.state(playlist: $0.id) != .none } }
        guard let found = tree.find(folder ?? "") else { return Page(title: "Folder") }
        var page = Page(title: folder == nil ? "Playlists" : found.node.name, chain: found.chain)
        page.folders = found.node.folders
        page.playlists = found.node.playlists
        if !filter.isEmpty {
            page.folders = found.node.allFolders.filter { $0.name.localizedStandardContains(filter) }
            page.playlists = found.node.allPlaylists.filter { $0.name.localizedStandardContains(filter) }
        }
        let chain = page.chain
        page.playlists = sort.sorted(page.playlists) { FolderNode.shownName($0, chain: chain) }
        return page
    }

    var body: some View {
        let page = page
        Group {
            if layout == "list" { list(page) } else { grid(page) }
        }
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in \(page.title)")
        .overlay {
            if page.empty {
                if !filter.isEmpty {
                    ContentUnavailableView.search(text: filter)
                } else if downloadedOnly && !model.library.playlists.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing Downloaded", systemImage: "arrow.down.circle")
                    } description: {
                        Text("Downloaded playlists show here.")
                    } actions: {
                        Button("Show All Playlists") { downloadedOnly = false }.buttonStyle(.glass)
                    }
                } else if folder != nil {
                    ContentUnavailableView("Empty Folder", systemImage: "folder")
                }
            }
        }
        .libraryState(model.library.playlists.isEmpty && model.library.shelf.folders.isEmpty, "No Playlists", "music.note.list")
        .navigationTitle(page.title)
        .toolbar {
            Menu("View Options", systemImage: downloadedOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease") {
                Picker("View", selection: $layout) {
                    Label("Grid", systemImage: "square.grid.2x2").tag("grid")
                    Label("List", systemImage: "list.bullet").tag("list")
                }
                .pickerStyle(.inline)
                Picker("Sort By", selection: $sort) {
                    ForEach(PlaylistSort.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.inline)
                Toggle("Downloaded Only", systemImage: "arrow.down.circle", isOn: $downloadedOnly)
            }
        }
    }

    private func grid(_ page: Page) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                OfflineNotice()
                LazyVGrid(columns: gridColumns, spacing: 20) {
                    ForEach(page.folders) { node in
                        Button { router.open(.folder(node.id)) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                cover(node).padding(.bottom, 4)
                                HStack(spacing: 4) {
                                    Image(systemName: "folder.fill").font(.caption2).foregroundStyle(.secondary)
                                    Text(node.name).lineLimit(1)
                                }
                                .font(.subheadline)
                                Text(contents(node)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(page.playlists) { playlist in
                        PlaylistTile(playlist: playlist, section: "playlists", title: FolderNode.shownName(playlist, chain: page.chain))
                    }
                }
            }
            .padding(20)
        }
    }

    private func list(_ page: Page) -> some View {
        List {
            if model.offline {
                OfflineNotice().listRowSeparator(.hidden)
            }
            ForEach(page.folders) { node in
                NavigationLink(value: Route.folder(node.id)) {
                    row(cover(node, radius: 6), node.name, contents(node), folder: true)
                }
            }
            ForEach(page.playlists) { playlist in
                NavigationLink(value: Route.playlist(playlist)) {
                    row(
                        PlaylistCover(playlist: playlist, size: 120, radius: 6), FolderNode.shownName(playlist, chain: page.chain),
                        count(playlist.songCount ?? 0, "song"), downloaded: downloads.state(playlist: playlist.id) == .downloaded
                    )
                }
                .contextMenu { PlaylistMenu(playlist: playlist) }
            }
        }
        .listStyle(.plain)
    }

    private func cover(_ node: FolderNode, radius: CGFloat = 10) -> some View {
        PictureCover(seed: node.id, version: node.coverVersion, radius: radius)
    }

    private func row(_ cover: some View, _ title: String, _ subtitle: String, folder: Bool = false, downloaded: Bool = false) -> some View {
        HStack(spacing: 12) {
            cover.frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).lineLimit(1)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if folder { Image(systemName: "folder.fill").foregroundStyle(.secondary).accessibilityLabel("Folder") }
            if downloaded {
                Image(systemName: "arrow.down.circle.fill").font(.caption).foregroundStyle(.secondary).accessibilityLabel("Downloaded")
            }
        }
    }

    private func contents(_ node: FolderNode) -> String {
        var parts: [String] = []
        if !node.folders.isEmpty { parts.append(count(node.folders.count, "folder")) }
        if !node.playlists.isEmpty || parts.isEmpty { parts.append(count(node.playlists.count, "playlist")) }
        return parts.joined(separator: ", ")
    }

    private func count(_ number: Int, _ noun: String) -> String { "\(number) \(noun)\(number == 1 ? "" : "s")" }
}
