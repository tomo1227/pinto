import UIKit

extension UIColor {
    convenience init(hex: String) {
        let value = UInt32(hex.dropFirst(), radix: 16) ?? 0x202522
        self.init(red: CGFloat((value >> 16) & 255) / 255,
                  green: CGFloat((value >> 8) & 255) / 255,
                  blue: CGFloat(value & 255) / 255, alpha: 1)
    }
}

enum SceneRenderer {
    static func point(_ position: WallPoint, in size: CGSize) -> CGPoint {
        CGPoint(x: position.x * size.width, y: position.y * size.height)
    }

    static func holdRect(_ hold: Hold, content: WallContent, size: CGSize) -> CGRect {
        let center = point(hold.position, in: size)
        let x = hold.radiusX * size.width
        let y = hold.radiusY * size.height
        let radiusX = content.allowEllipses ? x : max(x, y)
        let radiusY = content.allowEllipses ? y : max(x, y)
        return CGRect(x: center.x - radiusX, y: center.y - radiusY,
                      width: radiusX * 2, height: radiusY * 2)
    }

    static func font(_ style: MarkStyle, unit: CGFloat) -> UIFont {
        let weight: UIFont.Weight
        switch style.fontWeight {
        case ...300: weight = .light
        case ...400: weight = .regular
        case ...600: weight = .semibold
        case ...700: weight = .bold
        default: weight = .black
        }
        let font = UIFont.systemFont(ofSize: style.fontSize * unit, weight: weight)
        let design: UIFontDescriptor.SystemDesign
        switch style.fontFamily {
        case .sans: design = .default
        case .serif: design = .serif
        case .monospace: design = .monospaced
        }
        var descriptor = font.fontDescriptor.withDesign(design) ?? font.fontDescriptor
        if style.isItalic {
            descriptor = descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(.traitItalic))
                ?? descriptor.withMatrix(CGAffineTransform(a: 1, b: 0, c: 0.2, d: 1, tx: 0, ty: 0))
        }
        return UIFont(descriptor: descriptor, size: font.pointSize)
    }

    static func textRect(_ text: WallText, size: CGSize) -> CGRect {
        let textFont = font(text.style, unit: min(size.width, size.height) / 600)
        let dimensions = (text.text as NSString).size(withAttributes: [.font: textFont])
        let center = point(text.position, in: size)
        // Keep edge annotations entirely in the exported image.
        return CGRect(x: max(0, min(size.width - dimensions.width, center.x)),
                      y: max(0, min(size.height - dimensions.height, center.y - dimensions.height / 2)),
                      width: dimensions.width, height: dimensions.height)
    }

    static func draw(image: UIImage, content: WallContent, size: CGSize, context: CGContext) {
        context.saveGState()
        context.clip(to: CGRect(origin: .zero, size: size))
        image.draw(in: CGRect(origin: .zero, size: size))
        let unit = min(size.width, size.height) / 600
        if content.showLines {
            let holds = Dictionary(uniqueKeysWithValues: content.holds.map { ($0.id, $0) })
            let points = content.route.compactMap { holds[$0] }.map { point($0.position, in: size) }
            if let first = points.first, points.count > 1 {
                let path = UIBezierPath()
                path.move(to: first)
                for position in points.dropFirst() { path.addLine(to: position) }
                stroke(path, style: content.lineStyle, unit: unit)
            }
        }
        for hold in content.holds {
            let path = UIBezierPath(ovalIn: holdRect(hold, content: content, size: size))
            stroke(path, style: hold.style, unit: unit)
            if content.effectiveShowRouteNumbers, let index = content.route.firstIndex(of: hold.id) {
                let label = "\(index + 1)" as NSString
                let attributes: [NSAttributedString.Key: Any] = [
                    .font: UIFont.boldSystemFont(ofSize: CGFloat(content.effectiveRouteNumberSize) * unit),
                    .foregroundColor: UIColor(hex: hold.style.color)
                ]
                let dimensions = label.size(withAttributes: attributes)
                let center = point(hold.position, in: size)
                label.draw(at: CGPoint(x: center.x - dimensions.width / 2,
                                       y: center.y - dimensions.height / 2),
                           withAttributes: attributes)
            }
        }
        for text in content.texts {
            let rect = textRect(text, size: size)
            var attributes: [NSAttributedString.Key: Any] = [
                .font: font(text.style, unit: unit),
                .foregroundColor: UIColor(hex: text.style.color)
            ]
            if text.style.outlineWidth > 0 {
                attributes[.strokeColor] = UIColor(hex: text.style.outlineColor)
                attributes[.strokeWidth] = text.style.outlineWidth / text.style.fontSize * 200
                (text.text as NSString).draw(at: rect.origin, withAttributes: attributes)
                attributes.removeValue(forKey: .strokeWidth)
                attributes.removeValue(forKey: .strokeColor)
            }
            (text.text as NSString).draw(at: rect.origin, withAttributes: attributes)
        }
        context.restoreGState()
    }

    private static func stroke(_ path: UIBezierPath, style: MarkStyle, unit: CGFloat) {
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        if style.outlineWidth > 0 {
            UIColor(hex: style.outlineColor).setStroke()
            path.lineWidth = (style.width + style.outlineWidth * 2) * unit
            path.stroke()
        }
        UIColor(hex: style.color).setStroke()
        path.lineWidth = style.width * unit
        path.stroke()
    }

    static func render(image: UIImage, content: WallContent, maxDimension: CGFloat? = nil) -> UIImage {
        let original = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let ratio = maxDimension.map { min(1, $0 / max(original.width, original.height)) } ?? 1
        let size = CGSize(width: original.width * ratio, height: original.height * ratio)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            draw(image: image, content: content, size: size, context: renderer.cgContext)
        }
    }
}
