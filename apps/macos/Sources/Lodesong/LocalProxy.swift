import Network
import WebKit

/// Sends the player's traffic for the server's host through a SOCKS proxy on this Mac (a userspace Tailscale, for
/// instance), for networks where the server's own address doesn't answer from inside the LAN. Off unless the setting
/// is on, and a no-op while nothing listens on the port.
enum LocalProxy {
    static func isListening(port: UInt16) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        return result == 0
    }

    /// The proxy for `host` only: every other host goes out as usual. Nil when nothing listens on `port`.
    static func configuration(host: String, port: UInt16) -> ProxyConfiguration? {
        guard isListening(port: port), let nwPort = NWEndpoint.Port(rawValue: port) else { return nil }
        var config = ProxyConfiguration(socksv5Proxy: .hostPort(host: "127.0.0.1", port: nwPort))
        config.matchDomains = [host]
        return config
    }
}
