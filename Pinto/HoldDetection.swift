import UIKit

enum HoldDetection {
  static func detect(
    image: UIImage, position: WallPoint, style: MarkStyle, shape: HoldShape? = nil
  ) throws -> Hold? {
    guard let source = image.cgImage else { throw PintoError.invalidImage }
    let size = min(320, source.width, source.height)
    guard size >= 32 else { return nil }
    let seedX = min(source.width - 1, max(0, Int(position.x * Double(source.width))))
    let seedY = min(source.height - 1, max(0, Int(position.y * Double(source.height))))
    let left = min(source.width - size, max(0, seedX - size / 2))
    let top = min(source.height - size, max(0, seedY - size / 2))
    guard let patch = source.cropping(to: CGRect(x: left, y: top, width: size, height: size)) else {
      throw PintoError.invalidImage
    }
    var pixels = [UInt8](repeating: 0, count: size * size * 4)
    let result: Hold? = try pixels.withUnsafeMutableBytes { bytes in
      guard
        let context = CGContext(
          data: bytes.baseAddress, width: size, height: size,
          bitsPerComponent: 8, bytesPerRow: size * 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else {
        throw PintoError.invalidImage
      }
      context.draw(patch, in: CGRect(x: 0, y: 0, width: size, height: size))
      let buffer = bytes.bindMemory(to: UInt8.self)
      guard
        let bounds = estimate(
          pixels: UnsafeBufferPointer(buffer), width: size, height: size,
          seedX: seedX - left, seedY: seedY - top)
      else { return nil }
      let imageSize = CGSize(width: source.width, height: source.height)
      let clearance = style.outlinedWidth * SceneRenderer.markUnit(for: imageSize) / 2
      let rx = bounds.width / 2
      let ry = bounds.height / 2
      let shortRadius = min(rx, ry)
      func fittedRadius(_ radius: CGFloat) -> CGFloat {
        if shape == .rectangle { return radius + clearance }
        // Bound the ellipse plus a clearance disk, with exact clearance on the short axis.
        // Adding clearance independently to each radius underestimates it along diagonals.
        return sqrt(
          radius * radius * (1 + clearance / shortRadius)
            + clearance * (shortRadius + clearance))
      }
      return Hold(
        position: WallPoint(
          x: (Double(left) + bounds.midX) / Double(source.width),
          y: (Double(top) + bounds.midY) / Double(source.height)),
        radiusX: fittedRadius(rx) / imageSize.width,
        radiusY: fittedRadius(ry) / imageSize.height,
        style: style, shape: shape)
    }
    return result
  }

  static func estimate(
    pixels: UnsafeBufferPointer<UInt8>, width: Int, height: Int,
    seedX: Int, seedY: Int
  ) -> CGRect? {
    guard width >= 8, height >= 8, pixels.count == width * height * 4,
      (0..<width).contains(seedX), (0..<height).contains(seedY)
    else { return nil }
    func color(_ x: Int, _ y: Int) -> [Double] {
      let index = (y * width + x) * 4
      return (0..<3).map { Double(pixels[index + $0]) }
    }
    func distance(_ a: [Double], _ b: [Double]) -> Double {
      sqrt(zip(a, b).reduce(0) { $0 + pow($1.0 - $1.1, 2) })
    }
    let background = backgroundColor(width: width, height: height, colorAt: color)
    let seed = color(seedX, seedY)
    let separation = distance(seed, background)
    guard separation >= 28 else { return nil }
    let limit = min(112, max(28, separation * 0.72))
    let margin = max(8, separation * 0.08)
    var visited = [Bool](repeating: false, count: width * height)
    var queue = [seedY * width + seedX]
    visited[queue[0]] = true
    var head = 0
    var minX = seedX
    var maxX = seedX
    var minY = seedY
    var maxY = seedY
    while head < queue.count {
      let index = queue[head]
      head += 1
      let x = index % width
      let y = index / width
      minX = min(minX, x)
      maxX = max(maxX, x)
      minY = min(minY, y)
      maxY = max(maxY, y)
      for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] {
        guard (0..<width).contains(nx), (0..<height).contains(ny) else { continue }
        let next = ny * width + nx
        guard !visited[next] else { continue }
        visited[next] = true
        let candidate = color(nx, ny)
        let fromSeed = distance(candidate, seed)
        if fromSeed <= limit && fromSeed + margin < distance(candidate, background) {
          queue.append(next)
          if queue.count > width * height * 3 / 10 { return nil }
        }
      }
    }
    guard queue.count >= 24, maxX - minX >= 7, maxY - minY >= 7,
      minX > 1, minY > 1, maxX < width - 2, maxY < height - 2
    else { return nil }
    let centerX = Double(minX + maxX) / 2
    let centerY = Double(minY + maxY) / 2
    let rx = Double(maxX - minX + 1) / 2
    let ry = Double(maxY - minY + 1) / 2
    var scale = 1.0
    for index in queue {
      scale = max(
        scale,
        hypot(
          (Double(index % width) - centerX) / rx,
          (Double(index / width) - centerY) / ry))
    }
    return CGRect(
      x: centerX - rx * scale - 1, y: centerY - ry * scale - 1,
      width: (rx * scale + 1) * 2, height: (ry * scale + 1) * 2)
  }

  private static func backgroundColor(
    width: Int, height: Int, colorAt: (Int, Int) -> [Double]
  ) -> [Double] {
    var samples: [[Double]] = []
    for x in stride(from: 2, to: width - 2, by: 4) {
      samples.append(colorAt(x, 1))
      samples.append(colorAt(x, height - 2))
    }
    for y in stride(from: 2, to: height - 2, by: 4) {
      samples.append(colorAt(1, y))
      samples.append(colorAt(width - 2, y))
    }
    return (0..<3).map { channel in
      let sorted = samples.map { $0[channel] }.sorted()
      return sorted[sorted.count / 2]
    }
  }
}
