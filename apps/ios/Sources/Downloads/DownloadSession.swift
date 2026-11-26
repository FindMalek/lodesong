import Foundation

/// The background `URLSession`: transfers carry on while the app is suspended or gone, and report here.
/// All state is only touched on the serial delegate queue.
final class DownloadSession: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    static let identifier = "engineer.findmalek.lodesong.ios.downloads"

    private let library: DownloadLibrary
    private let changed: @Sendable (_ failures: Int) -> Void
    private let queue = OperationQueue()
    private var session: URLSession!
    /// Not tried again until the next sync, so a song the server can't deliver doesn't loop.
    private var failed: Set<String> = []
    private var eventsDone = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(library: DownloadLibrary, changed: @escaping @Sendable (Int) -> Void) {
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
    func schedule(client: ServerClient?, quality: DownloadQuality, wifiOnly: Bool, retry: Bool) {
        // `getAllTasks` answers on the delegate queue, so two calls can't start the same song twice.
        session.getAllTasks { [self] tasks in
            if retry { failed = [] }
            var wanted: [String: URLRequest] = [:]
            let pending = client == nil ? [] : library.pending()
            if let client {
                for song in pending { wanted[song.id] = request(song, client: client, quality: quality, wifiOnly: wifiOnly) }
            }
            var running: Set<String> = []
            for task in tasks where task.state == .running || task.state == .suspended {
                if let id = task.taskDescription, let request = wanted[id], matches(task, request), running.insert(id).inserted { continue }
                task.cancel()
            }
            for song in pending where !running.contains(song.id) && !failed.contains(song.id) {
                guard let request = wanted[song.id] else { continue }
                start(song.id, request)
            }
            changed(failed.count)
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
                task.taskDescription = id
                task.resume()
                return
            }
            // Made for another server, quality or network rule.
            task.cancel()
            library.setResumeData(nil, song: id)
        }
        let task = session.downloadTask(with: request)
        task.taskDescription = id
        task.resume()
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let id = downloadTask.taskDescription else { return }
        // The file is gone when this returns, so it is checked and moved right here.
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        library.setResumeData(nil, song: id)
        if !library.accept(song: id, file: location, status: status), library.pending().contains(where: { $0.id == id }) {
            failed.insert(id)
        }
        changed(failed.count)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = task.taskDescription, let error = error as? URLError else { return }
        let resume = error.downloadTaskResumeData
        // A cancel without resume data is our own; with it, the app was closed mid-transfer.
        if error.code == .cancelled {
            if let resume { library.setResumeData(resume, song: id) }
            return
        }
        library.setResumeData(resume, song: id)
        failed.insert(id)
        changed(failed.count)
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
