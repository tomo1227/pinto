import SwiftUI

@MainActor
struct WallThumbnail: View {
  @Environment(\.displayScale) private var displayScale
  let document: WallMetadata
  let photoURL: URL?
  @State private var rendered: (WallThumbnailCache.Key, UIImage)?
  @State private var failed = false

  var body: some View {
    GeometryReader { geometry in
      let size = geometry.size
      let maxPixels = Int((max(size.width, size.height) * displayScale).rounded(.up))
      let key = WallThumbnailCache.Key(
        id: document.id, updatedAt: document.updatedAt, maxPixels: maxPixels)
      ZStack {
        Color(uiColor: .systemGray5)
        if let (renderedKey, image) = rendered, renderedKey == key {
          Image(uiImage: image).resizable().scaledToFit()
        } else if failed {
          Label("画像を読み込めません", systemImage: "exclamationmark.triangle")
        } else {
          ProgressView()
        }
      }
      .task(id: key) { await load(key) }
    }
    .accessibilityLabel("\(document.content.name)の編集済み画像")
  }

  private func load(_ key: WallThumbnailCache.Key) async {
    guard key.maxPixels > 0 else { return }
    failed = false
    do {
      guard let photoURL else { throw PintoError.invalidImage }
      let image = try await WallThumbnailCache.shared.image(
        for: key, content: document.content, photoURL: photoURL)
      try Task.checkCancellation()
      rendered = (key, image)
    } catch is CancellationError {
    } catch {
      if !Task.isCancelled { failed = true }
    }
  }
}
