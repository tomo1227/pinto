import ImageIO
import UIKit

actor WallThumbnailCache {
  static let shared = WallThumbnailCache()

  struct Key: Hashable {
    let id: UUID
    let updatedAt: Date
    let maxPixels: Int

    var cacheKey: NSString {
      "\(id.uuidString)/\(updatedAt.timeIntervalSinceReferenceDate)/\(maxPixels)" as NSString
    }
  }

  private let images: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.totalCostLimit = 24 * 1024 * 1024
    return cache
  }()

  func image(for key: Key, content: WallContent, photoURL: URL) throws -> UIImage {
    try Task.checkCancellation()
    if let cached = images.object(forKey: key.cacheKey) { return cached }
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    let thumbnailOptions =
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: key.maxPixels,
      ] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(photoURL as CFURL, sourceOptions),
      let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions)
    else { throw PintoError.invalidImage }
    try Task.checkCancellation()
    let image = SceneRenderer.render(image: UIImage(cgImage: bitmap), content: content)
    images.setObject(image, forKey: key.cacheKey, cost: bitmap.width * bitmap.height * 4)
    return image
  }
}
