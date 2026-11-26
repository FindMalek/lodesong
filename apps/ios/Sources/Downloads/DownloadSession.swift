import Foundation

/// The background `URLSession`: transfers carry on while the app is suspended or gone, and report here.
/// All state is only touched on the serial delegate queue.
final class DownloadSession: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    static let identifier = "engineer.findmalek.lodesong.ios.downloads"

    /// The account being downloaded for.
    private var library: DownloadLibrary
    private let changed: @Sendable (_ failed: Set<String>) -> Void
    private let queue = OperationQueue()
    private var session: URLSession!
    /// Not tried again until the next sync, so a song the server can't deliver doesn't loop.
    private var failed: Set<String> = []
    private var eventsDone = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(library: DownloadLibrary, changed: @escaping @Sendable (Set<String>) -> Void) {
        self.library = library
        self.changed = changed
        super.init()
        queue.maxConcurrentOperationCount = 1
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.httpMaximumConnectionsPerHost = 3
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    }

    /// Makes the running transfers match what is pending: starts what's missing, cancels what no longer applies.
    /// With no client (signed out) everything is cancelled; the files stay.
    /// Returns once the transfers are queued with the system, so a background wake can safely end.
    func schedule(_ library: DownloadLibrary, client: ServerClient?, quality: DownloadQuality, wifiOnly: Bool, retry: Bool) async {
        await withCheckedContinuation { done in
            // In call order on the delegate queue, so a later account switch can't be overtaken by an earlier one.
            queue.addOperation { [self] in
                if library.key != self.library.key { failed = [] }
                self.library = library
                reconcileTasks(client: client, quality: quality, wifiOnly: wifiOnly, retry: retry) { done.resume() }
            }
        }
    }

    private func reconcileTasks(client: ServerClient?, quality: DownloadQuality, wifiOnly: Bool, retry: Bool, done: @escaping @Sendable () -> Void) {
        // `getAllTasks` answers on the delegate queue, so two calls can't start the same song twice.
        session.getAllTasks { [self] tasks in
            defer { done() }
            if retry { failed = [] }
            var wanted: [String: URLRequest] = [:]
            let pending = client == nil ? [] : library.pending()
            if let client {
                for song in pending { wanted[song.id] = request(song, client: client, quality: quality, wifiOnly: wifiOnly) }
            }
            var running: Set<String> = []
            for task in tasks where task.state == .running || task.state == .suspended {
                if let id = song(task), let request = wanted[id], matches(task, request), running.insert(id).inserted { continue }
                task.cancel()
            }
            for song in pending where !running.contains(song.id) && !failed.contains(song.id) {
                guard let request = wanted[song.id] else { continue }
                start(song.id, request)
            }
            changed(failed)
        }
    }

    /// Returns once the system has handed over everything that finished while the app wasn't running.
    func finishEvents() async {
        await withCheckedContinuation { continuation in
            queue.addOperation { [self] in
                if eventsDone {
                    eventsDone = false
                    continuation.resume()
                } else {
                    waiting.append(continuation)
                }
            }
        }
    }

    private func request(_ song: Song, client: ServerClient, quality: DownloadQuality, wifiOnly: Bool) -> URLRequest {
        let url = DownloadLibrary.url(song, quality: quality, client: client)
        var request = URLRequest(url: url)
        request.setValue("1", forHTTPHeaderField: "x-lodesong")
        for (name, value) in HTTPCookie.requestHeaderFields(with: HTTPCookieStorage.shared.cookies(for: url) ?? []) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.allowsCellularAccess = !wifiOnly
        request.allowsExpensiveNetworkAccess = !wifiOnly
        return request
    }

    private func matches(_ task: URLSessionTask, _ request: URLRequest) -> Bool {
        task.originalRequest?.url == request.url && task.originalRequest?.allowsCellularAccess == request.allowsCellularAccess
    }

    private func start(_ id: String, _ request: URLRequest) {
        if let data = library.resumeData(song: id) {
            let task = session.downloadTask(withResumeData: data)
            if matches(task, request) {
                task.taskDescription = tag(id)
                task.resume()
                return
            }
            // Made for another server, quality or network rule.
            task.cancel()
            library.setResumeData(nil, song: id)
        }
        let task = session.downloadTask(with: request)
        task.taskDescription = tag(id)
        task.resume()
    }

    private func tag(_ id: String) -> String { "\(library.key)\n\(id)" }

    /// The song a task is for, unless it belongs to another account.
    private func song(_ task: URLSessionTask) -> String? {
        let parts = task.taskDescription?.split(separator: "\n", maxSplits: 1).map(String.init) ?? []
        return parts.count == 2 && parts[0] == library.key ? parts[1] : nil
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let id = song(downloadTask), let requested = downloadTask.originalRequest?.url else { return }
        // The file is gone when this returns, so it is checked and moved right here.
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        library.setResumeData(nil, song: id)
        if !library.accept(song: id, file: location, status: status, requested: requested), library.pending().contains(where: { $0.id == id }) {
            failed.insert(id)
            AppLog.shared.add("Download refused: song \(id), status \(status)")
        }
        changed(failed)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = song(task), let error = error as? URLError else { return }
        let resume = error.downloadTaskResumeData
        // A cancel without resume data is our own; with it, the app was closed mid-transfer.
        if error.code == .cancelled {
            if let resume { library.setResumeData(resume, song: id) }
            return
        }
        library.setResumeData(resume, song: id)
        failed.insert(id)
        AppLog.shared.add("Download failed: song \(id), \(error.localizedDescription)")
        changed(failed)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        if waiting.isEmpty {
            eventsDone = true
        } else {
            waiting.forEach { $0.resume() }
            waiting = []
        }
    }
}
