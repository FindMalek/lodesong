import Foundation

/// One server, reachable two ways: the main address (say at home) and a second one (say away).
enum ServerAddresses {
    /// The main address whenever it answers, else the second, else stay put.
    static func pick(main: URL, second: URL?, current: URL, reachable: (URL) async -> Bool) async -> URL {
        guard let second else { return main }
        if await reachable(main) { return main }
        if await reachable(second) { return second }
        return current == second ? second : main
    }

    /// A second address that holds another library would have the next sync replace this one, downloads and all.
    static func sameLibrary(known: Set<String>, found: [String]) -> Bool {
        known.isEmpty || (!found.isEmpty && found.filter(known.contains).count * 2 >= found.count)
    }
}

extension ServerClient {
    /// Asked without the session cookie: whatever answers on this network may not be the server.
    func reachable() async -> Bool {
        var request = URLRequest(url: url("healthz"))
        request.timeoutInterval = 3
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, status) = try? await send(request) else { return false }
        return status == 200 && String(decoding: data, as: UTF8.self) == "ok"
    }
}
