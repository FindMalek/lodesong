import CoreImage
import SwiftUI
import UIKit

/// An uploaded picture, or the same generated aura and dither the web player draws for this id.
struct PictureCover: View {
    @EnvironmentObject private var model: AppModel
    let seed: String
    var version: String?
    var radius: CGFloat = 10
    @State private var picture: UIImage?
    @State private var loadedVersion: String?
    /// So a tile scrolled back into view has its picture on the first frame.
    private static let cache = NSCache<NSString, UIImage>()

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        Color(.secondarySystemBackground)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let shown = version.flatMap({ Self.cache.object(forKey: $0 as NSString) }) ?? (loadedVersion == version ? picture : nil) {
                    Image(uiImage: shown).resizable().scaledToFill()
                } else {
                    let art = Aura.images(seed)
                    Image(uiImage: art.aura).resizable().foregroundStyle(.primary)
                    Image(uiImage: art.dither).interpolation(.none).resizable().foregroundStyle(.primary).opacity(0.3)
                }
            }
            .clipShape(shape)
            .overlay { shape.stroke(.primary.opacity(0.08), lineWidth: 0.5) }
            .accessibilityHidden(true)
            // A picture that was still on its way shows once the sync ends.
            .task(id: "\(version ?? "") \(model.syncing)") {
                guard let version else { return }
                let file = ShelfSync.file(version)
                picture = await Task.detached { UIImage(contentsOfFile: file.path) }.value
                if let picture { Self.cache.setObject(picture, forKey: version as NSString) }
                loadedVersion = version
            }
    }
}

/// A port of the web player's `lib/aura.ts` (for a folder, which has no songs) and `shared/dither.ts`.
@MainActor
private enum Aura {
    private static let context = CIContext()
    private static var cache: [String: (aura: UIImage, dither: UIImage)] = [:]

    static func images(_ seed: String) -> (aura: UIImage, dither: UIImage) {
        if let hit = cache[seed] { return hit }
        let key = "folder:\(seed)"
        let made = (aura: aura(key), dither: dither(hash(key)))
        cache[seed] = made
        return made
    }

    private static func hash(_ text: String) -> UInt32 {
        text.utf16.reduce(0x811c9dc5) { ($0 ^ UInt32($1)) &* 0x01000193 }
    }

    private struct Random {
        var state: UInt32
        mutating func next() -> Double {
            state = state &+ 0x6d2b79f5
            var value = (state ^ (state >> 15)) &* (1 | state)
            value = (value &+ ((value ^ (value >> 7)) &* (61 | value))) ^ value
            return Double(value ^ (value >> 14)) / 4294967296
        }
    }

    private static func noise(_ seed: UInt32, _ x: Double, _ y: Double) -> Double {
        let (x0, y0) = (floor(x), floor(y))
        func corner(_ cx: Double, _ cy: Double) -> Double { Double(hash("\(seed):\(Int(cx)):\(Int(cy))")) / 4294967296 }
        func smooth(_ v: Double) -> Double { v * v * (3 - 2 * v) }
        func mix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
        let (fx, fy) = (smooth(x - x0), smooth(y - y0))
        return mix(mix(corner(x0, y0), corner(x0 + 1, y0), fx), mix(corner(x0, y0 + 1), corner(x0 + 1, y0 + 1), fx), fy)
    }

    /// The web draws a 160 px folder on an 80 px canvas and blurs it; the same numbers, drawn four times as sharp.
    private static func aura(_ id: String) -> UIImage {
        let seed = hash(id)
        var random = Random(state: seed)
        let clamp = { (v: Double) in max(0, min(1, v)) }
        let energy = clamp(0.5 + (random.next() - 0.5) * 0.12)
        let organic = (random.next() - 0.5) * 0.1
        let softness = clamp(0.7 - energy * 0.6 + (random.next() - 0.5) * 0.1)
        let density = clamp(0.35 + energy * 0.5 + (random.next() - 0.5) * 0.15)
        let side = 80.0
        let format = UIGraphicsImageRendererFormat()
        format.scale = 4
        let sharp = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { renderer in
            let context = renderer.cgContext
            if clamp(0.5 + organic) >= 0.5 {
                var random = Random(state: seed)
                let lines = Int(((60 + density * 260) * 0.5).rounded())
                context.setLineWidth((0.6 + energy * 1.4) * 0.6)
                context.setLineCap(.round)
                for _ in 0..<lines {
                    var x = random.next() * side
                    var y = random.next() * side
                    context.setStrokeColor(UIColor.black.withAlphaComponent(0.08 + random.next() * 0.4 * (0.4 + energy)).cgColor)
                    context.move(to: CGPoint(x: x, y: y))
                    for _ in 0..<22 {
                        let angle = noise(seed, x, y) * .pi * 4
                        x += cos(angle) * 3.2 * 0.6
                        y += sin(angle) * 3.2 * 0.6
                        context.addLine(to: CGPoint(x: x, y: y))
                    }
                    context.strokePath()
                }
            } else {
                let cell = 3.0
                context.setFillColor(UIColor.black.withAlphaComponent(0.2 + energy * 0.6).cgColor)
                for y in stride(from: cell / 2, to: side, by: cell) {
                    for x in stride(from: cell / 2, to: side, by: cell) {
                        let level = clamp((noise(seed, x / (cell * 7), y / (cell * 7)) - 0.25) / 0.6)
                        let radius = (cell / 2) * level * level * (3 - 2 * level)
                        if radius >= 0.4 { context.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)) }
                    }
                }
            }
        }
        return blurred(sharp, radius: softness * 6 * 4).withRenderingMode(.alwaysTemplate)
    }

    private static func blurred(_ image: UIImage, radius: Double) -> UIImage {
        guard radius > 0.4, let input = CIImage(image: image) else { return image }
        let output = input.clampedToExtent().applyingGaussianBlur(sigma: radius).cropped(to: input.extent)
        guard let made = context.createCGImage(output, from: input.extent) else { return image }
        return UIImage(cgImage: made)
    }

    /// One still ordered-dither frame, a pixel per cell.
    private static func dither(_ seed: UInt32) -> UIImage {
        let bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
        func unit(_ salt: UInt32) -> Double { Double(((seed ^ (salt &* 0x9e3779b1)) &* 0x85ebca6b) >> 8) / 16777216 }
        let (cx, cy) = (0.2 + unit(1) * 0.6, 0.2 + unit(2) * 0.6)
        let (angle, phase, reach) = (unit(3) * .pi * 2, unit(4) * .pi * 2, 0.45 + unit(5) * 0.3)
        let (x0, y0) = (cx + cos(phase) * 0.12, cy + sin(phase) * 0.12)
        let side = 40
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            UIColor.black.setFill()
            for row in 0..<side {
                for column in 0..<side {
                    let (x, y) = (Double(column) / Double(side), Double(row) / Double(side))
                    let glow = max(0, 1 - hypot(x - x0, y - y0) / reach)
                    let ramp = (x * cos(angle) + y * sin(angle) + 1) / 2
                    if glow * 0.9 + ramp * 0.1 > (Double(bayer[(row % 4) * 4 + column % 4]) + 0.5) / 16 {
                        context.fill(CGRect(x: column, y: row, width: 1, height: 1))
                    }
                }
            }
        }
        .withRenderingMode(.alwaysTemplate)
    }
}
