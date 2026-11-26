import Combine

/// Something slow to make, made one at a time: asks that arrive meanwhile collapse into the last one,
/// and the old value stays in use until the new one is ready.
@MainActor
final class LatestBuild<Key: Equatable, Value>: ObservableObject {
    @Published private(set) var value: Value?
    /// Moves every time `value` is replaced.
    @Published private(set) var generation = 0
    private(set) var running: Task<Void, Never>?
    private var built: Key?
    private var next: (key: Key, make: () async -> Value)?

    func want(_ key: Key, make: @escaping () async -> Value) {
        next = (key, make)
        guard running == nil, key != built else { return }
        running = Task {
            while let wanted = next, wanted.key != built {
                value = await wanted.make()
                built = wanted.key
                generation += 1
            }
            running = nil
        }
    }
}
