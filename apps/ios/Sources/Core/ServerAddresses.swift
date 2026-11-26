import Foundation

/// One server, reachable two ways: the main address (say at home) and a second one (say away).
enum ServerAddresses {
    /// Only between two https addresses does the app move by itself: with plain http, whatever holds that address
    /// on the network at hand would be sent the session.
    static func automatic(main: URL, second: URL?) -> Bool {
        main.scheme == "https" && second?.scheme == "https"
    }

    /// Where to be before asking anyone: what the user picked, else an https address over an http one, else the main.
    /// With no pick this is also the only address whose "signed out" asks for the password again.
    static func starting(main: URL, second: URL?, picked: URL? = nil) -> URL {
        guard let second else { return main }
        if automatic(main: main, second: second) { return main }
        if let picked, picked == main || picked == second { return picked }
        return main.scheme != "https" && second.scheme == "https" ? second : main
    }

    /// The main address whenever it answers, else the second, else stay put. Not automatic: nothing is asked.
    static func pick(main: URL, second: URL?, picked: URL?, current: URL, reachable: (URL) async -> Bool) async -> URL {
        guard let second, automatic(main: main, second: second) else { return starting(main: main, second: second, picked: picked) }
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
