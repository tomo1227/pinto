import SwiftUI
import UIKit

enum EditorTool: String, CaseIterable {
  case pan, hold, route, text, eraser

  var title: String {
    switch self {
    case .pan: return "画像を移動"
    case .hold: return "ホールド"
    case .route: return "ルート"
    case .text: return "文字"
    case .eraser: return "消去"
    }
  }

  var icon: String {
    switch self {
    case .pan: return "hand.draw"
    case .hold: return "circle"
    case .route: return "point.topleft.down.to.point.bottomright.curvepath"
    case .text: return "textformat"
    case .eraser: return "eraser"
    }
  }
}

enum EditorSelection: Equatable {
  case hold(UUID)
  case text(UUID)
}

@MainActor
final class EditorModel: ObservableObject {
  @Published var content: WallContent
  @Published var tool: EditorTool = .hold
  @Published var selection: EditorSelection?
  @Published var errorMessage: String?
  @Published var textPrompt = false
  @Published var textDraft = ""
  @Published private(set) var history = EditHistory<WallContent>()
  @Published private(set) var savedContent: WallContent
  @Published private(set) var viewportRevision = 0
  let image: UIImage
  private(set) var document: WallDocument
  private var gestureStart: WallContent?
  private var gestureSelection: EditorSelection?
  private var gesturePreview: WallContent?
  private var textPosition = WallPoint(x: 0.5, y: 0.5)
  private var editingTextID: UUID?
  private var saveTask: Task<Void, Error>?

  init(document: WallDocument) throws {
    guard let image = UIImage(data: document.imageData) else { throw PintoError.invalidImage }
    self.document = document
    self.image = image
    self.content = document.content
    self.savedContent = document.content
  }

  var dirty: Bool { content != savedContent }
  var canUndo: Bool { !history.past.isEmpty }
  var canRedo: Bool { !history.future.isEmpty }

  func change(_ update: (inout WallContent) -> Void) {
    cancelGesture()
    let before = content
    update(&content)
    history.record(before, replacing: content)
  }

  var canvasContent: WallContent {
    guard gestureSelection == selection else { return content }
    return gesturePreview ?? content
  }

  func beginGesture() {
    gestureStart = content
    gestureSelection = selection
    gesturePreview = content
  }

  func endGesture() {
    defer { cancelGesture() }
    guard gestureStart == content, gestureSelection == selection,
      let preview = gesturePreview, preview != content
    else { return }
    change { $0 = preview }
  }

  func cancelGesture() {
    gestureStart = nil
    gestureSelection = nil
    gesturePreview = nil
  }

  func undo() {
    cancelGesture()
    if let previous = history.undo(content) {
      content = previous
      selection = nil
    }
  }

  func redo() {
    cancelGesture()
    if let next = history.redo(content) {
      content = next
      selection = nil
    }
  }

  func save(to store: WallStore) async throws {
    while let saveTask { try await saveTask.value }
    guard dirty else { return }
    let task = Task {
      defer { saveTask = nil }
      var next = document
      next.content = content
      next.updatedAt = Date()
      try await store.save(next)
      document = next
      savedContent = next.content
    }
    saveTask = task
    try await task.value
  }

  func autosave(to store: WallStore) async throws {
    guard dirty else { return }
    try await Task.sleep(for: .milliseconds(500))
    try Task.checkCancellation()
    if dirty { try await save(to: store) }
  }

  func saveImageToPhotos(using saveImage: (Data) async throws -> Void = PhotoLibrary.savePNG)
    async throws
  {
    let data = try await WallImageWorker.shared.exportPNG(image: image, content: content)
    try Task.checkCancellation()
    try await saveImage(data)
  }

  func renderForSharing() async throws -> UIImage {
    try await WallImageWorker.shared.render(image: image, content: content)
  }

  func resetViewport() { viewportRevision += 1 }

  func addHold(at position: WallPoint) async {
    let style = content.holdStyle
    let shape = content.newHoldShape
    do {
      try Task.checkCancellation()
      let detected: Hold?
      if content.autoDetectHolds {
        detected = try await WallImageWorker.shared.detectHold(
          in: image, at: position, style: style, shape: shape)
      } else {
        detected = nil
      }
      try Task.checkCancellation()
      guard tool == .hold else { return }
      let radius = min(image.size.width, image.size.height) * 0.035
      let hold =
        detected
        ?? Hold(
          position: position, radiusX: radius / image.size.width,
          radiusY: radius / image.size.height, style: style, shape: shape)
      change { $0.holds.append(hold) }
      selection = .hold(hold.id)
    } catch is CancellationError {
    } catch {
      errorMessage = "ホールドの輪郭を検出できませんでした。\n\(error.localizedDescription)"
    }
  }

  func appendToRoute(_ id: UUID) {
    guard content.holds.contains(where: { $0.id == id }) else { return }
    change { content in
      if content.route.contains(id) {
        content.route.removeAll { $0 == id }
      } else {
        content.appendToRoute(id)
      }
    }
    selection = .hold(id)
  }

  func removeSelection() {
    guard let selection else { return }
    change { content in
      switch selection {
      case .hold(let id): content.removeHold(id)
      case .text(let id): content.texts.removeAll { $0.id == id }
      }
    }
    self.selection = nil
  }

  func promptText(at position: WallPoint, id: UUID? = nil) {
    editingTextID = id
    textPosition = position
    textDraft = id.flatMap { id in content.texts.first { $0.id == id }?.text } ?? ""
    textPrompt = true
  }

  func commitText() {
    let text = textDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty {
      if let id = editingTextID {
        change { $0.texts.removeAll { $0.id == id } }
        if selection == .text(id) { selection = nil }
      }
    } else if let id = editingTextID, let index = content.texts.firstIndex(where: { $0.id == id }) {
      change { $0.texts[index].text = text }
      selection = .text(id)
    } else {
      let annotation = WallText(position: textPosition, text: text, style: content.textStyle)
      change { $0.texts.append(annotation) }
      selection = .text(annotation.id)
    }
  }

  var selectedHold: Hold? {
    guard case .hold(let id) = selection else { return nil }
    return content.holds.first { $0.id == id }
  }

  var activeHoldShape: HoldShape {
    selectedHold?.effectiveShape ?? content.newHoldShape ?? .oval
  }

  func updateHoldShape(_ shape: HoldShape) {
    let storedShape: HoldShape? = shape == .oval ? nil : shape
    change { content in
      if case .hold(let id) = selection,
        let index = content.holds.firstIndex(where: { $0.id == id })
      {
        content.holds[index].shape = storedShape
      }
      content.newHoldShape = storedShape
    }
  }

  var activeStyle: MarkStyle {
    if tool == .route { return content.lineStyle }
    if case .text(let id) = selection, let text = content.texts.first(where: { $0.id == id }) {
      return text.style
    }
    if let hold = selectedHold {
      return hold.style
    }
    return tool == .text ? content.textStyle : content.holdStyle
  }

  var editingText: Bool {
    if tool == .route { return false }
    if case .text = selection { return true }
    return tool == .text && selection == nil
  }

  func resetStyleValue(_ keyPath: WritableKeyPath<MarkStyle, Double>) {
    let defaults = tool == .route ? WallContent.defaultLineStyle : MarkStyle()
    let value = defaults[keyPath: keyPath]
    guard activeStyle[keyPath: keyPath] != value else { return }
    updateStyle { $0[keyPath: keyPath] = value }
  }

  func resetRouteNumberSize() {
    change { $0.routeNumberSize = nil }
  }

  func updateStyle(_ update: (inout MarkStyle) -> Void) {
    var style = activeStyle
    update(&style)
    change { content in
      if tool == .route {
        content.lineStyle = style
      } else if case .text(let id) = selection,
        let index = content.texts.firstIndex(where: { $0.id == id })
      {
        content.texts[index].style = style
        content.textStyle = style
      } else if case .hold(let id) = selection,
        let index = content.holds.firstIndex(where: { $0.id == id })
      {
        content.holds[index].style = style
        content.holdStyle = style
      } else if tool == .text {
        content.textStyle = style
      } else {
        content.holdStyle = style
      }
    }
  }

  func moveSelection(to point: WallPoint) {
    guard gesturePreview != nil, gestureSelection == selection else { return }
    switch selection {
    case .hold(let id):
      if let index = gesturePreview?.holds.firstIndex(where: { $0.id == id }) {
        gesturePreview?.holds[index].position = point.clamped()
      }
    case .text(let id):
      if let index = gesturePreview?.texts.firstIndex(where: { $0.id == id }) {
        gesturePreview?.texts[index].position = point.clamped()
      }
    case nil: break
    }
  }

  func resizeSelection(x: Double, y: Double, from original: WallContent) {
    guard gesturePreview != nil, gestureSelection == selection else { return }
    switch selection {
    case .hold(let id):
      if let old = original.holds.first(where: { $0.id == id }),
        let index = gesturePreview?.holds.firstIndex(where: { $0.id == id })
      {
        gesturePreview?.holds[index].radiusX = min(
          0.5, max(1 / (image.size.width * image.scale), old.radiusX * x))
        gesturePreview?.holds[index].radiusY = min(
          0.5, max(1 / (image.size.height * image.scale), old.radiusY * y))
      }
    case .text(let id):
      if let old = original.texts.first(where: { $0.id == id }),
        let index = gesturePreview?.texts.firstIndex(where: { $0.id == id })
      {
        gesturePreview?.texts[index].style.fontSize = min(
          120, max(6, old.style.fontSize * max(x, y)))
      }
    case nil: break
    }
  }
}
