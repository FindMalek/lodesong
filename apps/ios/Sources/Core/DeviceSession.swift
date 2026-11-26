import Foundation

// The phone's side of the one session across devices (`/api/devices`, docs/devices.md): it publishes what it plays
// and takes commands, or, while another device plays, mirrors it and sends that device its button presses.

struct DeviceState: Codable, Equatable {
    var songs: [Song]
    var position: Double
    var playing: Bool
    /// 0 to 1. Not every device says; the iPhone can't, iOS keeps its volume to itself.
    var volume: Double?
    var muted: Bool?

    /// The server relays this far ahead at most.
    static let maxSongs = 100
}

struct Device: Decodable, Equatable, Identifiable {
    let id: String
    let name: String
    let active: Bool
}

enum DeviceCommand: Equatable {
    case toggle(playing: Bool)
    case next
    case previous
    case seek(to: Double)
    /// Only ever sent: a phone can't set its own volume.
    case volume(Double)
    case play([Song], start: Int, shuffle: Bool)
    case add([Song], next: Bool)

    /// The server takes this many songs in one `play` or `add`.
    static let maxSongs = 500
}

enum DeviceMessage: Equatable {
    /// Empty when the connection dropped.
    case devices([Device])
    /// What the playing device is doing. `position` already includes the time the message took.
    case state(DeviceState)
    case command(DeviceCommand)
    /// Playback was moved here. `position` already includes the time the message took.
    case take(DeviceState)
    /// Another device started playing.
    case yield

    private struct Raw: Decodable {
        struct Command: Decodable {
            let action: String
            var playing: Bool?
            var to: Double?
            var songs: [Song]?
            var start: Int?
            var shuffle: Bool?
            var next: Bool?
        }

        let t: String
        var devices: [Device]?
        var command: Command?
        var state: DeviceState?
        var stamped: Double?
        var now: Double?

        var current: DeviceState? {
            guard var state else { return nil }
            if state.playing { state.position += max(0, (now ?? 0) - (stamped ?? 0)) / 1000 }
            return state
        }
    }

    /// Nil for anything the phone has no use for.
    init?(_ text: String) {
        guard let raw = try? JSONDecoder().decode(Raw.self, from: Data(text.utf8)) else { return nil }
        switch raw.t {
        case "devices":
            self = .devices(raw.devices ?? [])
        case "state":
            guard let state = raw.current else { return nil }
            self = .state(state)
        case "command":
            guard let command = raw.command else { return nil }
            switch command.action {
            case "toggle": self = .command(.toggle(playing: command.playing ?? false))
            case "next": self = .command(.next)
            case "previous": self = .command(.previous)
            case "seek": self = .command(.seek(to: command.to ?? 0))
            case "play": self = .command(.play(command.songs ?? [], start: command.start ?? 0, shuffle: command.shuffle ?? false))
            case "add": self = .command(.add(command.songs ?? [], next: command.next ?? false))
            default: return nil
            }
        case "take":
            guard let state = raw.current, !state.songs.isEmpty else { return nil }
            self = .take(state)
        case "yield":
            self = .yield
        default:
            return nil
        }
    }
}

/// What the phone sends.
enum DeviceRequest: Equatable {
    case state(DeviceState)
    case command(DeviceCommand)
    case transfer(to: String)

    /// The server drops a longer message whole.
    static let maxBytes = 256 * 1024

    private struct Wire: Encodable {
        struct Command: Encodable {
            let action: String
            var playing: Bool?
            var to: Double?
            var volume: Double?
            var muted: Bool?
            var songs: [Song]?
            var start: Int?
            var shuffle: Bool?
            var next: Bool?
        }

        let t: String
        var state: DeviceState?
        var command: Command?
        var to: String?
    }

    var text: String? {
        let wire: Wire
        switch self {
        case .state(var state):
            state.songs = state.songs.map(Self.slim)
            wire = Wire(t: "state", state: state)
        case .transfer(let id):
            wire = Wire(t: "transfer", to: id)
        case .command(let command):
            var body: Wire.Command
            switch command {
            case .toggle(let playing): body = .init(action: "toggle", playing: playing)
            case .next: body = .init(action: "next")
            case .previous: body = .init(action: "previous")
            case .seek(let seconds): body = .init(action: "seek", to: max(0, seconds))
            case .volume(let level): body = .init(action: "volume", volume: min(1, max(0, level)), muted: false)
            case .play(let songs, let start, let shuffle):
                // A long list is cut to a window around the song asked for.
                var size = DeviceCommand.maxSongs
                while true {
                    let from = max(0, start - size / 2)
                    let window = songs.dropFirst(from).prefix(size).map(Self.slim)
                    let text = Self.encode(Wire(t: "command", command: .init(action: "play", songs: window, start: start - from, shuffle: shuffle)))
                    if let text, text.utf8.count > Self.maxBytes, size > 1 { size /= 2 } else { return text }
                }
            case .add(let songs, let next):
                var size = DeviceCommand.maxSongs
                while true {
                    let text = Self.encode(Wire(t: "command", command: .init(action: "add", songs: songs.prefix(size).map(Self.slim), next: next)))
                    if let text, text.utf8.count > Self.maxBytes, size > 1 { size /= 2 } else { return text }
                }
            }
            wire = Wire(t: "command", command: body)
        }
        return Self.encode(wire)
    }

    private static func encode(_ wire: Wire) -> String? {
        (try? JSONEncoder().encode(wire)).map { String(decoding: $0, as: UTF8.self) }
    }

    /// Only what the other devices keep.
    private static func slim(_ song: Song) -> Song {
        var song = song
        song.playCount = nil
        song.samplingRate = nil
        song.bitDepth = nil
        song.starred = nil
        song.userRating = nil
        song.year = nil
        song.genre = nil
        song.genres = nil
        return song
    }
}

/// The session as this phone sees it. While `playingOn` is set the phone is a remote: it shows `state` and plays,
/// counts and saves nothing of its own.
struct DeviceMirror: Equatable {
    private(set) var devices: [Device] = []
    private(set) var state: DeviceState?
    private(set) var playingOn: Device?
    /// When `state.position` was true.
    private var since = Date.distantPast
    private var volumeSet = Date.distantPast

    /// Returns what to keep here, paused, when the device that played is gone and no other took over.
    mutating func list(_ devices: [Device], me: String, playingHere: Bool, now: Date = Date()) -> DeviceState? {
        self.devices = devices
        let active = devices.first(where: \.active)
        let was = playingOn != nil
        // Playing here wins: the server hears of it next and hands the session over.
        playingOn = active.flatMap { $0.id == me || playingHere ? nil : $0 }
        // Here is where it plays now: whatever was mirrored before is old.
        if active?.id == me || playingHere {
            state = nil
            return nil
        }
        guard was, active == nil, var left = state, !left.songs.isEmpty else { return nil }
        left.position = position(at: now)
        left.playing = false
        state = nil
        return left
    }

    mutating func heard(_ new: DeviceState, now: Date = Date()) {
        var new = new
        // A level just set here is not pulled back by one sent before it arrived.
        if now.timeIntervalSince(volumeSet) < 0.8 {
            new.volume = state?.volume
            new.muted = state?.muted
        }
        state = new
        since = now
    }

    /// Shows a button press at once, before the playing device says so itself.
    mutating func expect(_ command: DeviceCommand, now: Date = Date()) {
        guard var new = state else { return }
        switch command {
        case .toggle(let playing):
            new.position = position(at: now)
            new.playing = playing
            since = now
        case .seek(let seconds):
            new.position = seconds
            since = now
        case .volume(let level):
            new.volume = level
            new.muted = false
            volumeSet = now
        default:
            return
        }
        state = new
    }

    func position(at now: Date = Date()) -> Double {
        guard let state else { return 0 }
        let position = state.playing ? state.position + max(0, now.timeIntervalSince(since)) : state.position
        guard let length = state.songs.first?.duration, length > 0 else { return position }
        return min(position, Double(length))
    }
}

extension ServerClient {
    /// The server wants the session cookie, and an `Origin` of its own site in place of the CSRF header.
    func devicesRequest(id: String, name: String, cookies: [HTTPCookie]) -> URLRequest {
        var parts = URLComponents(url: url("api/devices", ["id": id, "name": name]), resolvingAgainstBaseURL: false)!
        let secure = parts.scheme == "https"
        var origin = URLComponents()
        origin.scheme = parts.scheme
        origin.host = parts.host
        origin.port = parts.port == (secure ? 443 : 80) ? nil : parts.port
        parts.scheme = secure ? "wss" : "ws"
        var request = URLRequest(url: parts.url!)
        for (field, value) in HTTPCookie.requestHeaderFields(with: cookies) { request.setValue(value, forHTTPHeaderField: field) }
        request.setValue(origin.string, forHTTPHeaderField: "origin")
        return request
    }
}

/// The socket, reopened whenever it drops until `close`.
@MainActor
final class DeviceLink {
    private let request: () -> URLRequest
    private let opened: () -> Void
    private let received: (DeviceMessage) -> Void
    private var socket: URLSessionWebSocketTask?
    private var work: Task<Void, Never>?

    init(request: @escaping () -> URLRequest, opened: @escaping () -> Void, received: @escaping (DeviceMessage) -> Void) {
        self.request = request
        self.opened = opened
        self.received = received
        connect()
    }

    func connect() {
        close()
        work = Task { [weak self] in
            var attempt = 0
            while !Task.isCancelled, let self {
                let socket = URLSession.shared.webSocketTask(with: self.request())
                socket.maximumMessageSize = 1 << 20
                self.socket = socket
                socket.resume()
                // A ping only comes back once the socket is open, and keeps a quiet one from timing out.
                let ping = Task { [weak self] in
                    var open = false
                    while !Task.isCancelled {
                        socket.sendPing { error in
                            // A connection that died quietly ends the wait on it.
                            if error != nil { return socket.cancel() }
                            guard !open else { return }
                            open = true
                            Task { @MainActor in
                                if socket === self?.socket { self?.opened() }
                            }
                        }
                        try? await Task.sleep(for: .seconds(30))
                    }
                }
                while !Task.isCancelled, let message = try? await socket.receive() {
                    // Closed while waiting: what arrived belongs to a session already left.
                    guard !Task.isCancelled else { break }
                    attempt = 0
                    if case .string(let text) = message, let parsed = DeviceMessage(text) { self.received(parsed) }
                }
                ping.cancel()
                socket.cancel()
                if Task.isCancelled { return }
                // Also how a server with one session off answers, so it settles at a slow retry.
                self.received(.devices([]))
                try? await Task.sleep(for: .seconds([1, 5, 15, 60][min(attempt, 3)]))
                attempt += 1
            }
        }
    }

    var isConnected: Bool { socket?.state == .running }
    var isClosed: Bool { work == nil }

    func send(_ request: DeviceRequest) {
        guard let socket, let text = request.text else { return }
        socket.send(.string(text)) { _ in }
    }

    func close() {
        work?.cancel()
        work = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }
}
