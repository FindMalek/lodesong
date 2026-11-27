import SwiftUI
import UIKit

/// Light or dark, and the colour of everything tappable. Set once at the root.
enum Theme {
    static func colorScheme(_ appearance: String) -> ColorScheme? {
        appearance == "light" ? .light : appearance == "dark" ? .dark : nil
    }

    static func tint(_ name: String, custom: String) -> Color {
        switch name {
        case "blue": return .blue
        case "custom": return color(hex: custom) ?? .accent
        default: return .accent
        }
    }

    /// "RRGGBB", how the custom colour is stored.
    static func color(hex: String) -> Color? {
        guard hex.count == 6, let value = Int(hex, radix: 16) else { return nil }
        return Color(red: Double(value >> 16) / 255, green: Double(value >> 8 & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }

    static func hex(_ color: Color) -> String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        // A wide gamut pick can lie outside 0...1.
        let byte = { (part: CGFloat) in Int((min(1, max(0, part)) * 255).rounded()) }
        return String(format: "%02X%02X%02X", byte(red), byte(green), byte(blue))
    }
}
