import CryptoKit
import SwiftUI
import UIKit

/// Covers, kept in memory and on disk so they still show with no network.
@MainActor
final class ArtworkCache {
    static let shared = ArtworkCache()
    private let memory = NSCache<NSString, UIImage>()
    private var palettes: [String: [Color]] = [:]
    private let folder = URL.cachesDirectory.appending(path: "artwork")

    /// Covers of kept songs, somewhere iOS doesn't purge.
    private let kept = URL.applicationSupportDirectory.appending(path: "covers")

    private init() {
        memory.totalCostLimit = 64 * 1024 * 1024
        for url in [folder, kept] { try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true) }
    }

    func keep(_ id: String, client: ServerClient) async {
        let file = keptFile(id, client: client)
        guard !FileManager.default.fileExists(atPath: file.path),
              let (data, response) = try? await URLSession.shared.data(from: client.coverURL(id, size: 800)),
              (response as? HTTPURLResponse)?.statusCode == 200, UIImage(data: data) != nil
        else { return }
        try? data.write(to: file, options: .atomic)
    }

    private func keptFile(_ id: String, client: ServerClient) -> URL {
        kept.appending(path: Self.hash(client.coverURL(id, size: 800)))
    }

    private static func hash(_ url: URL) -> String {
        SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func clear() {
        memory.removeAllObjects()
        palettes = [:]
        for url in [folder, kept] {
            try? FileManager.default.removeItem(at: url)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    func cached(_ id: String, size: Int) -> UIImage? { memory.object(forKey: "\(id)@\(size)" as NSString) }

    func image(_ id: String, size: Int, client: ServerClient?) async -> UIImage? {
        if let hit = cached(id, size: size) { return hit }
        #if DEBUG
        if DebugScreen.sample { return store(DebugScreen.art(id), id: id, size: size) }
        #endif
        guard let client else { return nil }
        let url = client.coverURL(id, size: size)
        let file = folder.appending(path: Self.hash(url))
        if let data = await Task.detached(operation: { try? Data(contentsOf: file) }).value, let image = UIImage(data: data) {
            return store(image, id: id, size: size)
        }
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let image = UIImage(data: data)
        else {
            // No network and never seen at this size: the cover kept with the download does.
            return UIImage(contentsOfFile: keptFile(id, client: client).path).map { store($0, id: id, size: size) }
        }
        try? data.write(to: file, options: .atomic)
        return store(image, id: id, size: size)
    }

    private func store(_ image: UIImage, id: String, size: Int) -> UIImage {
        memory.setObject(image, forKey: "\(id)@\(size)" as NSString, cost: Int(image.size.width * image.size.height * 4))
        return image
    }

    /// Nine colours sampled from the cover, row by row.
    func palette(_ id: String, client: ServerClient?) async -> [Color]? {
        if let hit = palettes[id] { return hit }
        guard let source = await image(id, size: 600, client: client)?.cgImage else { return nil }
        var pixels = [UInt8](repeating: 0, count: 36)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress, width: 3, height: 3, bitsPerComponent: 8, bytesPerRow: 12,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.interpolationQuality = .medium
            context.draw(source, in: CGRect(x: 0, y: 0, width: 3, height: 3))
            return true
        }
        guard drawn else { return nil }
        let colors = (0..<9).map { index -> Color in
            let color = UIColor(
                red: CGFloat(pixels[index * 4]) / 255, green: CGFloat(pixels[index * 4 + 1]) / 255,
                blue: CGFloat(pixels[index * 4 + 2]) / 255, alpha: 1
            )
            var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
            color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
            // Capped brightness keeps white text readable over any cover.
            return Color(hue: hue, saturation: min(1, saturation * 1.25), brightness: min(0.55, max(0.16, brightness * 0.8)))
        }
        palettes[id] = colors
        return colors
    }
}

struct Artwork: View {
    @EnvironmentObject private var model: AppModel
    let id: String?
    var symbol = "music.note"
    var size = 300
    var radius: CGFloat = 8
    var circle = false
    @State private var loaded: (id: String, image: UIImage)?

    private var image: UIImage? {
        guard let id else { return nil }
        return loaded?.id == id ? loaded?.image : ArtworkCache.shared.cached(id, size: size)
    }

    private var shape: AnyShape { circle ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: radius, style: .continuous)) }

    var body: some View {
        Color(.secondarySystemFill)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    GeometryReader { proxy in
                        Image(systemName: symbol)
                            .font(.system(size: proxy.size.width * 0.38))
                            .foregroundStyle(.secondary)
                            .frame(width: proxy.size.width, height: proxy.size.height)
                    }
                }
            }
            .clipShape(shape)
            .overlay { shape.stroke(.primary.opacity(0.08), lineWidth: 0.5) }
            .accessibilityHidden(true)
            .task(id: id) {
                guard let id, let image = await ArtworkCache.shared.image(id, size: size, client: model.client) else { return }
                loaded = (id, image)
            }
    }
}

/// A slowly moving mesh in the cover's colours, behind now playing.
struct ArtworkBackground: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let id: String?
    var moving = true
    @State private var colors: [Color] = ArtworkBackground.neutral

    private static let neutral = (0..<9).map { Color(white: 0.28 - Double($0) * 0.02) }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion || !moving)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            let wave = { (speed: Double, phase: Double) in Float(sin(time * speed + phase)) * 0.18 }
            MeshGradient(
                width: 3, height: 3,
                points: [
                    [0, 0], [0.5 + wave(0.23, 0), 0], [1, 0],
                    [0, 0.5 + wave(0.31, 1)], [0.5 + wave(0.41, 2), 0.5 + wave(0.29, 3)], [1, 0.5 + wave(0.19, 4)],
                    [0, 1], [0.5 + wave(0.37, 5), 1], [1, 1],
                ],
                colors: colors
            )
        }
        .ignoresSafeArea()
        .task(id: id) {
            var next = Self.neutral
            if let id, let palette = await ArtworkCache.shared.palette(id, client: model.client) { next = palette }
            withAnimation(.easeInOut(duration: 0.8)) { colors = next }
        }
    }
}
