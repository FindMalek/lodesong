import SwiftUI

/// The Playlists tab. The page itself is `PlaylistsView`, also reached from Library.
struct PlaylistsTab: View {
    var body: some View {
        PlaylistsView().toolbarTitleDisplayMode(.inlineLarge)
    }
}
