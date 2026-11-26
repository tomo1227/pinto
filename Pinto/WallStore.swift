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
    case .invalidDocument: return "課題データが破損しているため読み込めません。元のファイルは変更していません。"
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

  func photoURL(for id: UUID) -> URL {
    directory.appendingPathComponent(id.uuidString).appendingPathExtension("png")
  }

  func read(_ url: URL) throws -> WallDocument {
    let metadata = try readMetadata(url)
    let data = try Data(contentsOf: photoURL(for: metadata.id), options: .mappedIfSafe)
    guard UIImage(data: data) != nil else { throw PintoError.invalidDocument }
    return metadata.document(with: data)
  }

  func readMetadata(_ url: URL) throws -> WallMetadata {
    let data = try Data(contentsOf: url, options: .mappedIfSafe)
    let decoder = JSONDecoder()
    let metadata = try decoder.decode(WallMetadata.self, from: data)
    try validate(metadata, at: url)
    if metadata.separatePhoto != true {
      let legacy = try decoder.decode(WallDocument.self, from: data)
      guard UIImage(data: legacy.imageData) != nil else { throw PintoError.invalidDocument }
      // Publish the smaller metadata only after the photo is durably in place.
      try legacy.imageData.write(to: photoURL(for: metadata.id), options: .atomic)
      try saveMetadata(legacy.metadata)
      return legacy.metadata
    } else if !FileManager.default.fileExists(atPath: photoURL(for: metadata.id).path) {
      throw PintoError.invalidDocument
    }
    return metadata
  }

  private func validate(_ document: WallMetadata, at url: URL) throws {
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
      [content.holdStyle, content.textStyle, content.lineStyle].allSatisfy(validStyle)
    else { throw PintoError.invalidDocument }
  }

  func list() throws -> [URL] {
    try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "pinto" }
  }

  func save(_ document: WallDocument) throws {
    let photo = photoURL(for: document.id)
    if !FileManager.default.fileExists(atPath: photo.path) {
      try document.imageData.write(to: photo, options: .atomic)
    }
    try saveMetadata(document.metadata)
  }

  private func saveMetadata(_ metadata: WallMetadata) throws {
    let data = try JSONEncoder().encode(metadata)
    try data.write(to: url(for: metadata.id), options: .atomic)
  }

  func delete(_ id: UUID) throws {
    let manager = FileManager.default
    let metadata = url(for: id)
    let photo = photoURL(for: id)
    guard manager.fileExists(atPath: metadata.path) else { throw CocoaError(.fileNoSuchFile) }
    if manager.fileExists(atPath: photo.path) { try manager.removeItem(at: photo) }
    try manager.removeItem(at: metadata)
  }
}

private actor WallDisk {
  func load(directory: URL?) throws -> (WallFiles, [WallMetadata], [String]) {
    let files = try WallFiles(directory: directory)
    var loaded: [WallMetadata] = []
    var failures: [String] = []
    for url in try files.list() {
      do {
        loaded.append(try files.readMetadata(url))
      } catch {
        failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
      }
    }
    return (files, loaded.sorted { $0.updatedAt > $1.updatedAt }, failures)
  }

  func read(_ id: UUID, from files: WallFiles) throws -> WallDocument {
    try files.read(files.url(for: id))
  }

  func save(_ document: WallDocument, to files: WallFiles) throws {
    try files.save(document)
  }

  func delete(_ id: UUID, from files: WallFiles) throws {
    try files.delete(id)
  }
}

@MainActor
final class WallStore: ObservableObject {
  @Published private(set) var walls: [WallMetadata] = []
  @Published var errorMessage: String?
  @Published private(set) var ready = false
  @Published private(set) var loading = false
  private let disk = WallDisk()
  private var files: WallFiles?

  func load(directory: URL? = nil) async {
    guard !loading else { return }
    loading = true
    defer { loading = false }
    do {
      let (files, loaded, failures) = try await disk.load(directory: directory)
      self.files = files
      walls = loaded
      ready = true
      if !failures.isEmpty { errorMessage = failures.joined(separator: "\n") }
    } catch {
      ready = false
      errorMessage = "端末内の保存先を開けませんでした。\n\(error.localizedDescription)"
    }
  }

  func photoURL(for id: UUID) -> URL? { files?.photoURL(for: id) }

  func document(for id: UUID) async throws -> WallDocument {
    guard let files, ready else { throw CocoaError(.fileReadUnknown) }
    return try await disk.read(id, from: files)
  }

  func save(_ document: WallDocument) async throws {
    guard let files, ready else {
      throw CocoaError(.fileWriteUnknown)
    }
    try await disk.save(document, to: files)
    walls = [document.metadata] + walls.filter { $0.id != document.id }
  }

  func delete(_ ids: Set<UUID>) async {
    guard let files, ready else {
      errorMessage = "課題を削除できませんでした。\n端末内の保存先を開けません。"
      return
    }
    var deleted: Set<UUID> = []
    var failures: [String] = []
    for wall in walls where ids.contains(wall.id) {
      do {
        try await disk.delete(wall.id, from: files)
        deleted.insert(wall.id)
      } catch {
        failures.append("\(wall.content.name): \(error.localizedDescription)")
      }
    }
    walls.removeAll { deleted.contains($0.id) }
    if !failures.isEmpty {
      errorMessage = "削除できなかった課題があります。\n\(failures.joined(separator: "\n"))"
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
