import OSLog
import UIKit

extension UIColor {
  convenience init(hex: String) {
    let value = UInt32(hex.dropFirst(), radix: 16) ?? 0x202522
    self.init(
      red: CGFloat((value >> 16) & 255) / 255,
      green: CGFloat((value >> 8) & 255) / 255,
      blue: CGFloat(value & 255) / 255, alpha: 1)
  }
}

enum SceneRenderer {
  private static let logger = Logger(subsystem: "com.tomokiota.pinto", category: "SceneRenderer")

  static func markUnit(for size: CGSize) -> CGFloat {
    min(size.width, size.height) / 600
  }

  static func point(_ position: WallPoint, in size: CGSize) -> CGPoint {
    CGPoint(x: position.x * size.width, y: position.y * size.height)
  }

  static func holdRect(_ hold: Hold, content: WallContent, size: CGSize) -> CGRect {
    let center = point(hold.position, in: size)
    let x = hold.radiusX * size.width
    let y = hold.radiusY * size.height
    let locked = content.locksHoldAspectRatio(hold)
    let radiusX = locked ? max(x, y) : x
    let radiusY = locked ? max(x, y) : y
    return CGRect(
      x: center.x - radiusX, y: center.y - radiusY,
      width: radiusX * 2, height: radiusY * 2)
  }

  static func holdPath(_ hold: Hold, content: WallContent, size: CGSize, padding: CGFloat = 0)
    -> UIBezierPath
  {
    let rect = holdRect(hold, content: content, size: size).insetBy(dx: -padding, dy: -padding)
    switch hold.effectiveShape {
    case .oval: return UIBezierPath(ovalIn: rect)
    case .rectangle: return UIBezierPath(rect: rect)
    }
  }

  static func font(_ style: MarkStyle, unit: CGFloat) -> UIFont {
    let size = style.fontSize * unit
    let systemFont = UIFont.systemFont(ofSize: size, weight: systemFontWeight(style.fontWeight))
    let descriptor = fontDescriptor(for: style, systemFont: systemFont)
    guard style.isItalic else { return UIFont(descriptor: descriptor, size: size) }
    let italicDescriptor =
      descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(.traitItalic))
      ?? descriptor.withMatrix(CGAffineTransform(a: 1, b: 0, c: 0.2, d: 1, tx: 0, ty: 0))
    return UIFont(descriptor: italicDescriptor, size: size)
  }

  private static func systemFontWeight(_ weight: Int) -> UIFont.Weight {
    switch weight {
    case ...300: return .light
    case ...400: return .regular
    case ...600: return .semibold
    case ...700: return .bold
    default: return .black
    }
  }

  private static func fontDescriptor(for style: MarkStyle, systemFont: UIFont) -> UIFontDescriptor {
    switch style.fontFamily {
    case .sans:
      return systemFont.fontDescriptor
    case .serif:
      return systemFont.fontDescriptor.withDesign(.serif) ?? systemFont.fontDescriptor
    case .monospace:
      return systemFont.fontDescriptor.withDesign(.monospaced) ?? systemFont.fontDescriptor
    case .roundedGothic:
      return namedFont("HiraMaruProN-W4", fallback: systemFont).fontDescriptor
    case .condensed:
      return namedFont(condensedFontName(style.fontWeight), fallback: systemFont).fontDescriptor
    case .handwritten:
      let face = style.isBold ? "MarkerFelt-Wide" : "MarkerFelt-Thin"
      return namedFont(face, fallback: systemFont).fontDescriptor
    }
  }

  private static func condensedFontName(_ weight: Int) -> String {
    switch weight {
    case ...400: return "AvenirNextCondensed-Regular"
    case ...600: return "AvenirNextCondensed-DemiBold"
    case ...700: return "AvenirNextCondensed-Bold"
    default: return "AvenirNextCondensed-Heavy"
    }
  }

  private static func namedFont(_ name: String, fallback: UIFont) -> UIFont {
    if let font = UIFont(name: name, size: fallback.pointSize) { return font }
    logger.error("Built-in font \(name, privacy: .public) is unavailable. Using the system font.")
    return fallback
  }

  static func textRect(_ text: WallText, size: CGSize) -> CGRect {
    let textFont = font(text.style, unit: markUnit(for: size))
    let dimensions = (text.text as NSString).size(withAttributes: [.font: textFont])
    let center = point(text.position, in: size)
    // Keep edge annotations entirely in the exported image.
    return CGRect(
      x: max(0, min(size.width - dimensions.width, center.x)),
      y: max(0, min(size.height - dimensions.height, center.y - dimensions.height / 2)),
      width: dimensions.width, height: dimensions.height)
  }

  static func textAttributes(_ style: MarkStyle, unit: CGFloat) -> [NSAttributedString.Key: Any] {
    var attributes: [NSAttributedString.Key: Any] = [
      .font: font(style, unit: unit),
      .foregroundColor: UIColor(hex: style.color),
    ]
    if style.outlineWidth > 0 {
      attributes[.strokeColor] = UIColor(hex: style.outlineColor)
      // A negative width paints both the fill and the stroke.
      attributes[.strokeWidth] = -style.outlineWidth / style.fontSize * 200
    }
    return attributes
  }

  static func draw(image: UIImage, content: WallContent, size: CGSize, context: CGContext) {
    image.draw(in: CGRect(origin: .zero, size: size))
    drawAnnotations(content: content, size: size, context: context)
  }

  static func routeNumbers(for route: [UUID]) -> [UUID: Int] {
    Dictionary(
      route.enumerated().map { ($0.element, $0.offset + 1) },
      uniquingKeysWith: { first, _ in first })
  }

  static func drawAnnotations(
    content: WallContent, size: CGSize, context: CGContext, routeNumbers: [UUID: Int]? = nil
  ) {
    context.saveGState()
    context.clip(to: CGRect(origin: .zero, size: size))
    let unit = markUnit(for: size)
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
    let numbers =
      content.effectiveShowRouteNumbers
      ? routeNumbers ?? Self.routeNumbers(for: content.route) : [:]
    let numberFont =
      numbers.isEmpty
      ? nil : UIFont.boldSystemFont(ofSize: CGFloat(content.effectiveRouteNumberSize) * unit)
    for hold in content.holds {
      let path = holdPath(hold, content: content, size: size)
      stroke(path, style: hold.style, unit: unit)
      if let numberFont, let number = numbers[hold.id] {
        let label = "\(number)" as NSString
        let attributes: [NSAttributedString.Key: Any] = [
          .font: numberFont,
          .foregroundColor: UIColor(hex: content.routeNumberColor ?? hold.style.color),
        ]
        let dimensions = label.size(withAttributes: attributes)
        let center = point(hold.position, in: size)
        label.draw(
          at: CGPoint(
            x: center.x - dimensions.width / 2,
            y: center.y - dimensions.height / 2),
          withAttributes: attributes)
      }
    }
    for text in content.texts {
      let rect = textRect(text, size: size)
      var attributes = textAttributes(text.style, unit: unit)
      let label = text.text as NSString
      if let strokeWidth = attributes[.strokeWidth] as? Double {
        attributes[.strokeWidth] = -strokeWidth
        label.draw(at: rect.origin, withAttributes: attributes)
        attributes.removeValue(forKey: .strokeWidth)
        attributes.removeValue(forKey: .strokeColor)
      }
      label.draw(at: rect.origin, withAttributes: attributes)
    }
    context.restoreGState()
  }

  private static func stroke(_ path: UIBezierPath, style: MarkStyle, unit: CGFloat) {
    path.lineCapStyle = .round
    path.lineJoinStyle = .round
    if style.outlineWidth > 0 {
      UIColor(hex: style.outlineColor).setStroke()
      path.lineWidth = style.outlinedWidth * unit
      path.stroke()
    }
    UIColor(hex: style.color).setStroke()
    path.lineWidth = style.width * unit
    path.stroke()
  }

  static func render(image: UIImage, content: WallContent, maxDimension: CGFloat? = nil) -> UIImage
  {
    let original = CGSize(
      width: image.size.width * image.scale, height: image.size.height * image.scale)
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
