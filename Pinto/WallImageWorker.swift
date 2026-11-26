import ImageIO
import UIKit

actor WallImageWorker {
  static let shared = WallImageWorker()
  static let editorPreviewMaxPixels = 2560

  func editorPreview(data: Data) throws -> UIImage {
    try Self.downsample(data: data, maxPixels: Self.editorPreviewMaxPixels)
  }

  private static func downsample(data: Data, maxPixels: Int) throws -> UIImage {
    try Task.checkCancellation()
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    let options =
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixels,
      ] as CFDictionary
    guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options)
    else { throw PintoError.invalidImage }
    try Task.checkCancellation()
    return UIImage(cgImage: image)
  }

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
