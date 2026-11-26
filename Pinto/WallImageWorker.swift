import UIKit

actor WallImageWorker {
  static let shared = WallImageWorker()

  func detectHold(
    in image: UIImage, at position: WallPoint, style: MarkStyle, shape: HoldShape?
  ) throws -> Hold? {
    try Task.checkCancellation()
    return try HoldDetection.detect(image: image, position: position, style: style, shape: shape)
  }

  func render(image: UIImage, content: WallContent) throws -> UIImage {
    try Task.checkCancellation()
    return SceneRenderer.render(image: image, content: content)
  }

  func exportPNG(image: UIImage, content: WallContent) throws -> Data {
    let rendered = try render(image: image, content: content)
    try Task.checkCancellation()
    guard let data = rendered.pngData() else { throw PintoError.exportFailed }
    return data
  }

  func normalize(_ image: UIImage) throws -> Data {
    try Task.checkCancellation()
    return try image.normalizedPNG()
  }
}
