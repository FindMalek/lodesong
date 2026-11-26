import Foundation

// The phone's side of the one session across devices (`/api/devices`, docs/devices.md): it publishes what it plays
// and takes commands. It is never a remote for another device.

struct DeviceState: Codable, Equatable {
    var songs: [Song]
    var position: Double
    var playing: Bool

    /// The server relays this far ahead at most.
    static let maxSongs = 100
}

enum DeviceCommand: Equatable {
    case toggle(playing: Bool)
    case next
    case previous
    case seek(to: Double)
    case play([Song], start: Int, shuffle: Bool)
    case add([Song], next: Bool)
}

enum DeviceMessage: Equatable {
    case active(String?)
    case command(DeviceCommand)
    /// Playback was moved here. `position` already includes the time the message took.
    case take(DeviceState)
    /// Another device started playing.
    case yield

    private struct Raw: Decodable {
        struct Device: Decodable {
            let id: String
            let active: Bool
        }
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
    }

    /// Nil for anything the phone has no use for.
    init?(_ text: String) {
        guard let raw = try? JSONDecoder().decode(Raw.self, from: Data(text.utf8)) else { return nil }
        switch raw.t {
        case "devices":
            self = .active(raw.devices?.first(where: \.active)?.id)
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
            guard var state = raw.state, !state.songs.isEmpty else { return nil }
            if state.playing { state.position += max(0, (raw.now ?? 0) - (raw.stamped ?? 0)) / 1000 }
            self = .take(state)
        case "yield":
            self = .yield
        default:
            return nil
        }
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
                            guard error == nil, !open else { return }
                            open = true
                            Task { @MainActor in self?.opened() }
                        }
                        try? await Task.sleep(for: .seconds(30))
                    }
                }
                while !Task.isCancelled, let message = try? await socket.receive() {
                    attempt = 0
                    if case .string(let text) = message, let parsed = DeviceMessage(text) { self.received(parsed) }
                }
                ping.cancel()
                socket.cancel()
                if Task.isCancelled { return }
                // Also how a server with one session off answers, so it settles at a slow retry.
                self.received(.active(nil))
                try? await Task.sleep(for: .seconds([1, 5, 15, 60][min(attempt, 3)]))
                attempt += 1
            }
        }
    }

    var isConnected: Bool { socket?.state == .running }
    var isClosed: Bool { work == nil }

    func send(_ state: DeviceState) {
        struct Message: Encodable {
            let t = "state"
            let state: DeviceState
        }
        guard let socket, let data = try? JSONEncoder().encode(Message(state: state)) else { return }
        socket.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
    }

    func close() {
        work?.cancel()
        work = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }
}
