import Foundation

struct WallPoint: Codable, Equatable {
  var x: Double
  var y: Double

  func clamped() -> WallPoint {
    WallPoint(x: min(1, max(0, x)), y: min(1, max(0, y)))
  }
}

enum TextFamily: String, Codable, CaseIterable {
  case sans, serif, monospace
  case roundedGothic, condensed, handwritten

  var label: String {
    switch self {
    case .sans: return "ゴシック体"
    case .serif: return "明朝体"
    case .monospace: return "等幅"
    case .roundedGothic: return "丸ゴシック"
    case .condensed: return "Avenir Next Condensed"
    case .handwritten: return "Marker Felt"
    }
  }
}

struct MarkStyle: Codable, Equatable {
  var color = "#202522"
  var width = 3.0
  var outlineColor = "#FFFEFA"
  var outlineWidth = 0.0
  var fontSize = 24.0
  var fontWeight = 600
  var fontFamily: TextFamily = .sans
  var fontItalic: Bool? = nil

  var outlinedWidth: Double { width + outlineWidth * 2 }

  var isBold: Bool {
    get { fontWeight >= 700 }
    set { fontWeight = newValue ? 700 : 400 }
  }

  var isItalic: Bool {
    get { fontItalic == true }
    set { fontItalic = newValue }
  }
}

enum HoldShape: String, Codable, CaseIterable {
  case oval, rectangle

  var label: String {
    switch self {
    case .oval: return "丸"
    case .rectangle: return "四角"
    }
  }
}

struct Hold: Codable, Equatable, Identifiable {
  var id = UUID()
  var position: WallPoint
  // Radii are fractions of the original image, not screen points.
  var radiusX = 0.035
  var radiusY = 0.035
  var style = MarkStyle()
  var shape: HoldShape? = nil

  var effectiveShape: HoldShape { shape ?? .oval }
}

struct WallText: Codable, Equatable, Identifiable {
  var id = UUID()
  var position: WallPoint
  var text: String
  var style = MarkStyle()
}

struct WallContent: Codable, Equatable {
  static let defaultLineStyle = MarkStyle(
    color: "#F2D13D", width: 4, outlineColor: "#202522", outlineWidth: 0)
  static let defaultRouteNumberSize = 13.0

  var name: String
  var japaneseGrade = ""
  var vGrade = ""
  var gymName = ""
  var author = ""
  var notes = ""
  var tags: Set<String> = []
  var autoDetectHolds = true
  var allowEllipses = true
  var showLines = true
  var showRouteNumbers: Bool? = nil
  var holds: [Hold] = []
  var texts: [WallText] = []
  var route: [UUID] = []
  var routeNumberSize: Double? = nil
  var routeNumberColor: String? = nil
  var holdStyle = MarkStyle()
  var newHoldShape: HoldShape? = nil
  var textStyle = MarkStyle()
  var lineStyle = defaultLineStyle

  var effectiveRouteNumberSize: Double { routeNumberSize ?? Self.defaultRouteNumberSize }
  var effectiveShowRouteNumbers: Bool { showRouteNumbers ?? true }

  func locksHoldAspectRatio(_ hold: Hold) -> Bool {
    hold.effectiveShape == .oval && !allowEllipses
  }

  mutating func removeHold(_ id: UUID) {
    holds.removeAll { $0.id == id }
    route.removeAll { $0 == id }
  }

  mutating func appendToRoute(_ id: UUID) {
    guard holds.contains(where: { $0.id == id }), !route.contains(id) else { return }
    route.append(id)
  }

  var grade: String {
    [japaneseGrade, vGrade].filter { !$0.isEmpty }.joined(separator: " · ")
  }
}

struct WallDocument: Codable, Identifiable, Equatable {
  var version = 1
  var id = UUID()
  var createdAt = Date()
  var updatedAt = Date()
  var imageData: Data
  var content: WallContent

  var metadata: WallMetadata {
    WallMetadata(
      version: version, id: id, createdAt: createdAt, updatedAt: updatedAt, content: content)
  }
}

struct WallMetadata: Codable, Identifiable, Equatable {
  var separatePhoto: Bool? = true
  let version: Int
  let id: UUID
  let createdAt: Date
  let updatedAt: Date
  let content: WallContent

  func document(with imageData: Data) -> WallDocument {
    WallDocument(
      version: version, id: id, createdAt: createdAt, updatedAt: updatedAt,
      imageData: imageData, content: content)
  }
}

struct LibraryFilters {
  var japaneseGrade = ""
  var vGrade = ""
  var tags: Set<String> = []

  var isActive: Bool {
    !japaneseGrade.isEmpty || !vGrade.isEmpty || !tags.isEmpty
  }

  func matches(_ content: WallContent, search: String) -> Bool {
    guard japaneseGrade.isEmpty || content.japaneseGrade == japaneseGrade,
      vGrade.isEmpty || content.vGrade == vGrade
    else { return false }

    for (_, options) in WallCatalog.tagGroups {
      let selected = tags.intersection(options)
      if !selected.isEmpty, selected.isDisjoint(with: content.tags) { return false }
    }

    guard !search.isEmpty else { return true }
    return [
      content.name, content.grade, content.gymName, content.author,
      content.notes, content.tags.sorted().joined(separator: " "),
    ]
    .joined(separator: " ").localizedCaseInsensitiveContains(search)
  }
}

struct EditHistory<Value: Equatable> {
  private(set) var past: [Value] = []
  private(set) var future: [Value] = []

  mutating func record(_ oldValue: Value, replacing newValue: Value) {
    guard oldValue != newValue else { return }
    past.append(oldValue)
    if past.count > 100 { past.removeFirst() }
    future.removeAll()
  }

  mutating func undo(_ current: Value) -> Value? {
    guard let previous = past.popLast() else { return nil }
    future.append(current)
    return previous
  }

  mutating func redo(_ current: Value) -> Value? {
    guard let next = future.popLast() else { return nil }
    past.append(current)
    return next
  }
}

enum WallCatalog {
  static let japaneseGrades = [
    "10級", "9級", "8級", "7級", "6級", "5級", "4級", "3級", "2級", "1級",
    "初段", "二段", "三段", "四段", "五段", "六段",
  ]
  static let vGrades = (0...17).map { "V\($0)" }
  static let tagGroups: [(String, [String])] = [
    ("ホールド", ["カチ", "ガバ", "スローパー", "ハリボテ"]),
    (
      "ムーブ",
      [
        "ダイアゴナル", "キョン", "ヒールフック", "トゥフック", "フラッギング",
        "ステミング", "ランジ", "レイバック", "ハイステップ", "クロス", "デッドポイント",
        "手に足", "ニーバ", "マントル", "サイファー", "スメアリング", "マッチ",
        "フィギュア4", "ガストン", "おくり",
      ]
    ),
    ("タイプ", ["スラブ", "オーバーハング", "垂壁", "ルーフ"]),
  ]
  static let colors = [
    "#202522", "#FFFEFA", "#E55050", "#EF8C31",
    "#F2D13D", "#2F7A68", "#2589C7", "#7654A6",
  ]
}
