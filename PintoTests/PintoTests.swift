import SwiftUI
import UIKit
import XCTest

@testable import Pinto

private final class SimulatedLongPress: UILongPressGestureRecognizer {
  var testState: UIGestureRecognizer.State = .possible
  var testLocation = CGPoint.zero

  override var state: UIGestureRecognizer.State {
    get { testState }
    set { testState = newValue }
  }

  override func location(in view: UIView?) -> CGPoint { testLocation }
}

private final class SimulatedTap: UITapGestureRecognizer {
  var testLocation = CGPoint.zero

  override func location(in view: UIView?) -> CGPoint { testLocation }
}

private final class SimulatedPan: UIPanGestureRecognizer {
  var testState: UIGestureRecognizer.State = .possible
  var testLocation = CGPoint.zero
  var testTranslation = CGPoint.zero

  override var state: UIGestureRecognizer.State {
    get { testState }
    set { testState = newValue }
  }

  override func location(in view: UIView?) -> CGPoint { testLocation }
  override func translation(in view: UIView?) -> CGPoint { testTranslation }
}

private final class SimulatedPinch: UIPinchGestureRecognizer {
  var testState: UIGestureRecognizer.State = .possible
  var testLocation = CGPoint.zero
  var testScale: CGFloat = 1

  override var state: UIGestureRecognizer.State {
    get { testState }
    set { testState = newValue }
  }

  override var scale: CGFloat {
    get { testScale }
    set { testScale = newValue }
  }

  override func location(in view: UIView?) -> CGPoint { testLocation }
}

@MainActor
final class PintoTests: XCTestCase {
  #if DEBUG
    func testDebugMemoryBudgetUsesPeakEvenAfterCurrentUsageDrops() {
      XCTAssertFalse(DebugMemorySample(current: 100_000_000, peak: 300_000_000).exceedsBudget)
      XCTAssertTrue(DebugMemorySample(current: 100_000_000, peak: 300_000_001).exceedsBudget)
      XCTAssertTrue(DebugMemorySample(current: 100_000_000, peak: 500_000_000).exceedsBudget)
    }

    func testDebugMemoryReadsProcessFootprintAndPeak() throws {
      let sample = try XCTUnwrap(DebugMemorySample.read())
      XCTAssertGreaterThan(sample.current, 0)
      XCTAssertGreaterThanOrEqual(sample.peak, sample.current)
    }
  #endif

  private func image(size: CGSize = CGSize(width: 600, height: 800)) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
      UIColor.white.setFill()
      renderer.fill(CGRect(origin: .zero, size: size))
    }
  }

  private func makeDocument() throws -> WallDocument {
    WallDocument(imageData: try image().normalizedPNG(), content: WallContent(name: "テスト壁"))
  }

  func testSystemLaunchScreenShowsOnlyTheSharedBackground() throws {
    let bundle = Bundle.main
    XCTAssertNil(bundle.object(forInfoDictionaryKey: "UILaunchStoryboardName"))
    let launchScreen = try XCTUnwrap(
      bundle.object(forInfoDictionaryKey: "UILaunchScreen") as? [String: String])
    XCTAssertEqual(launchScreen, ["UIColorName": "LaunchBackground"])
    let color = try XCTUnwrap(UIColor(named: "LaunchBackground", in: bundle, compatibleWith: nil))
    let light = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
    let dark = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
    XCTAssertNotEqual(light, dark)
  }

  func testAnimatedLaunchWordmarkIsBundledAsTemplate() throws {
    let wordmark = try XCTUnwrap(UIImage(named: "PintoWordmark", in: .main, with: nil))
    XCTAssertEqual(wordmark.renderingMode, .alwaysTemplate)
    XCTAssertEqual(wordmark.size, CGSize(width: 99, height: 33))
  }

  func testUserManualIsBundledAndIncludesCurrentInstructions() throws {
    let blocks = try UserManual.load()
    XCTAssertEqual(String(try XCTUnwrap(blocks.first).text.characters), "Pinto ユーザーマニュアル")
    XCTAssertEqual(blocks.first?.headingLevel, 1)
    let content = blocks.map { String($0.text.characters) }.joined(separator: "\n")
    XCTAssertTrue(content.contains("ルートの数字色"))
    XCTAssertTrue(content.contains("左にスワイプ"))
    XCTAssertTrue(content.contains("長押しして選択"))
    XCTAssertTrue(content.contains("絞り込み"))
    XCTAssertTrue(content.contains("自動保存"))
    XCTAssertTrue(content.contains("色選択の左側で丸（○）または四角（□）のアイコン"))
  }

  func testLibraryFiltersMatchAnyTagInEachSelectedCategory() {
    let filters = LibraryFilters(tags: ["カチ", "ガバ", "キョン"])
    var content = WallContent(name: "テスト壁")
    XCTAssertTrue(filters.isActive)
    XCTAssertFalse(filters.matches(content, search: ""))
    content.tags = ["ガバ"]
    XCTAssertFalse(filters.matches(content, search: ""))
    content.tags.insert("キョン")
    XCTAssertTrue(filters.matches(content, search: ""))
    content.tags = ["カチ", "キョン", "垂壁"]
    XCTAssertTrue(filters.matches(content, search: ""))
    content.tags = ["スローパー", "キョン"]
    XCTAssertFalse(filters.matches(content, search: ""))
  }

  func testLibraryFiltersCombineExactGradesWithTextSearch() {
    let filters = LibraryFilters(japaneseGrade: "1級", vGrade: "V1", tags: ["垂壁"])
    var content = WallContent(name: "テスト壁", japaneseGrade: "1級", vGrade: "V1")
    content.gymName = "Pinto Gym"
    content.tags = ["垂壁"]

    XCTAssertTrue(filters.matches(content, search: "pinto"))
    XCTAssertFalse(filters.matches(content, search: "カチ"))
    content.vGrade = "V10"
    XCTAssertFalse(filters.matches(content, search: "pinto"))
    content.vGrade = "V1"
    content.japaneseGrade = "10級"
    XCTAssertFalse(filters.matches(content, search: "pinto"))

    let cleared = LibraryFilters()
    XCTAssertFalse(cleared.isActive)
    XCTAssertTrue(cleared.matches(content, search: "垂壁"))
    XCTAssertTrue(cleared.matches(content, search: ""))
  }

  func testUserManualPreservesHeadingsListsAndInlineFormatting() throws {
    let blocks = try UserManual.blocks(
      markdown: """
        # 見出し

        本文の**太字**です。

        1. 最初
        2. 次

        - 箇条書き
        """)
    XCTAssertEqual(blocks.count, 5)
    XCTAssertEqual(blocks[0].headingLevel, 1)
    XCTAssertEqual(String(blocks[1].text.characters), "本文の太字です。")
    XCTAssertTrue(
      blocks[1].text.runs.contains {
        $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true
      })
    XCTAssertEqual(blocks[2].listMarker, "1.")
    XCTAssertEqual(blocks[3].listMarker, "2.")
    XCTAssertEqual(blocks[4].listMarker, "\u{2022}")
    XCTAssertThrowsError(try UserManual.blocks(markdown: ""))
  }

  func testUserManualOutlineKeepsIntroVisibleAndNestsSubheadings() throws {
    let blocks = try UserManual.blocks(
      markdown: """
        # タイトル

        導入文

        ## 編集

        編集の説明

        ### 操作

        - 項目

        ## 保存

        ### 操作

        保存の説明
        """)
    let outline = UserManual.outline(from: blocks)
    func titles(_ entries: [UserManual.Entry]) -> [String] {
      entries.map { String($0.block.text.characters) }
    }

    XCTAssertEqual(titles(outline), ["タイトル", "導入文", "編集", "保存"])
    let editing = try XCTUnwrap(outline.first { $0.block.headingLevel == 2 })
    let saving = try XCTUnwrap(outline.last)
    XCTAssertEqual(titles(editing.children), ["編集の説明", "操作"])
    XCTAssertEqual(titles(saving.children), ["操作"])
    let editingSteps = try XCTUnwrap(editing.children.last)
    let savingSteps = try XCTUnwrap(saving.children.first)
    XCTAssertNotEqual(editingSteps.id, savingSteps.id)
    XCTAssertEqual(titles(editingSteps.children), ["項目"])
    XCTAssertEqual(editingSteps.children.first?.block.listMarker, "\u{2022}")
    XCTAssertEqual(titles(savingSteps.children), ["保存の説明"])
  }

  func testDocumentRoundTripPreservesAllEditorProperties() throws {
    var document = try makeDocument()
    var style = MarkStyle(color: "#7654A6", width: 7, outlineColor: "#FFFEFA", outlineWidth: 3)
    style.fontFamily = .serif
    style.fontWeight = 900
    style.isItalic = true
    style.fontSize = 42
    let hold = Hold(
      position: WallPoint(x: 0.3, y: 0.4),
      radiusX: 0.06, radiusY: 0.03, style: style, shape: .rectangle)
    document.content.holds = [hold]
    document.content.newHoldShape = .rectangle
    document.content.route = [hold.id]
    document.content.texts = [
      WallText(position: WallPoint(x: 0.1, y: 0.9), text: "核心", style: style)
    ]
    document.content.tags = ["カチ", "キョン", "垂壁"]
    document.content.japaneseGrade = "3級"
    document.content.vGrade = "V3"
    document.content.gymName = "ローカルジム"
    document.content.author = "作成者"
    document.content.notes = "説明"
    document.content.showLines = false
    document.content.showRouteNumbers = false
    document.content.autoDetectHolds = false
    document.content.allowEllipses = false
    document.content.lineStyle = style
    document.content.routeNumberSize = 32
    let data = try JSONEncoder().encode(document)
    XCTAssertEqual(try JSONDecoder().decode(WallDocument.self, from: data), document)
  }

  func testLegacyDocumentWithoutHoldShapeUsesOval() throws {
    var document = try makeDocument()
    document.content.holds = [Hold(position: WallPoint(x: 0.5, y: 0.5))]
    let data = try JSONEncoder().encode(document)
    let json = String(decoding: data, as: UTF8.self)
    XCTAssertFalse(json.contains("\"shape\""))
    XCTAssertFalse(json.contains("\"newHoldShape\""))
    let decoded = try JSONDecoder().decode(WallDocument.self, from: data)
    let model = try EditorModel(document: decoded)
    model.selection = .hold(document.content.holds[0].id)
    XCTAssertEqual(model.activeHoldShape, .oval)
    model.selection = nil
    XCTAssertEqual(model.activeHoldShape, .oval)
  }

  func testLegacyTextStyleAndBoldItalicToggles() throws {
    var style = MarkStyle()
    let legacy = try JSONEncoder().encode(style)
    let restored = try JSONDecoder().decode(MarkStyle.self, from: legacy)
    XCTAssertNil(restored.fontItalic)
    XCTAssertFalse(restored.isItalic)
    style.isBold = true
    XCTAssertEqual(style.fontWeight, 700)
    XCTAssertTrue(style.isBold)
    style.isItalic = true
    XCTAssertTrue(style.isBold)
    XCTAssertTrue(style.isItalic)
    XCTAssertEqual(
      try JSONDecoder().decode(MarkStyle.self, from: JSONEncoder().encode(style)), style)
    style.isBold = false
    XCTAssertEqual(style.fontWeight, 400)
    XCTAssertTrue(style.isItalic)
    style.isItalic = false
    XCTAssertFalse(style.isItalic)
  }

  func testItalicRenderingAcrossFontFamilies() throws {
    for family in TextFamily.allCases {
      var style = MarkStyle()
      style.fontFamily = family
      let regularFont = SceneRenderer.font(style, unit: 1)
      style.isItalic = true
      let italicFont = SceneRenderer.font(style, unit: 1)
      XCTAssertEqual(italicFont.pointSize, regularFont.pointSize)
      XCTAssertTrue(
        italicFont.fontDescriptor.symbolicTraits.contains(.traitItalic)
          || italicFont.fontDescriptor.matrix != .identity)
      var content = WallContent(name: "斜体")
      content.texts = [WallText(position: WallPoint(x: 0.2, y: 0.5), text: "Pinto", style: style)]
      let italicImage = try XCTUnwrap(
        SceneRenderer.render(image: image(), content: content).pngData())
      content.texts[0].style.isItalic = false
      let regularImage = try XCTUnwrap(
        SceneRenderer.render(image: image(), content: content).pngData())
      XCTAssertNotEqual(italicImage, regularImage)
    }
  }

  func testAddedFontFamiliesUseDistinctFacesAndSurviveSaving() throws {
    XCTAssertEqual(
      TextFamily.allCases,
      [
        .sans, .serif, .monospace, .roundedGothic, .condensed, .handwritten,
      ])
    let source = image()
    var renderedImages = Set<Data>()
    for (family, face, boldFace) in [
      (TextFamily.roundedGothic, "HiraMaruProN-W4", "HiraMaruProN-W4"),
      (.condensed, "AvenirNextCondensed-DemiBold", "AvenirNextCondensed-Bold"),
      (.handwritten, "MarkerFelt-Thin", "MarkerFelt-Wide"),
    ] {
      var style = MarkStyle(fontFamily: family)
      XCTAssertEqual(SceneRenderer.font(style, unit: 1).fontName, face)
      var content = WallContent(name: "書体")
      content.textStyle = style
      content.texts = [
        WallText(position: WallPoint(x: 0.1, y: 0.5), text: "Pinto 岩 123", style: style)
      ]
      let saved = try JSONEncoder().encode(content)
      let restored = try JSONDecoder().decode(WallContent.self, from: saved)
      XCTAssertEqual(restored.textStyle.fontFamily, family)
      XCTAssertEqual(restored.texts.first?.style.fontFamily, family)
      let rendered = try XCTUnwrap(SceneRenderer.render(image: source, content: restored).pngData())
      XCTAssertTrue(renderedImages.insert(rendered).inserted)
      style.isBold = true
      XCTAssertEqual(SceneRenderer.font(style, unit: 1).fontName, boldFace)
    }
  }

  func testAutosavePersistsEditsAndUndoRedoWithoutChangingHistory() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let store = WallStore()
    await store.load(directory: directory)
    let document = try makeDocument()
    try await store.save(document)
    let files = try WallFiles(directory: directory)
    let model = try EditorModel(document: document)
    model.change {
      $0.name = "自動保存した壁"
      $0.routeNumberSize = 40
    }
    let edited = model.content

    try await model.autosave(to: store)

    XCTAssertFalse(model.dirty)
    XCTAssertTrue(model.canUndo)
    XCTAssertEqual(store.walls.first?.content, edited)
    XCTAssertEqual(try files.read(files.url(for: document.id)).content, edited)
    model.undo()
    try await model.autosave(to: store)
    XCTAssertEqual(try files.read(files.url(for: document.id)).content, document.content)
    XCTAssertTrue(model.canRedo)
    model.redo()
    try await model.autosave(to: store)
    XCTAssertEqual(try files.read(files.url(for: document.id)).content, edited)
    XCTAssertFalse(model.dirty)
  }

  func testCancelledAutosaveLeavesDiskUntouchedAndNextSaveUsesLatestEdits() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let store = WallStore()
    await store.load(directory: directory)
    let document = try makeDocument()
    try await store.save(document)
    let files = try WallFiles(directory: directory)
    let model = try EditorModel(document: document)
    model.change { $0.name = "途中の編集" }
    let pending = Task { try await model.autosave(to: store) }
    await Task.yield()
    model.change { $0.name = "最新の編集" }
    pending.cancel()
    do {
      try await pending.value
      XCTFail("Cancelled autosave must not write")
    } catch is CancellationError {
    }
    XCTAssertEqual(try files.read(files.url(for: document.id)), document)
    XCTAssertTrue(model.dirty)
    try await model.autosave(to: store)
    XCTAssertEqual(try files.read(files.url(for: document.id)).content.name, "最新の編集")
    XCTAssertFalse(model.dirty)
  }

  func testAutosaveSkipsUnchangedContentAndReportsWriteFailure() async throws {
    let model = try EditorModel(document: makeDocument())
    let unavailableStore = WallStore()
    let original = model.document
    try await model.autosave(to: unavailableStore)
    XCTAssertEqual(model.document, original)
    model.change { $0.name = "保存に失敗する編集" }
    do {
      try await model.autosave(to: unavailableStore)
      XCTFail("Autosave must report write failures")
    } catch {
      XCTAssertEqual((error as NSError).domain, NSCocoaErrorDomain)
    }
    XCTAssertTrue(model.dirty)
    XCTAssertEqual(model.document, original)
    XCTAssertEqual(model.savedContent, original.content)
    XCTAssertTrue(model.canUndo)
  }

  func testImmediateSaveFlushesPendingAutosaveWithoutWritingTwice() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let store = WallStore()
    await store.load(directory: directory)
    let model = try EditorModel(document: makeDocument())
    model.change { $0.name = "戻る直前の編集" }
    let pending = Task { try await model.autosave(to: store) }
    await Task.yield()
    try await model.save(to: store)
    let saved = model.document
    try await pending.value
    XCTAssertEqual(model.document, saved)
    XCTAssertFalse(model.dirty)
    let files = try WallFiles(directory: directory)
    XCTAssertEqual(try files.read(files.url(for: saved.id)), saved)
  }

  func testRouteNumberIndexFollowsRouteOrderNotHoldOrder() {
    let first = UUID()
    let second = UUID()
    XCTAssertEqual(SceneRenderer.routeNumbers(for: [second, first]), [second: 1, first: 2])
    XCTAssertEqual(SceneRenderer.routeNumbers(for: [first]), [first: 1])
    XCTAssertTrue(SceneRenderer.routeNumbers(for: []).isEmpty)
  }

  func testRouteNumberSizeDefaultsAndAffectsRendering() throws {
    var document = try makeDocument()
    XCTAssertEqual(document.content.effectiveRouteNumberSize, 13)
    let legacyData = try JSONEncoder().encode(document)
    let restored = try JSONDecoder().decode(WallDocument.self, from: legacyData)
    XCTAssertEqual(restored.content.effectiveRouteNumberSize, 13)

    let hold = Hold(position: WallPoint(x: 0.5, y: 0.5))
    document.content.holds = [hold]
    document.content.route = [hold.id]
    let small = try XCTUnwrap(
      SceneRenderer.render(image: image(), content: document.content).pngData())
    document.content.routeNumberSize = 40
    let large = try XCTUnwrap(
      SceneRenderer.render(image: image(), content: document.content).pngData())
    XCTAssertNotEqual(small, large)
  }

  func testRouteNumberColorDefaultsToHoldColorAndRendersIndependently() throws {
    var document = try makeDocument()
    let restored = try JSONDecoder().decode(WallDocument.self, from: JSONEncoder().encode(document))
    XCTAssertNil(restored.content.routeNumberColor)
    let hold = Hold(
      position: WallPoint(x: 0.5, y: 0.5),
      style: MarkStyle(color: "#2589C7"))
    document.content.holds = [hold]
    document.content.route = [hold.id]
    document.content.routeNumberSize = 40
    let legacy = SceneRenderer.render(image: image(), content: document.content)
    document.content.routeNumberColor = hold.style.color
    XCTAssertEqual(
      SceneRenderer.render(image: image(), content: document.content).pngData(), legacy.pngData())
    document.content.routeNumberColor = "#E55050"
    let colored = SceneRenderer.render(image: image(), content: document.content)
    XCTAssertNotEqual(colored.pngData(), legacy.pngData())
    var hasRedNumber = false
    for positionY in 380..<420 {
      for positionX in 290..<310 {
        let color = pixel(colored, x: positionX, y: positionY)
        if color.count == 4 && color[0] > 200 && color[1] < 120 && color[2] < 120 {
          hasRedNumber = true
        }
      }
    }
    XCTAssertTrue(hasRedNumber)
    XCTAssertEqual(document.content.holds, [hold])
  }

  func testRouteNumberColorPersistsAndSupportsUndoRedo() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    let document = try makeDocument()
    let model = try EditorModel(document: document)
    for color in WallCatalog.colors {
      model.change { $0.routeNumberColor = color }
      XCTAssertTrue(model.dirty)
      var saved = document
      saved.content = model.content
      try files.save(saved)
      XCTAssertEqual(try files.read(files.url(for: saved.id)).content.routeNumberColor, color)
      model.undo()
      XCTAssertEqual(model.content, document.content)
      model.redo()
      XCTAssertEqual(model.content.routeNumberColor, color)
      model.change { $0.routeNumberColor = nil }
      saved.content = model.content
      try files.save(saved)
      XCTAssertNil(try files.read(files.url(for: saved.id)).content.routeNumberColor)
    }
  }

  func testRouteNumberColorRejectsInvalidSavedColors() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    var document = try makeDocument()
    for color in ["", "red", "#123", "#GGGGGG", "#12345678"] {
      document.content.routeNumberColor = color
      try files.save(document)
      XCTAssertThrowsError(try files.read(files.url(for: document.id)))
    }
  }

  func testRouteNumberSizeChangesPersistAndSupportUndoRedo() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    for size in [6.0, 13.0, 60.0] {
      let document = try makeDocument()
      let model = try EditorModel(document: document)
      model.tool = .route
      model.change { $0.routeNumberSize = size }
      var expected = document.content
      expected.routeNumberSize = size
      XCTAssertEqual(model.content, expected)
      XCTAssertEqual(model.content.effectiveRouteNumberSize, size)
      XCTAssertTrue(model.dirty)

      var saved = document
      saved.content = model.content
      try files.save(saved)
      XCTAssertEqual(try files.read(files.url(for: saved.id)).content, expected)

      model.undo()
      XCTAssertEqual(model.content, document.content)
      XCTAssertEqual(model.content.effectiveRouteNumberSize, 13)
      XCTAssertFalse(model.dirty)
      model.redo()
      XCTAssertEqual(model.content, expected)
    }
  }

  func testSliderResetsOnlyTheEditedValueToItsToolDefault() throws {
    let model = try EditorModel(document: makeDocument())
    model.updateStyle {
      $0.width = 12
      $0.outlineWidth = 6
    }
    let holdBeforeReset = model.content
    model.resetStyleValue(\.width)
    XCTAssertEqual(model.activeStyle.width, 3)
    XCTAssertEqual(model.activeStyle.outlineWidth, 6)
    model.undo()
    XCTAssertEqual(model.content, holdBeforeReset)

    model.tool = .text
    model.updateStyle {
      $0.fontSize = 100
      $0.outlineWidth = 6
      $0.isBold = true
    }
    model.resetStyleValue(\.fontSize)
    model.resetStyleValue(\.outlineWidth)
    XCTAssertEqual(model.activeStyle.fontSize, 24)
    XCTAssertEqual(model.activeStyle.outlineWidth, 0)
    XCTAssertTrue(model.activeStyle.isBold)

    model.tool = .route
    XCTAssertEqual(model.activeStyle.outlineWidth, 0)
    model.updateStyle {
      $0.width = 16
      $0.outlineWidth = 5
    }
    model.change { $0.routeNumberSize = 42 }
    model.resetStyleValue(\.width)
    model.resetStyleValue(\.outlineWidth)
    XCTAssertEqual(model.activeStyle.width, 4)
    XCTAssertEqual(model.activeStyle.outlineWidth, 0)
    model.resetRouteNumberSize()
    XCTAssertEqual(model.content.effectiveRouteNumberSize, 13)
    model.undo()
    XCTAssertEqual(model.content.effectiveRouteNumberSize, 42)
    model.redo()
    XCTAssertNil(model.content.routeNumberSize)
  }

  func testSliderDoubleTapTargetsCurrentThumbAndNormalChangesDoNotReset() async throws {
    let view = ResettableSliderView(frame: CGRect(x: 0, y: 0, width: 240, height: 32))
    let slider = view.slider
    slider.maximumValue = 20
    let tap = try XCTUnwrap(
      view.gestureRecognizers?.compactMap { $0 as? UITapGestureRecognizer }
        .first { $0.delegate === view })
    XCTAssertEqual(tap.numberOfTapsRequired, 2)
    XCTAssertTrue(tap.cancelsTouchesInView)

    func thumbCenter() -> CGPoint {
      let thumb = slider.thumbRect(
        forBounds: slider.bounds, trackRect: slider.trackRect(forBounds: slider.bounds),
        value: slider.value)
      return CGPoint(x: thumb.midX, y: thumb.midY)
    }

    slider.value = 3
    let initialPosition = thumbCenter()
    XCTAssertTrue(slider.thumbContains(initialPosition))
    var changedValue: Double?
    slider.onValueChange = { changedValue = $0 }
    var resets = 0
    let reset = expectation(description: "Double tap resets the slider")
    slider.onReset = {
      resets += 1
      slider.value = 3
      reset.fulfill()
    }
    slider.value = 16.4
    slider.sendActions(for: .valueChanged)
    XCTAssertEqual(changedValue, 16)
    XCTAssertEqual(resets, 0)
    XCTAssertTrue(slider.thumbContains(thumbCenter()))
    XCTAssertFalse(slider.thumbContains(initialPosition))
    view.perform(NSSelectorFromString("resetFromDoubleTap"))
    await fulfillment(of: [reset], timeout: 1)
    XCTAssertEqual(resets, 1)
    XCTAssertEqual(slider.value, 3)
    XCTAssertTrue(slider.thumbContains(initialPosition))
    slider.onReset = nil
  }

  func testRouteNumberVisibilityDefaultsAndPersists() throws {
    var document = try makeDocument()
    let legacy = try JSONEncoder().encode(document)
    let restored = try JSONDecoder().decode(WallDocument.self, from: legacy)
    XCTAssertNil(restored.content.showRouteNumbers)
    XCTAssertTrue(restored.content.effectiveShowRouteNumbers)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    for visible in [false, true] {
      document.content.showRouteNumbers = visible
      try files.save(document)
      XCTAssertEqual(
        try files.read(files.url(for: document.id)).content.effectiveShowRouteNumbers, visible)
    }
  }

  func testRouteLinesAndNumbersRenderIndependently() {
    var content = WallContent(name: "ルート表示")
    let first = Hold(position: WallPoint(x: 0.25, y: 0.5))
    let second = Hold(position: WallPoint(x: 0.75, y: 0.5))
    content.holds = [first, second]
    content.route = [first.id, second.id]
    content.lineStyle = MarkStyle(color: "#E55050", width: 2, outlineWidth: 0)
    for lines in [false, true] {
      for numbers in [false, true] {
        content.showLines = lines
        content.showRouteNumbers = numbers
        let output = SceneRenderer.render(image: image(), content: content)
        XCTAssertEqual(pixel(output, x: 300, y: 400) == [255, 255, 255, 255], !lines)
        var hasNumberInk = false
        for y in 390..<398 {
          for x in 145..<155 {
            let rgba = pixel(output, x: x, y: y)
            if rgba.count == 4 && rgba[0] < 128 { hasNumberInk = true }
          }
        }
        XCTAssertEqual(hasNumberInk, numbers)
        XCTAssertEqual(content.route, [first.id, second.id])
      }
    }
  }

  func testRouteNumberVisibilityIsUndoable() throws {
    let model = try EditorModel(document: makeDocument())
    let original = model.content
    model.change { $0.showRouteNumbers = !$0.effectiveShowRouteNumbers }
    XCTAssertFalse(model.content.effectiveShowRouteNumbers)
    XCTAssertTrue(model.content.showLines)
    model.undo()
    XCTAssertEqual(model.content, original)
    model.redo()
    XCTAssertFalse(model.content.effectiveShowRouteNumbers)
  }

  func testRouteUniquenessAndHoldRemoval() {
    let first = Hold(position: WallPoint(x: 0.2, y: 0.3))
    let second = Hold(position: WallPoint(x: 0.6, y: 0.7))
    var content = WallContent(name: "壁")
    content.holds = [first, second]
    content.appendToRoute(first.id)
    content.appendToRoute(first.id)
    content.appendToRoute(UUID())
    content.appendToRoute(second.id)
    XCTAssertEqual(content.route, [first.id, second.id])
    content.removeHold(first.id)
    XCTAssertEqual(content.holds.map(\.id), [second.id])
    XCTAssertEqual(content.route, [second.id])
  }

  func testRouteTapsToggleMembershipWithoutDeletingHoldsWithUndoAndRedo() throws {
    var document = try makeDocument()
    let first = Hold(position: WallPoint(x: 0.2, y: 0.5))
    let second = Hold(position: WallPoint(x: 0.5, y: 0.5))
    let third = Hold(position: WallPoint(x: 0.8, y: 0.5))
    document.content.holds = [first, second, third]
    let model = try EditorModel(document: document)
    model.tool = .route
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    let gesture = SimulatedTap()
    for hold in document.content.holds {
      gesture.testLocation = SceneRenderer.point(hold.position, in: canvas.bounds.size)
      canvas.perform(NSSelectorFromString("tapped:"), with: gesture)
    }
    XCTAssertEqual(model.content.route, [first.id, second.id, third.id])
    let beforeRemoval = model.content
    let historyCount = model.history.past.count
    gesture.testLocation = SceneRenderer.point(second.position, in: canvas.bounds.size)
    canvas.perform(NSSelectorFromString("tapped:"), with: gesture)
    XCTAssertEqual(model.content.route, [first.id, third.id])
    XCTAssertEqual(model.content.holds, document.content.holds)
    XCTAssertEqual(model.history.past.count, historyCount + 1)
    model.undo()
    XCTAssertEqual(model.content, beforeRemoval)
    model.redo()
    XCTAssertEqual(model.content.route, [first.id, third.id])
    canvas.perform(NSSelectorFromString("tapped:"), with: gesture)
    XCTAssertEqual(model.content.route, [first.id, third.id, second.id])
    XCTAssertEqual(model.content.holds, document.content.holds)
    XCTAssertEqual(model.selection, .hold(second.id))
  }

  func testRouteIgnoresEmptySpaceTextAndUnknownHolds() throws {
    var document = try makeDocument()
    let hold = Hold(position: WallPoint(x: 0.2, y: 0.5))
    document.content.holds = [hold]
    document.content.route = [hold.id]
    document.content.texts = [WallText(position: WallPoint(x: 0.5, y: 0.5), text: "文字")]
    let model = try EditorModel(document: document)
    model.tool = .route
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    let gesture = SimulatedTap()
    for point in [CGPoint(x: 300, y: 400), CGPoint(x: 500, y: 600)] {
      gesture.testLocation = point
      canvas.perform(NSSelectorFromString("tapped:"), with: gesture)
    }
    model.appendToRoute(UUID())
    XCTAssertEqual(model.content, document.content)
    XCTAssertFalse(model.canUndo)
    XCTAssertNil(model.selection)
  }

  func testHistorySupportsRedoBranchingAndBoundedMemory() {
    var history = EditHistory<Int>()
    history.record(0, replacing: 1)
    history.record(1, replacing: 1)
    XCTAssertEqual(history.past, [0])
    XCTAssertEqual(history.undo(1), 0)
    XCTAssertEqual(history.redo(0), 1)
    XCTAssertEqual(history.undo(1), 0)
    history.record(0, replacing: 2)
    XCTAssertNil(history.redo(2))
    for value in 2..<150 { history.record(value, replacing: value + 1) }
    XCTAssertEqual(history.past.count, 100)
  }

  func testFileSaveReloadUpdateAndDelete() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    var wall = try makeDocument()
    try files.save(wall)
    XCTAssertEqual(try files.list().count, 1)
    XCTAssertEqual(try files.read(files.url(for: wall.id)), wall)
    let photoURL = files.photoURL(for: wall.id)
    let sentinel = Date(timeIntervalSince1970: 1000)
    try FileManager.default.setAttributes(
      [.modificationDate: sentinel], ofItemAtPath: photoURL.path)
    wall.content.name = "更新済み"
    try files.save(wall)
    XCTAssertEqual(try files.list().count, 1)
    XCTAssertEqual(try files.read(files.url(for: wall.id)).content.name, "更新済み")
    XCTAssertEqual(
      try photoURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
      sentinel)
    try files.delete(wall.id)
    XCTAssertTrue(try files.list().isEmpty)
    XCTAssertFalse(FileManager.default.fileExists(atPath: photoURL.path))
  }

  func testLegacyWallMigratesWithoutChangingImageOrEdits() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let files = try WallFiles(directory: directory)
    var wall = try makeDocument()
    wall.content.name = "旧形式の課題"
    let url = files.url(for: wall.id)
    try JSONEncoder().encode(wall).write(to: url)
    let store = WallStore()

    await store.load(directory: directory)

    XCTAssertEqual(store.walls, [wall.metadata])
    let restored = try await store.document(for: wall.id)
    XCTAssertEqual(restored, wall)
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    XCTAssertNil(json?["imageData"])
  }

  func testStoreDeletesOnlySelectedWalls() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let store = WallStore()
    await store.load(directory: directory)
    let first = try makeDocument()
    let second = try makeDocument()
    let unselected = try makeDocument()
    for wall in [first, second, unselected] { try await store.save(wall) }

    await store.delete([first.id, second.id])

    XCTAssertEqual(store.walls, [unselected.metadata])
    XCTAssertNil(store.errorMessage)
    await store.load(directory: directory)
    XCTAssertEqual(store.walls, [unselected.metadata])
  }

  func testStoreReportsFailedDeletionWithoutBlockingOtherSelectedWalls() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let store = WallStore()
    await store.load(directory: directory)
    let saved = try makeDocument()
    var missingFile = try makeDocument()
    missingFile.content.name = "削除できなかった壁"
    try await store.save(saved)
    try await store.save(missingFile)
    let files = try WallFiles(directory: directory)
    try files.delete(missingFile.id)

    await store.delete([saved.id, missingFile.id])

    XCTAssertEqual(store.walls, [missingFile.metadata])
    XCTAssertTrue(try files.list().isEmpty)
    XCTAssertTrue(try XCTUnwrap(store.errorMessage).contains(missingFile.content.name))
  }

  func testCorruptAndUnsupportedDocumentsAreNotOverwritten() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    var wall = try makeDocument()
    wall.version = 2
    try files.save(wall)
    XCTAssertThrowsError(try files.read(files.url(for: wall.id)))
    let corrupt = Data("invalid json".utf8)
    try corrupt.write(to: files.url(for: wall.id))
    XCTAssertThrowsError(try files.read(files.url(for: wall.id)))
    XCTAssertEqual(try Data(contentsOf: files.url(for: wall.id)), corrupt)
  }

  func testInvalidRouteAndStyleAreRejected() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let files = try WallFiles(directory: directory)
    defer { removeTestDirectory(directory) }
    var wall = try makeDocument()
    wall.content.route = [UUID()]
    try files.save(wall)
    XCTAssertThrowsError(try files.read(files.url(for: wall.id)))
    wall.content.route = []
    wall.content.routeNumberSize = 61
    try files.save(wall)
    XCTAssertThrowsError(try files.read(files.url(for: wall.id)))
    wall.content.routeNumberSize = nil
    wall.content.textStyle.fontSize = -1
    try files.save(wall)
    XCTAssertThrowsError(try files.read(files.url(for: wall.id)))
  }

  func testEditorGestureIsOneUndoStepAndStyleIsUndoable() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.2, y: 0.3))
    let start = model.content
    let count = model.history.past.count
    model.beginGesture()
    for step in 1...10 {
      model.moveSelection(to: WallPoint(x: Double(step) / 10, y: 0.5))
    }
    XCTAssertEqual(model.content, start)
    XCTAssertEqual(model.history.past.count, count)
    XCTAssertEqual(model.canvasContent.holds[0].position.x, 1)
    model.endGesture()
    XCTAssertEqual(model.history.past.count, count + 1)
    model.undo()
    XCTAssertEqual(model.content, start)
    model.redo()
    XCTAssertEqual(model.content.holds[0].position.x, 1)
    let moved = model.content
    model.updateStyle {
      $0.color = "#E55050"
      $0.outlineWidth = 3
    }
    model.undo()
    XCTAssertEqual(model.content, moved)
  }

  func testCancelledGestureRestoresContent() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.3, y: 0.3))
    let start = model.content
    model.beginGesture()
    model.moveSelection(to: WallPoint(x: -1, y: 2))
    XCTAssertEqual(model.canvasContent.holds[0].position, WallPoint(x: 0, y: 1))
    XCTAssertEqual(model.content, start)
    model.cancelGesture()
    XCTAssertEqual(model.content, start)
    XCTAssertEqual(model.canvasContent, start)
  }

  func testHoldHandlesResizeInEveryDirectionWithUndoAndRedo() throws {
    for handle in CanvasView.ResizeHandle.allCases {
      for delta in [-10.0, 10.0] {
        var document = try makeDocument()
        let hold = Hold(position: WallPoint(x: 0.5, y: 0.5), radiusX: 0.1, radiusY: 0.1)
        document.content.holds = [hold]
        document.content.allowEllipses = true
        let model = try EditorModel(document: document)
        model.selection = .hold(hold.id)
        let canvas = CanvasView(model: model)
        canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
        let frame = SceneRenderer.holdRect(hold, content: model.content, size: canvas.bounds.size)
        let start = handle.position(in: frame.insetBy(dx: -5, dy: -5))
        XCTAssertEqual(canvas.resizeHandle(at: start), handle)
        XCTAssertNil(canvas.resizeHandle(at: CGPoint(x: frame.midX, y: frame.midY)))
        let gesture = SimulatedPan()
        gesture.testLocation = start
        gesture.testState = .began
        canvas.perform(NSSelectorFromString("panned:"), with: gesture)
        gesture.testState = .changed
        gesture.testTranslation = CGPoint(
          x: handle.direction.x * delta, y: handle.direction.y * delta)
        canvas.perform(NSSelectorFromString("panned:"), with: gesture)
        gesture.testTranslation = CGPoint(
          x: handle.direction.x * delta * 2, y: handle.direction.y * delta * 2)
        canvas.perform(NSSelectorFromString("panned:"), with: gesture)
        gesture.testState = .ended
        canvas.perform(NSSelectorFromString("panned:"), with: gesture)
        let resized = model.content
        XCTAssertEqual(resized.holds[0].position, hold.position)
        XCTAssertEqual(
          resized.holds[0].radiusX,
          hold.radiusX + abs(handle.direction.x) * delta * 2 / 600, accuracy: 0.0001)
        XCTAssertEqual(
          resized.holds[0].radiusY,
          hold.radiusY + abs(handle.direction.y) * delta * 2 / 800, accuracy: 0.0001)
        XCTAssertEqual(model.history.past.count, 1)
        model.undo()
        XCTAssertEqual(model.content, document.content)
        model.redo()
        XCTAssertEqual(model.content, resized)
      }
    }
  }

  func testCircleHandleResizePreservesCircleAndCancellation() throws {
    for cancelled in [false, true] {
      var document = try makeDocument()
      let hold = Hold(position: WallPoint(x: 0.5, y: 0.5), radiusX: 0.1, radiusY: 0.075)
      document.content.holds = [hold]
      document.content.allowEllipses = false
      let model = try EditorModel(document: document)
      model.selection = .hold(hold.id)
      let canvas = CanvasView(model: model)
      canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
      let frame = SceneRenderer.holdRect(hold, content: model.content, size: canvas.bounds.size)
      let gesture = SimulatedPan()
      gesture.testLocation = CanvasView.ResizeHandle.w.position(in: frame.insetBy(dx: -5, dy: -5))
      gesture.testState = .began
      canvas.perform(NSSelectorFromString("panned:"), with: gesture)
      gesture.testTranslation = CGPoint(x: 20, y: 0)
      gesture.testState = .changed
      canvas.perform(NSSelectorFromString("panned:"), with: gesture)
      XCTAssertEqual(model.canvasContent.holds[0].radiusX * 600, 40, accuracy: 0.0001)
      XCTAssertEqual(model.canvasContent.holds[0].radiusY * 800, 40, accuracy: 0.0001)
      XCTAssertEqual(model.content, document.content)
      gesture.testState = cancelled ? .cancelled : .ended
      canvas.perform(NSSelectorFromString("panned:"), with: gesture)
      if cancelled {
        XCTAssertEqual(model.content, document.content)
        XCTAssertFalse(model.canUndo)
      } else {
        XCTAssertEqual(model.history.past.count, 1)
      }
    }
  }

  func testRectangleCanBeTargetedAtCornerAndResizedWithEllipsesDisabled() throws {
    var document = try makeDocument()
    let hold = Hold(
      position: WallPoint(x: 0.5, y: 0.5), radiusX: 0.1, radiusY: 0.06, shape: .rectangle)
    document.content.holds = [hold]
    document.content.allowEllipses = false
    let model = try EditorModel(document: document)
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    let frame = SceneRenderer.holdRect(hold, content: model.content, size: canvas.bounds.size)
    XCTAssertEqual(frame.width, 120, accuracy: 0.001)
    XCTAssertEqual(frame.height, 96, accuracy: 0.001)

    model.tool = .route
    let tap = SimulatedTap()
    tap.testLocation = CGPoint(x: frame.maxX - 1, y: frame.maxY - 1)
    canvas.perform(NSSelectorFromString("tapped:"), with: tap)
    XCTAssertEqual(model.content.route, [hold.id])
    XCTAssertEqual(model.selection, .hold(hold.id))

    model.tool = .hold
    let pan = SimulatedPan()
    pan.testLocation = CanvasView.ResizeHandle.e.position(in: frame.insetBy(dx: -5, dy: -5))
    pan.testState = .began
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    pan.testTranslation = CGPoint(x: 20, y: 0)
    pan.testState = .changed
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    pan.testState = .ended
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    XCTAssertEqual(model.content.holds[0].radiusX * 600, 80, accuracy: 0.001)
    XCTAssertEqual(model.content.holds[0].radiusY, hold.radiusY, accuracy: 0.001)
  }

  func testChangingHoldShapeUpdatesSelectionAndNextHoldWithUndoAndRedo() async throws {
    let model = try EditorModel(document: makeDocument())
    model.change { $0.autoDetectHolds = false }
    let position = WallPoint(x: 0.3, y: 0.4)
    await model.addHold(at: position)
    let original = model.content.holds[0]
    XCTAssertEqual(original.effectiveShape, .oval)
    model.updateHoldShape(.rectangle)
    var expected = original
    expected.shape = .rectangle
    XCTAssertEqual(model.content.holds, [expected])
    XCTAssertEqual(model.activeHoldShape, .rectangle)
    model.undo()
    XCTAssertEqual(model.content.holds, [original])
    XCTAssertEqual(model.activeHoldShape, .oval)
    model.redo()
    await model.addHold(at: WallPoint(x: 0.7, y: 0.8))
    XCTAssertEqual(model.content.holds.map(\.effectiveShape), [.rectangle, .rectangle])
    model.updateHoldShape(.oval)
    XCTAssertEqual(model.content.holds.map(\.effectiveShape), [.rectangle, .oval])
  }

  func testResetViewportButtonStaysAtCanvasEdgeAndRestoresPanAndZoomWithoutEditing() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
    model.change { $0.holds[0].radiusX = 0.15 }
    let content = model.content
    let selection = model.selection
    let history = model.history.past
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 800, height: 800)
    canvas.layoutIfNeeded()
    let button = try XCTUnwrap(
      canvas.subviews.first { $0.accessibilityIdentifier == "canvasResetViewport" } as? UIButton)
    let buttonFrame = CGRect(x: 748, y: 748, width: 44, height: 44)
    XCTAssertEqual(button.frame, buttonFrame)
    let imageSize = CGSize(width: 600, height: 800)
    let holdFrame = SceneRenderer.holdRect(content.holds[0], content: content, size: imageSize)
      .offsetBy(dx: 100, dy: 0)
    let handle = CanvasView.ResizeHandle.e.position(in: holdFrame.insetBy(dx: -5, dy: -5))
    XCTAssertEqual(canvas.resizeHandle(at: handle), .e)

    model.tool = .pan
    let pinch = SimulatedPinch()
    pinch.testLocation = CGPoint(x: 400, y: 400)
    pinch.state = .began
    canvas.perform(NSSelectorFromString("pinched:"), with: pinch)
    pinch.state = .changed
    pinch.scale = 0.5
    canvas.perform(NSSelectorFromString("pinched:"), with: pinch)
    pinch.state = .ended
    canvas.perform(NSSelectorFromString("pinched:"), with: pinch)
    canvas.layoutIfNeeded()
    XCTAssertEqual(button.frame, buttonFrame)

    let pan = SimulatedPan()
    pan.testState = .began
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    pan.testState = .changed
    pan.testTranslation = CGPoint(x: 100, y: -50)
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    canvas.layoutIfNeeded()
    XCTAssertEqual(button.frame, buttonFrame)

    pan.testTranslation = CGPoint(x: 1000, y: -1000)
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    pan.testState = .ended
    canvas.perform(NSSelectorFromString("panned:"), with: pan)
    canvas.layoutIfNeeded()
    XCTAssertEqual(button.frame, buttonFrame)
    XCTAssertTrue(canvas.hitTest(button.center, with: nil)?.isDescendant(of: button) == true)

    model.tool = .hold
    XCTAssertNil(canvas.resizeHandle(at: handle))
    button.sendActions(for: .touchUpInside)
    canvas.layoutIfNeeded()
    XCTAssertEqual(button.frame, buttonFrame)
    XCTAssertEqual(canvas.resizeHandle(at: handle), .e)
    XCTAssertEqual(model.content, content)
    XCTAssertEqual(model.selection, selection)
    XCTAssertEqual(model.history.past, history)
  }

  func testResizeHandlesDoNotStartTrashDragOrAppearInRouteTool() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    canvas.layoutIfNeeded()
    let hold = try XCTUnwrap(model.content.holds.first)
    let frame = SceneRenderer.holdRect(hold, content: model.content, size: canvas.bounds.size)
    let start = CanvasView.ResizeHandle.e.position(in: frame.insetBy(dx: -5, dy: -5))
    let gesture = SimulatedLongPress()
    gesture.testLocation = start
    gesture.testState = .began
    canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
    let trash = try XCTUnwrap(
      canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
    XCTAssertTrue(trash.isHidden)
    model.tool = .route
    XCTAssertNil(canvas.resizeHandle(at: start))
  }

  func testLongPressTrashDeletesHoldsAndTextInOneUndoStep() async throws {
    for isText in [false, true] {
      let model = try EditorModel(document: makeDocument())
      if isText {
        model.tool = .text
        model.promptText(at: WallPoint(x: 0.4, y: 0.5))
        model.textDraft = "削除"
        model.commitText()
        model.textPrompt = false
      } else {
        model.content.autoDetectHolds = false
        await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
        model.appendToRoute(try XCTUnwrap(model.content.holds.first).id)
      }
      let original = model.content
      let count = model.history.past.count
      let canvas = CanvasView(model: model)
      canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
      canvas.layoutIfNeeded()
      let trash = try XCTUnwrap(
        canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
      let gesture = SimulatedLongPress()
      if isText {
        let frame = SceneRenderer.textRect(
          try XCTUnwrap(model.content.texts.first), size: canvas.bounds.size)
        gesture.testLocation = CGPoint(x: frame.midX, y: frame.midY)
      } else {
        gesture.testLocation = CGPoint(x: 300, y: 400)
      }
      gesture.testState = .began
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      XCTAssertFalse(trash.isHidden)
      gesture.testState = .changed
      gesture.testLocation = CGPoint(x: trash.center.x, y: trash.center.y)
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      XCTAssertEqual(trash.backgroundColor, .systemRed)
      gesture.testState = .ended
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      XCTAssertTrue(trash.isHidden)
      XCTAssertTrue(model.content.holds.isEmpty)
      XCTAssertTrue(model.content.texts.isEmpty)
      XCTAssertTrue(model.content.route.isEmpty)
      XCTAssertNil(model.selection)
      XCTAssertEqual(model.history.past.count, count + 1)
      model.undo()
      XCTAssertEqual(model.content, original)
      model.redo()
      XCTAssertTrue(model.content.holds.isEmpty)
      XCTAssertTrue(model.content.texts.isEmpty)
    }
  }

  func testLongPressTrashCancelsOrMovesWhenDroppedOutside() async throws {
    for cancelled in [false, true] {
      let model = try EditorModel(document: makeDocument())
      model.content.autoDetectHolds = false
      await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
      let original = model.content
      let count = model.history.past.count
      let canvas = CanvasView(model: model)
      canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
      canvas.layoutIfNeeded()
      let trash = try XCTUnwrap(
        canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
      let gesture = SimulatedLongPress()
      gesture.testLocation = CGPoint(x: 300, y: 400)
      gesture.testState = .began
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      gesture.testLocation = trash.center
      gesture.testState = .changed
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      gesture.testLocation = CGPoint(x: 360, y: 440)
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      XCTAssertNotEqual(trash.backgroundColor, .systemRed)
      gesture.testState = cancelled ? .cancelled : .ended
      canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
      XCTAssertTrue(trash.isHidden)
      XCTAssertEqual(model.content.holds.count, 1)
      if cancelled {
        XCTAssertEqual(model.content, original)
        XCTAssertEqual(model.history.past.count, count)
      } else {
        XCTAssertEqual(model.content.holds[0].position.x, 0.6, accuracy: 0.0001)
        XCTAssertEqual(model.content.holds[0].position.y, 0.55, accuracy: 0.0001)
        XCTAssertEqual(model.history.past.count, count + 1)
        model.undo()
        XCTAssertEqual(model.content, original)
      }
    }
  }

  func testStationaryLongPressOverTrashDoesNotDelete() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.5, y: 744.0 / 800))
    let original = model.content
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    canvas.layoutIfNeeded()
    let gesture = SimulatedLongPress()
    gesture.testLocation = CGPoint(x: 300, y: 744)
    gesture.testState = .began
    canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
    gesture.testState = .ended
    canvas.perform(NSSelectorFromString("trashDragged:"), with: gesture)
    XCTAssertEqual(model.content, original)
  }

  func testTextEntryStylesApplyToNewAndExistingText() throws {
    let model = try EditorModel(document: makeDocument())
    model.tool = .text
    model.promptText(at: WallPoint(x: 0.5, y: 0.5))
    model.textDraft = "文字装飾"
    model.updateStyle {
      $0.color = "#E55050"
      $0.fontFamily = .serif
      $0.fontWeight = 600
      $0.fontSize = 42
      $0.outlineColor = "#FFFFFF"
      $0.outlineWidth = 3
    }

    let newStyle = model.activeStyle
    XCTAssertTrue(model.textPrompt)
    XCTAssertTrue(model.editingText)
    model.commitText()
    let text = try XCTUnwrap(model.content.texts.first)
    XCTAssertEqual(text.style, newStyle)
    XCTAssertEqual(model.content.textStyle, newStyle)

    model.promptText(at: text.position, id: text.id)
    model.textDraft = "再編集"
    model.updateStyle {
      $0.fontFamily = .monospace
      $0.fontWeight = 900
      $0.outlineWidth = 6
    }
    let editedStyle = model.activeStyle
    model.commitText()
    XCTAssertEqual(model.content.texts.count, 1)
    XCTAssertEqual(model.content.texts[0].id, text.id)
    XCTAssertEqual(model.content.texts[0].text, "再編集")
    XCTAssertEqual(model.content.texts[0].style, editedStyle)
    XCTAssertEqual(model.content.textStyle, editedStyle)
  }

  func testEditorControlsPanelMatchesHoldHeightForShortAndTallContent() {
    for contentHeight: CGFloat in [60, 160, 400] {
      let panel = EditorControlsPanel {
        Color.clear.frame(height: 160)
      } content: {
        Color.clear.frame(height: contentHeight)
      }
      let controller = UIHostingController(rootView: panel)
      XCTAssertEqual(controller.sizeThatFits(in: CGSize(width: 320, height: 500)).height, 176)
      XCTAssertEqual(controller.sizeThatFits(in: CGSize(width: 320, height: 150)).height, 150)
    }
  }

  func testEditorControlsPanelCapsTallHoldControls() {
    let panel = EditorControlsPanel {
      Color.clear.frame(height: 400)
    } content: {
      Color.clear.frame(height: 60)
    }
    let controller = UIHostingController(rootView: panel)
    XCTAssertEqual(controller.sizeThatFits(in: CGSize(width: 320, height: 500)).height, 240)
  }

  func testEditorControlsPanelPlacesShortContentAtBottomAndTallContentAtTop() async {
    for (contentHeight, expectedTop): (CGFloat, CGFloat) in [(60, 108), (400, 8)] {
      let laidOut = expectation(description: "Lay out panel content of height \(contentHeight)")
      var measured = false
      let panel = EditorControlsPanel {
        Color.clear.frame(height: 160)
      } content: {
        Color.clear.frame(height: contentHeight)
          .onGeometryChange(for: CGFloat.self) { geometry in
            geometry.frame(in: .named("panel")).minY
          } action: { top in
            guard !measured else { return }
            measured = true
            XCTAssertEqual(top, expectedTop, accuracy: 0.5)
            laidOut.fulfill()
          }
      }
      .coordinateSpace(name: "panel")
      .frame(width: 320, height: 176)
      let controller = UIHostingController(rootView: panel)
      let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 375, height: 667))
      window.rootViewController = controller
      window.isHidden = false
      defer { window.isHidden = true }
      controller.view.layoutIfNeeded()
      await fulfillment(of: [laidOut], timeout: 1)
    }
  }

  func testEmptyTextEntryRendersNoBackgroundOrPlaceholder() throws {
    let entry = StyledTextEntryView(frame: CGRect(x: 0, y: 0, width: 240, height: 144))
    entry.update(text: "", style: MarkStyle())
    entry.layoutIfNeeded()
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: entry.bounds.size, format: format)
    let rendered = renderer.image { entry.layer.render(in: $0.cgContext) }
    let transparent = renderer.image { _ in }
    XCTAssertEqual(try XCTUnwrap(rendered.pngData()), try XCTUnwrap(transparent.pngData()))
    XCTAssertEqual(entry.accessibilityLabel, "文字を入力")
  }

  func testTextEntryRendersOutlineColorAndFullFontSizeRange() throws {
    func ink(for style: MarkStyle, editing: Bool = true) throws
      -> (height: Int, red: Int, blue: Int)
    {
      let rendered: UIImage
      if editing {
        let entry = StyledTextEntryView(frame: CGRect(x: 0, y: 0, width: 240, height: 220))
        entry.update(text: "H", style: style)
        entry.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        rendered = UIGraphicsImageRenderer(size: entry.bounds.size, format: format).image {
          entry.layer.render(in: $0.cgContext)
        }
      } else {
        var content = WallContent(name: "文字の枠線")
        content.texts = [WallText(position: WallPoint(x: 0.3, y: 0.5), text: "H", style: style)]
        rendered = SceneRenderer.render(
          image: image(size: CGSize(width: 600, height: 600)), content: content)
      }
      let image = try XCTUnwrap(rendered.cgImage)
      var rgba = [UInt8](repeating: 0, count: image.width * image.height * 4)
      try rgba.withUnsafeMutableBytes { bytes in
        let context = try XCTUnwrap(
          CGContext(
            data: bytes.baseAddress, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      }
      var rows = Set<Int>()
      var red = 0
      var blue = 0
      for i in stride(from: 0, to: rgba.count, by: 4) where rgba[i + 3] > 128 {
        if rgba[i] > 128 && rgba[i + 2] < 128 {
          red += 1
          rows.insert(i / 4 / image.width)
        }
        if rgba[i + 2] > 128 && rgba[i] < 128 {
          blue += 1
          rows.insert(i / 4 / image.width)
        }
      }
      return (rows.count, red, blue)
    }

    var style = MarkStyle(color: "#FF0000", outlineColor: "#0000FF")
    var previousHeight = 0
    for size in [6.0, 18, 56, 90, 120] {
      style.fontSize = size
      let result = try ink(for: style)
      XCTAssertGreaterThan(result.height, previousHeight, "Font size \(size) must grow")
      XCTAssertGreaterThan(result.red, 0)
      XCTAssertEqual(result.blue, 0)
      previousHeight = result.height
    }
    style.outlineWidth = 3
    let thin = try ink(for: style)
    XCTAssertGreaterThan(thin.blue, 0)
    XCTAssertGreaterThan(thin.red, 0)
    style.outlineWidth = 8
    XCTAssertGreaterThan(try ink(for: style).blue, thin.blue)
    for size in [24.0, 60, 120] {
      style.fontSize = size
      for width in [3.0, 8, 12] {
        style.outlineWidth = width
        let entry = try ink(for: style)
        let committed = try ink(for: style, editing: false)
        XCTAssertEqual(
          Double(entry.red) / Double(committed.red), 1, accuracy: 0.12,
          "Fill coverage at font size \(size), outline \(width)")
        XCTAssertEqual(
          Double(entry.blue) / Double(committed.blue), 1, accuracy: 0.18,
          "Outline coverage at font size \(size), outline \(width)")
      }
    }
  }

  func testTextEntryRestylesWithoutReplacingDraftOrSelection() throws {
    let entry = StyledTextEntryView(frame: CGRect(x: 0, y: 0, width: 240, height: 144))
    var style = MarkStyle()
    entry.update(text: "入力", style: style)
    entry.selectedRange = NSRange(location: 1, length: 1)

    style.fontSize = 120
    style.outlineWidth = 6
    entry.update(text: "入力", style: style)
    XCTAssertEqual(entry.text, "入力")
    XCTAssertEqual(entry.selectedRange, NSRange(location: 1, length: 1))
    let font = try XCTUnwrap(
      entry.textStorage.attribute(.font, at: 1, effectiveRange: nil) as? UIFont)
    XCTAssertEqual(font.pointSize, 120)

    var draft = ""
    entry.onTextChange = { draft = $0 }
    entry.insertText("力テスト")
    XCTAssertEqual(draft, "入力テスト")
    let strokeWidth = entry.textStorage.attribute(.strokeWidth, at: 4, effectiveRange: nil)
    XCTAssertEqual(strokeWidth as? Double, -10)
  }

  func testTextEntryDefersRestylingUntilJapaneseCompositionEnds() {
    let entry = StyledTextEntryView(frame: CGRect(x: 0, y: 0, width: 240, height: 144))
    var style = MarkStyle()
    entry.update(text: "", style: style)
    entry.setMarkedText("かな", selectedRange: NSRange(location: 2, length: 0))
    XCTAssertNotNil(entry.markedTextRange)

    style.outlineWidth = 6
    entry.update(text: "かな", style: style)
    XCTAssertNotNil(entry.markedTextRange)
    XCTAssertNil(entry.textStorage.attribute(.strokeWidth, at: 0, effectiveRange: nil))

    entry.unmarkText()
    XCTAssertNil(entry.markedTextRange)
    XCTAssertEqual(entry.text, "かな")
    let width = entry.textStorage.attribute(.strokeWidth, at: 0, effectiveRange: nil)
    XCTAssertEqual(width as? Double, -50)
  }

  func testEmptyTextCompletionDeletesExistingTextWithUndoAndRedo() throws {
    for draft in ["", "   ", "\t\n ", "　"] {
      var document = try makeDocument()
      let text = WallText(position: WallPoint(x: 0.3, y: 0.4), text: "削除する文字")
      let other = WallText(position: WallPoint(x: 0.6, y: 0.7), text: "残す文字")
      document.content.texts = [text, other]
      let model = try EditorModel(document: document)
      model.selection = .text(text.id)
      model.promptText(at: text.position, id: text.id)
      model.textDraft = draft

      model.commitText()

      XCTAssertEqual(model.content.texts, [other])
      XCTAssertNil(model.selection)
      XCTAssertTrue(model.dirty)
      model.undo()
      XCTAssertEqual(model.content, document.content)
      XCTAssertFalse(model.dirty)
      model.redo()
      XCTAssertEqual(model.content.texts, [other])
    }
  }

  func testEmptyNewTextCompletionDoesNotAddTextOrHistory() throws {
    for draft in ["", "   ", "\t\n ", "　"] {
      let model = try EditorModel(document: makeDocument())
      let original = model.content
      model.promptText(at: WallPoint(x: 0.5, y: 0.5))
      model.textDraft = draft

      model.commitText()

      XCTAssertEqual(model.content, original)
      XCTAssertNil(model.selection)
      XCTAssertFalse(model.dirty)
      XCTAssertFalse(model.canUndo)
    }
  }

  func testTextCompletionTrimsWhitespaceWithoutDeletingNonemptyText() throws {
    let model = try EditorModel(document: makeDocument())
    model.promptText(at: WallPoint(x: 0.5, y: 0.5))
    model.textDraft = " \n文字　"
    model.commitText()
    let text = try XCTUnwrap(model.content.texts.first)
    XCTAssertEqual(text.text, "文字")

    model.promptText(at: text.position, id: text.id)
    model.textDraft = "　更新 \n"
    model.commitText()
    XCTAssertEqual(model.content.texts.count, 1)
    XCTAssertEqual(model.content.texts[0].id, text.id)
    XCTAssertEqual(model.content.texts[0].text, "更新")
  }

  func testResizeCornerHitTestingFindsNearestHandle() {
    let frame = CGRect(x: 100, y: 150, width: 80, height: 60)
    let points: [(CanvasView.ResizeHandle, CGPoint)] = [
      (.nw, CGPoint(x: 100, y: 150)),
      (.ne, CGPoint(x: 180, y: 150)),
      (.sw, CGPoint(x: 100, y: 210)),
      (.se, CGPoint(x: 180, y: 210)),
    ]
    for (corner, point) in points {
      XCTAssertEqual(corner.position(in: frame), point)
      XCTAssertEqual(CanvasView.ResizeHandle.hit(at: point, in: frame), corner)
      XCTAssertEqual(
        CanvasView.ResizeHandle.hit(at: CGPoint(x: point.x + 3, y: point.y - 3), in: frame), corner)
    }
    XCTAssertNil(CanvasView.ResizeHandle.hit(at: CGPoint(x: frame.midX, y: frame.midY), in: frame))
    XCTAssertNil(CanvasView.ResizeHandle.hit(at: CGPoint(x: 0, y: 0), in: frame))
    let smallFrame = CGRect(x: 0, y: 0, width: 10, height: 10)
    XCTAssertEqual(CanvasView.ResizeHandle.hit(at: CGPoint(x: 9, y: 9), in: smallFrame), .se)
  }

  func testAllResizeCornersExpandAndShrinkHoldsAndTextWithUndo() async throws {
    let frame = CGRect(x: 0, y: 0, width: 100, height: 80)
    let corners: [CanvasView.ResizeHandle] = [.nw, .ne, .se, .sw]
    for corner in corners {
      let point = corner.position(in: frame)
      let outward = CGPoint(x: point.x == 0 ? -10 : 10, y: point.y == 0 ? -8 : 8)
      let inward = CGPoint(x: -outward.x, y: -outward.y)
      for isText in [false, true] {
        let model = try EditorModel(document: makeDocument())
        if isText {
          model.tool = .text
          model.promptText(at: WallPoint(x: 0.5, y: 0.5))
          model.textDraft = "サイズ変更"
          model.commitText()
        } else {
          model.content.autoDetectHolds = false
          await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
        }
        let original = model.content
        let historyCount = model.history.past.count
        let expectedGrowth = isText ? 1.1 : 1.2
        let expectedShrink = isText ? 0.9 : 0.8
        model.beginGesture()
        for (translation, expected) in [(outward, expectedGrowth), (inward, expectedShrink)] {
          let scale = corner.scale(translation: translation, size: frame.size, isText: isText)
          XCTAssertEqual(scale.width, expected, accuracy: 0.0001)
          XCTAssertEqual(scale.height, expected, accuracy: 0.0001)
          model.resizeSelection(x: scale.width, y: scale.height, from: original)
          XCTAssertEqual(model.content, original)
          let preview = model.canvasContent
          if isText {
            XCTAssertEqual(
              preview.texts[0].style.fontSize,
              original.texts[0].style.fontSize * expected, accuracy: 0.0001)
            XCTAssertEqual(preview.texts[0].position, original.texts[0].position)
          } else {
            XCTAssertEqual(
              preview.holds[0].radiusX,
              original.holds[0].radiusX * expected, accuracy: 0.0001)
            XCTAssertEqual(
              preview.holds[0].radiusY,
              original.holds[0].radiusY * expected, accuracy: 0.0001)
            XCTAssertEqual(preview.holds[0].position, original.holds[0].position)
          }
        }
        model.endGesture()
        XCTAssertEqual(model.history.past.count, historyCount + 1)
        let resized = model.content
        model.undo()
        XCTAssertEqual(model.content, original)
        model.redo()
        XCTAssertEqual(model.content, resized)
      }
      let limited = corner.scale(
        translation: CGPoint(x: -outward.x * 100, y: -outward.y * 100),
        size: frame.size, isText: false
      )
      XCTAssertEqual(limited.width, 0.1)
      XCTAssertEqual(limited.height, 0.1)
    }
  }

  func testThumbnailsAreDownsampledAndCachedByRevisionAndSize() async throws {
    let document = try makeDocument()
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { removeTestDirectory(directory) }
    let files = try WallFiles(directory: directory)
    try files.save(document)
    let photoURL = files.photoURL(for: document.id)
    let cache = WallThumbnailCache()
    let key = WallThumbnailCache.Key(id: document.id, updatedAt: document.updatedAt, maxPixels: 80)
    let first = try await cache.image(for: key, content: document.content, photoURL: photoURL)
    let cached = try await cache.image(for: key, content: document.content, photoURL: photoURL)
    XCTAssertEqual(first.cgImage?.height, 80)
    XCTAssertTrue(first === cached)

    let largerKey = WallThumbnailCache.Key(
      id: document.id, updatedAt: document.updatedAt, maxPixels: 160)
    let larger = try await cache.image(
      for: largerKey, content: document.content, photoURL: photoURL)
    XCTAssertEqual(larger.cgImage?.height, 160)

    var updated = document
    updated.updatedAt = document.updatedAt.addingTimeInterval(1)
    let updatedKey = WallThumbnailCache.Key(
      id: updated.id, updatedAt: updated.updatedAt, maxPixels: 80)
    let newImage = try await cache.image(
      for: updatedKey, content: updated.content, photoURL: photoURL)
    XCTAssertFalse(first === newImage)
  }

  func testSelectionDrawsOutlinedSquareHandlesInAllEightDirections() async throws {
    let model = try EditorModel(document: makeDocument())
    model.content.autoDetectHolds = false
    await model.addHold(at: WallPoint(x: 0.5, y: 0.5))
    let canvas = CanvasView(model: model)
    canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let snapshot = UIGraphicsImageRenderer(size: canvas.bounds.size, format: format).image {
      renderer in
      canvas.layoutIfNeeded()
      canvas.layer.render(in: renderer.cgContext)
    }
    let hold = try XCTUnwrap(model.content.holds.first)
    let frame = SceneRenderer.holdRect(hold, content: model.content, size: canvas.bounds.size)
      .insetBy(dx: -5, dy: -5)
    for handle in CanvasView.ResizeHandle.allCases {
      let point = handle.position(in: frame)
      let color = pixel(snapshot, x: Int(point.x), y: Int(point.y))
      XCTAssertEqual(color, [255, 255, 255, 255])
      let hasBlueBorder = (-5...5).contains { offsetX in
        (-5...5).contains { offsetY in
          let border = pixel(snapshot, x: Int(point.x) + offsetX, y: Int(point.y) + offsetY)
          return border.count == 4 && border[2] > 200 && border[0] < 100
        }
      }
      XCTAssertTrue(hasBlueBorder)
    }
  }

  func testPhotoSaveExportsCurrentEditsAtOriginalSize() async throws {
    let model = try EditorModel(document: makeDocument())
    let first = Hold(position: WallPoint(x: 0.25, y: 0.5))
    let second = Hold(position: WallPoint(x: 0.75, y: 0.5))
    model.change {
      $0.holds = [first, second]
      $0.route = [first.id, second.id]
      $0.lineStyle = MarkStyle(color: "#E55050", width: 12, outlineWidth: 0)
      $0.texts = [WallText(position: WallPoint(x: 0.1, y: 0.8), text: "核心")]
    }
    model.selection = .hold(first.id)
    let content = model.content
    var savedData: Data?
    try await model.saveImageToPhotos { savedData = $0 }
    let data = try XCTUnwrap(savedData)
    XCTAssertEqual(Array(data.prefix(8)), [137, 80, 78, 71, 13, 10, 26, 10])
    let savedImage = try XCTUnwrap(UIImage(data: data))
    XCTAssertEqual(savedImage.cgImage?.width, 600)
    XCTAssertEqual(savedImage.cgImage?.height, 800)
    XCTAssertEqual(data, SceneRenderer.render(image: model.image, content: content).pngData())
    XCTAssertNotEqual(pixel(savedImage, x: 300, y: 400), [255, 255, 255, 255])
    XCTAssertEqual(model.content, content)
    XCTAssertEqual(model.selection, .hold(first.id))
    XCTAssertTrue(model.dirty)
    XCTAssertTrue(model.canUndo)
  }

  func testPhotoSavePropagatesPermissionAndWriteErrorsWithoutChangingEdits() async throws {
    let model = try EditorModel(document: makeDocument())
    model.change { $0.name = "変更した壁" }
    let content = model.content
    let savedContent = model.savedContent
    let errors: [Error] = [PintoError.photoLibraryAccessDenied, CocoaError(.fileWriteUnknown)]
    for expected in errors {
      do {
        try await model.saveImageToPhotos { _ in throw expected }
        XCTFail("Photo saving must report failures")
      } catch {
        XCTAssertEqual(error.localizedDescription, expected.localizedDescription)
      }
      XCTAssertEqual(model.content, content)
      XCTAssertEqual(model.savedContent, savedContent)
      XCTAssertTrue(model.dirty)
    }
  }

  func testPNGRetainsOriginalPixelSizeAndOmitsSelectionAndTitle() throws {
    let source = image(size: CGSize(width: 2400, height: 3200))
    let content = WallContent(name: "このタイトルは画像には追加されない")
    let output = SceneRenderer.render(image: source, content: content)
    XCTAssertEqual(output.cgImage?.width, 2400)
    XCTAssertEqual(output.cgImage?.height, 3200)
    XCTAssertEqual(output.scale, 1)
    XCTAssertEqual(pixel(output, x: 10, y: 10), [255, 255, 255, 255])
    XCTAssertEqual(pixel(output, x: 1200, y: 1600), [255, 255, 255, 255])
    XCTAssertNotNil(output.pngData())
  }

  func testPreviewAndExportUseIdenticalScaledStrokes() {
    let source = image(size: CGSize(width: 1200, height: 1600))
    var content = WallContent(name: "線")
    let first = Hold(position: WallPoint(x: 0.25, y: 0.5))
    let second = Hold(position: WallPoint(x: 0.75, y: 0.5))
    content.holds = [first, second]
    content.route = [first.id, second.id]
    content.lineStyle = MarkStyle(color: "#E55050", width: 12, outlineWidth: 0)
    let full = SceneRenderer.render(image: source, content: content)
    let small = SceneRenderer.render(image: source, content: content, maxDimension: 800)
    XCTAssertEqual(pixel(full, x: 600, y: 800), pixel(small, x: 300, y: 400))
    XCTAssertEqual(pixel(full, x: 600, y: 808), pixel(small, x: 300, y: 404))
    content.showLines = false
    let hidden = SceneRenderer.render(image: source, content: content)
    XCTAssertEqual(pixel(hidden, x: 600, y: 800), [255, 255, 255, 255])
  }

  func testBottomTextAndEllipseToggleGeometry() {
    let size = CGSize(width: 600, height: 800)
    let text = WallText(position: WallPoint(x: 0.9, y: 1), text: "下端の文字")
    let textRect = SceneRenderer.textRect(text, size: size)
    XCTAssertLessThanOrEqual(textRect.maxY, size.height)
    XCTAssertLessThanOrEqual(textRect.maxX, size.width)
    var content = WallContent(name: "楕円")
    content.texts = [text]
    let output = SceneRenderer.render(image: image(size: size), content: content)
    var foundTextInk = false
    for y in stride(from: Int(textRect.minY), to: Int(textRect.maxY), by: 2) {
      for x in stride(from: Int(textRect.minX), to: Int(textRect.maxX), by: 2) {
        let rgba = pixel(output, x: x, y: y)
        if rgba.count == 4 && rgba[0] < 128 {
          foundTextInk = true
          break
        }
      }
      if foundTextInk { break }
    }
    XCTAssertTrue(foundTextInk, "Bottom text must be drawn inside the PNG, not clipped away")
    let hold = Hold(position: WallPoint(x: 0.5, y: 0.5), radiusX: 0.1, radiusY: 0.02)
    let ellipse = SceneRenderer.holdRect(hold, content: content, size: size)
    XCTAssertNotEqual(ellipse.width, ellipse.height)
    content.allowEllipses = false
    let circle = SceneRenderer.holdRect(hold, content: content, size: size)
    XCTAssertEqual(circle.width, circle.height)
  }

  func testRectangleEdgesAppearInBothPreviewAndFullSizeRender() {
    let source = image(size: CGSize(width: 600, height: 800))
    let style = MarkStyle(color: "#202522", width: 12)
    let position = WallPoint(x: 0.5, y: 0.5)
    var content = WallContent(name: "形")
    content.holds = [
      Hold(position: position, radiusX: 0.1, radiusY: 0.05, style: style, shape: .rectangle)
    ]
    let full = SceneRenderer.render(image: source, content: content)
    let preview = SceneRenderer.render(image: source, content: content, maxDimension: 400)
    let white: [UInt8] = [255, 255, 255, 255]
    XCTAssertLessThan(pixel(full, x: 350, y: 360)[0], 128)
    XCTAssertEqual(pixel(full, x: 350, y: 360), pixel(preview, x: 175, y: 180))
    XCTAssertEqual(pixel(full, x: 300, y: 400), white)
    content.holds[0].shape = nil
    let oval = SceneRenderer.render(image: source, content: content)
    XCTAssertEqual(pixel(oval, x: 350, y: 360), white)
  }

  func testCancelledHoldPlacementDoesNotChangeDocument() async throws {
    let model = try EditorModel(document: makeDocument())
    let original = model.content
    let placement = Task { await model.addHold(at: WallPoint(x: 0.5, y: 0.5)) }
    placement.cancel()
    await placement.value
    XCTAssertEqual(model.content, original)
    XCTAssertFalse(model.canUndo)
    XCTAssertNil(model.errorMessage)
  }

  func testDetectionFindsHoldAtCorrectImageCoordinatesAndRejectsFlatWall() async throws {
    let size = CGSize(width: 600, height: 800)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let source = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
      UIColor.white.setFill()
      renderer.fill(CGRect(origin: .zero, size: size))
      UIColor.red.setFill()
      UIBezierPath(ovalIn: CGRect(x: 100, y: 120, width: 70, height: 40)).fill()
    }
    let detected = try XCTUnwrap(
      HoldDetection.detect(
        image: source, position: WallPoint(x: 135.0 / 600, y: 140.0 / 800), style: MarkStyle()
      ))
    XCTAssertEqual(detected.position.x, 135.0 / 600, accuracy: 0.01)
    XCTAssertEqual(detected.position.y, 140.0 / 800, accuracy: 0.01)
    XCTAssertGreaterThan(detected.radiusX * 600, detected.radiusY * 800)
    var document = WallDocument(
      imageData: try source.normalizedPNG(), content: WallContent(name: "自動検出"))
    document.content.newHoldShape = .rectangle
    let model = try EditorModel(document: document)
    await model.addHold(at: WallPoint(x: 135.0 / 600, y: 140.0 / 800))
    let rectangle = try XCTUnwrap(model.content.holds.first)
    XCTAssertEqual(rectangle.effectiveShape, .rectangle)
    XCTAssertEqual(rectangle.position, detected.position)
    XCTAssertEqual(rectangle.radiusY, detected.radiusY, accuracy: 1e-10)
    XCTAssertNil(
      try HoldDetection.detect(
        image: image(), position: WallPoint(x: 0.5, y: 0.5), style: MarkStyle()))
  }

  func testAutomaticHoldSizingKeepsPhotoClearOfThickLineAndOutline() async throws {
    let size = CGSize(width: 1200, height: 900)
    let silhouette = CGRect(x: 144, y: 210, width: 96, height: 36)
    let position = WallPoint(x: silhouette.midX / size.width, y: silhouette.midY / size.height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let source = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
      UIColor.white.setFill()
      renderer.fill(CGRect(origin: .zero, size: size))
      UIColor.red.setFill()
      UIBezierPath(ovalIn: silhouette).fill()
    }
    let data = try source.normalizedPNG()
    for (shape, allowEllipses) in [
      (HoldShape.oval, true), (.oval, false), (.rectangle, false),
    ] {
      for outlineWidth in [0.0, 12.0] {
        var content = WallContent(name: "自動検出")
        content.newHoldShape = shape
        content.allowEllipses = allowEllipses
        content.holdStyle = MarkStyle(
          color: "#000000", width: 20, outlineColor: "#0000FF", outlineWidth: outlineWidth)
        let model = try EditorModel(document: WallDocument(imageData: data, content: content))
        await model.addHold(at: position)
        let hold = try XCTUnwrap(model.selectedHold)
        XCTAssertEqual(hold.effectiveShape, shape)
        let rect = SceneRenderer.holdRect(hold, content: model.content, size: size)
        let rendered = SceneRenderer.render(image: model.image, content: model.content)
        XCTAssertEqual(pixel(rendered, x: Int(rect.midX), y: Int(rect.minY)), [0, 0, 0, 255])
        for angle in stride(from: 0.0, to: 2 * Double.pi, by: Double.pi / 16) {
          let x = Int(silhouette.midX + cos(angle) * (silhouette.width / 2 - 2))
          let y = Int(silhouette.midY + sin(angle) * (silhouette.height / 2 - 2))
          XCTAssertEqual(
            pixel(rendered, x: x, y: y), pixel(source, x: x, y: y),
            "\(shape), ellipses: \(allowEllipses), outline: \(outlineWidth), pixel: \(x), \(y)")
        }
      }
    }
  }

  private func pixel(_ image: UIImage, x: Int, y: Int) -> [UInt8] {
    guard let source = image.cgImage,
      let crop = source.cropping(to: CGRect(x: x, y: y, width: 1, height: 1))
    else {
      XCTFail("Missing image pixels")
      return []
    }
    var bytes = [UInt8](repeating: 0, count: 4)
    bytes.withUnsafeMutableBytes { buffer in
      guard
        let context = CGContext(
          data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
          bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else {
        XCTFail("Missing bitmap context")
        return
      }
      context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    }
    return bytes
  }

  private func removeTestDirectory(_ directory: URL) {
    do { try FileManager.default.removeItem(at: directory) } catch {
      XCTFail("Failed to clean test data: \(error)")
    }
  }
}
