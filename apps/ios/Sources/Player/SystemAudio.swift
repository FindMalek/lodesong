import AVFoundation
import MediaPlayer
import UIKit

/// The phone around the player: the audio session, calls and unplugged headphones, the lock screen and its buttons.
@MainActor
final class SystemAudio {
    private weak var player: PlayerModel?
    private var interrupted = false
    private var ignorePlayUntil = Date.distantPast
    private var artwork: (id: String, image: MPMediaItemArtwork)?
    private var fetching: String?
    private var info: [String: Any] = [:]

    init(player: PlayerModel) {
        self.player = player
    }

    /// Only ever called when playback starts, so opening the app leaves other apps' audio alone.
    func activate() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try? session.setActive(true)
    }

    func start() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init)
            let options = AVAudioSession.InterruptionOptions(rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            MainActor.assumeIsolated { self?.interruption(type, resume: options.contains(.shouldResume)) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap(AVAudioSession.RouteChangeReason.init)
            MainActor.assumeIsolated { self?.routeChanged(reason) }
        }
        let commands = MPRemoteCommandCenter.shared()
        on(commands.playCommand) { system, player in
            if Date() > system.ignorePlayUntil { player.resume() }
        }
        on(commands.pauseCommand) { system, player in
            system.interrupted = false
            player.pause()
        }
        on(commands.togglePlayPauseCommand) { system, player in
            if player.isPlaying { player.pause() } else if Date() > system.ignorePlayUntil { player.resume() }
        }
        on(commands.nextTrackCommand) { _, player in player.next() }
        on(commands.previousTrackCommand) { _, player in player.previous() }
        for (command, direction) in [(commands.skipForwardCommand, 1.0), (commands.skipBackwardCommand, -1.0)] {
            command.addTarget { [weak self] event in
                let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 15
                Task { @MainActor in self?.player?.skip(by: seconds * direction) }
                return .success
            }
        }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let seconds = event.positionTime
            Task { @MainActor in self?.player?.seek(to: seconds) }
            return .success
        }
    }

    /// The lock screen has room for one pair: previous and next, or skip back and ahead by `seconds`.
    func skipSeconds(_ seconds: Int) {
        let commands = MPRemoteCommandCenter.shared()
        for command in [commands.skipForwardCommand, commands.skipBackwardCommand] {
            command.preferredIntervals = [NSNumber(value: seconds)]
            command.isEnabled = seconds > 0
        }
        commands.nextTrackCommand.isEnabled = seconds == 0
        commands.previousTrackCommand.isEnabled = seconds == 0
    }

    private func on(_ command: MPRemoteCommand, _ action: @escaping @MainActor (SystemAudio, PlayerModel) -> Void) {
        command.addTarget { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player else { return }
                action(self, player)
            }
            return .success
        }
    }

    private func interruption(_ type: AVAudioSession.InterruptionType?, resume: Bool) {
        guard let player else { return }
        if type == .began {
            interrupted = player.isPlaying
            player.pause()
        } else if type == .ended {
            if interrupted && resume { player.resume() }
            interrupted = false
        }
    }

    private func routeChanged(_ reason: AVAudioSession.RouteChangeReason?) {
        guard let player else { return }
        if reason == .oldDeviceUnavailable {
            // Unplugged during a call: the end of the call must not resume out of the speaker.
            interrupted = false
            player.pause()
        } else if reason == .newDeviceAvailable && !player.isPlaying {
            // Car stereos and speakers send "play" the moment they connect. That is not someone pressing it.
            ignorePlayUntil = Date().addingTimeInterval(2)
        }
    }

    func show(_ song: Song?, index: Int, count: Int, position: TimeInterval, duration: TimeInterval, playing: Bool, speed: Float, client: ServerClient?) {
        guard let song else {
            info = [:]
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        info = [
            MPMediaItemPropertyTitle: song.title,
            MPMediaItemPropertyArtist: song.artist ?? "",
            MPMediaItemPropertyAlbumTitle: song.album ?? "",
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? Double(speed) : 0.0,
            MPNowPlayingInfoPropertyPlaybackQueueIndex: index,
            MPNowPlayingInfoPropertyPlaybackQueueCount: count,
        ]
        if let artwork, artwork.id == song.coverArt { info[MPMediaItemPropertyArtwork] = artwork.image }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        if let cover = song.coverArt, artwork?.id != cover, fetching != cover, let client { fetch(cover, client) }
    }

    private func fetch(_ cover: String, _ client: ServerClient) {
        fetching = cover
        Task {
            // Through the cache, so the lock screen has a cover offline too.
            let image = await ArtworkCache.shared.image(cover, size: 600, client: client)
            guard fetching == cover else { return }
            fetching = nil
            guard let image else { return }
            artwork = (cover, Self.artwork(image))
            info[MPMediaItemPropertyArtwork] = artwork?.image
            // The elapsed time in `info` is from when the song was last shown; the lock screen already counted on from it.
            var now = info
            if let player {
                now[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.position
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = now
        }
    }

    /// The system asks for the picture on its own thread, so this must not be tied to the main actor.
    private nonisolated static func artwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
