import Foundation
import Photos
import SwiftUI
import UIKit

enum PintoError: LocalizedError {
  case invalidImage
  case unsupportedDocument
  case invalidDocument
  case exportFailed
  case photoLibraryAccessDenied

  var errorDescription: String? {
    switch self {
    case .invalidImage: return "画像を読み込めません。別の画像を選択してください。"
    case .unsupportedDocument: return "このデータ形式には対応していません。アプリの更新を確認してください。"
    case .invalidDocument: return "壁データが破損しているため読み込めません。元のファイルは変更していません。"
    case .exportFailed: return "PNG画像を作成できませんでした。"
    case .photoLibraryAccessDenied:
      return "写真への追加が許可されていません。設定アプリで Pinto の写真への追加を許可してください。"
    }
  }
}

enum PhotoLibrary {
  static func savePNG(_ data: Data) async throws {
    let authorization = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard authorization == .authorized || authorization == .limited else {
      throw PintoError.photoLibraryAccessDenied
    }
    try await PHPhotoLibrary.shared().performChanges {
      let request = PHAssetCreationRequest.forAsset()
      request.addResource(with: .photo, data: data, options: nil)
    }
  }
}

struct WallFiles {
  let directory: URL

  init(directory: URL? = nil) throws {
    self.directory =
      try directory
      ?? FileManager.default
      .url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
      )
      .appendingPathComponent("Pinto", isDirectory: true)
    try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
  }

  func url(for id: UUID) -> URL {
    directory.appendingPathComponent(id.uuidString).appendingPathExtension("pinto")
  }

  func read(_ url: URL) throws -> WallDocument {
    let document = try JSONDecoder().decode(WallDocument.self, from: Data(contentsOf: url))
    guard document.version == 1 else { throw PintoError.unsupportedDocument }
    let content = document.content
    let ids = Set(content.holds.map(\.id))
    func valid(_ point: WallPoint) -> Bool {
      point.x.isFinite && point.y.isFinite && (0...1).contains(point.x) && (0...1).contains(point.y)
    }
    func validColor(_ color: String) -> Bool {
      let colorPattern = "^#[0-9A-Fa-f]{6}$"
      return color.range(of: colorPattern, options: .regularExpression) != nil
    }
    func validStyle(_ style: MarkStyle) -> Bool {
      validColor(style.color) && validColor(style.outlineColor)
        && (1...20).contains(style.width) && (0...12).contains(style.outlineWidth)
        && (6...120).contains(style.fontSize)
        && [300, 400, 600, 700, 900].contains(style.fontWeight)
    }
    guard url.lastPathComponent == self.url(for: document.id).lastPathComponent,
      !content.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      ids.count == content.holds.count,
      Set(content.texts.map(\.id)).count == content.texts.count,
      Set(content.route).count == content.route.count,
      content.route.allSatisfy({ ids.contains($0) }),
      content.routeNumberSize.map({ $0.isFinite && (6...60).contains($0) }) ?? true,
      content.routeNumberColor.map(validColor) ?? true,
      content.holds.allSatisfy({
        valid($0.position) && $0.radiusX.isFinite && $0.radiusX > 0 && $0.radiusX <= 1
          && $0.radiusY.isFinite && $0.radiusY > 0 && $0.radiusY <= 1 && validStyle($0.style)
      }),
      content.texts.allSatisfy({ valid($0.position) && validStyle($0.style) && !$0.text.isEmpty }),
      [content.holdStyle, content.textStyle, content.lineStyle].allSatisfy(validStyle),
      UIImage(data: document.imageData) != nil
    else { throw PintoError.invalidDocument }
    return document
  }

  func list() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "pinto" }
  }

  func save(_ document: WallDocument) throws {
    let data = try JSONEncoder().encode(document)
    try data.write(to: url(for: document.id), options: .atomic)
  }

  func delete(_ id: UUID) throws {
    try FileManager.default.removeItem(at: url(for: id))
  }
}

@MainActor
final class WallStore: ObservableObject {
  @Published private(set) var walls: [WallDocument] = []
  @Published var errorMessage: String?
  @Published private(set) var ready = false
  private var files: WallFiles?

  func load(directory: URL? = nil) {
    do {
      let files = try WallFiles(directory: directory)
      self.files = files
      var loaded: [WallDocument] = []
      var failures: [String] = []
      for url in try files.list() {
        do {
          loaded.append(try files.read(url))
        } catch {
          failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
        }
      }
      walls = loaded.sorted { $0.updatedAt > $1.updatedAt }
      ready = true
      if !failures.isEmpty { errorMessage = failures.joined(separator: "\n") }
    } catch {
      ready = false
      errorMessage = "端末内の保存先を開けませんでした。\n\(error.localizedDescription)"
    }
  }

  func save(_ document: WallDocument) throws {
    guard let files, ready else {
      throw CocoaError(.fileWriteUnknown)
    }
    try files.save(document)
    walls.removeAll { $0.id == document.id }
    walls.insert(document, at: 0)
  }

  func delete(_ id: UUID) {
    do {
      guard let files, ready else { throw CocoaError(.fileWriteUnknown) }
      try files.delete(id)
      walls.removeAll { $0.id == id }
    } catch {
      errorMessage = "壁を削除できませんでした。\n\(error.localizedDescription)"
    }
  }
}

extension UIImage {
  func normalizedPNG() throws -> Data {
    guard size.width > 0, size.height > 0 else { throw PintoError.invalidImage }
    let pixels = CGSize(width: size.width * scale, height: size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let image = UIGraphicsImageRenderer(size: pixels, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: pixels))
      draw(in: CGRect(origin: .zero, size: pixels))
    }
    guard let data = image.pngData() else { throw PintoError.invalidImage }
    return data
  }
}
