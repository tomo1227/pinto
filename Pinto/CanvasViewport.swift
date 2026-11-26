import CoreGraphics

struct CanvasViewport {
  private(set) var zoom: CGFloat = 1
  private(set) var offset = CGPoint.zero

  func imageRect(in bounds: CGRect, imageSize: CGSize) -> CGRect {
    let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height) * zoom
    let width = imageSize.width * scale
    let height = imageSize.height * scale
    return CGRect(
      x: (bounds.width - width) / 2 + offset.x,
      y: (bounds.height - height) / 2 + offset.y, width: width, height: height)
  }

  mutating func pan(by translation: CGPoint, from origin: CGPoint? = nil) {
    let origin = origin ?? offset
    offset = CGPoint(x: origin.x + translation.x, y: origin.y + translation.y)
  }

  mutating func magnify(by scale: CGFloat, at anchor: CGPoint, in bounds: CGRect, imageSize: CGSize)
  {
    let oldRect = imageRect(in: bounds, imageSize: imageSize)
    let nextZoom = min(8, max(0.5, zoom * scale))
    let ratio = nextZoom / zoom
    offset.x =
      anchor.x - bounds.midX - (anchor.x - oldRect.minX) * ratio + oldRect.width * ratio / 2
    offset.y =
      anchor.y - bounds.midY - (anchor.y - oldRect.minY) * ratio + oldRect.height * ratio / 2
    zoom = nextZoom
  }

  static func local(_ point: CGPoint, in imageRect: CGRect) -> CGPoint {
    CGPoint(x: point.x - imageRect.minX, y: point.y - imageRect.minY)
  }

  static func normalized(_ point: CGPoint, in imageRect: CGRect) -> WallPoint {
    let point = local(point, in: imageRect)
    return WallPoint(x: point.x / imageRect.width, y: point.y / imageRect.height).clamped()
  }

  static func canvasPoint(_ position: WallPoint, in imageRect: CGRect) -> CGPoint {
    CGPoint(
      x: imageRect.minX + position.x * imageRect.width,
      y: imageRect.minY + position.y * imageRect.height)
  }
}
