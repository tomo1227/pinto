import XCTest
import UIKit
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

@MainActor
final class PintoTests: XCTestCase {
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

    func testUserManualIsBundledAndIncludesCurrentInstructions() throws {
        let blocks = try UserManual.load()
        XCTAssertEqual(String(try XCTUnwrap(blocks.first).text.characters), "Pinto ユーザーマニュアル")
        XCTAssertEqual(blocks.first?.headingLevel, 1)
        let content = blocks.map { String($0.text.characters) }.joined(separator: "\n")
        XCTAssertTrue(content.contains("ルートの数字色"))
        XCTAssertTrue(content.contains("左にスワイプ"))
        XCTAssertTrue(content.contains("自動保存"))
    }

    func testUserManualPreservesHeadingsListsAndInlineFormatting() throws {
        let blocks = try UserManual.blocks(markdown: """
        # 見出し

        本文の**太字**です。

        1. 最初
        2. 次

        - 箇条書き
        """)
        XCTAssertEqual(blocks.count, 5)
        XCTAssertEqual(blocks[0].headingLevel, 1)
        XCTAssertEqual(String(blocks[1].text.characters), "本文の太字です。")
        XCTAssertTrue(blocks[1].text.runs.contains {
            $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true
        })
        XCTAssertEqual(blocks[2].listMarker, "1.")
        XCTAssertEqual(blocks[3].listMarker, "2.")
        XCTAssertEqual(blocks[4].listMarker, "\u{2022}")
        XCTAssertThrowsError(try UserManual.blocks(markdown: ""))
    }

    func testDocumentRoundTripPreservesAllEditorProperties() throws {
        var document = try makeDocument()
        var style = MarkStyle(color: "#7654A6", width: 7, outlineColor: "#FFFEFA", outlineWidth: 3)
        style.fontFamily = .serif
        style.fontWeight = 900
        style.isItalic = true
        style.fontSize = 42
        let hold = Hold(position: WallPoint(x: 0.3, y: 0.4), radiusX: 0.06, radiusY: 0.03, style: style)
        document.content.holds = [hold]
        document.content.route = [hold.id]
        document.content.texts = [WallText(position: WallPoint(x: 0.1, y: 0.9), text: "核心", style: style)]
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
        XCTAssertEqual(try JSONDecoder().decode(MarkStyle.self, from: JSONEncoder().encode(style)), style)
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
            XCTAssertTrue(italicFont.fontDescriptor.symbolicTraits.contains(.traitItalic)
                          || italicFont.fontDescriptor.matrix != .identity)
            var content = WallContent(name: "斜体")
            content.texts = [WallText(position: WallPoint(x: 0.2, y: 0.5), text: "Pinto", style: style)]
            let italicImage = try XCTUnwrap(SceneRenderer.render(image: image(), content: content).pngData())
            content.texts[0].style.isItalic = false
            let regularImage = try XCTUnwrap(SceneRenderer.render(image: image(), content: content).pngData())
            XCTAssertNotEqual(italicImage, regularImage)
        }
    }

    func testAutosavePersistsEditsAndUndoRedoWithoutChangingHistory() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { removeTestDirectory(directory) }
        let store = WallStore()
        store.load(directory: directory)
        let document = try makeDocument()
        try store.save(document)
        let files = try WallFiles(directory: directory)
        let model = try EditorModel(document: document)
        model.change { $0.name = "自動保存した壁"; $0.routeNumberSize = 40 }
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
        store.load(directory: directory)
        let document = try makeDocument()
        try store.save(document)
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
        store.load(directory: directory)
        let model = try EditorModel(document: makeDocument())
        model.change { $0.name = "戻る直前の編集" }
        let pending = Task { try await model.autosave(to: store) }
        await Task.yield()
        try model.save(to: store)
        let saved = model.document
        try await pending.value
        XCTAssertEqual(model.document, saved)
        XCTAssertFalse(model.dirty)
        let files = try WallFiles(directory: directory)
        XCTAssertEqual(try files.read(files.url(for: saved.id)), saved)
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
        let small = try XCTUnwrap(SceneRenderer.render(image: image(), content: document.content).pngData())
        document.content.routeNumberSize = 40
        let large = try XCTUnwrap(SceneRenderer.render(image: image(), content: document.content).pngData())
        XCTAssertNotEqual(small, large)
    }

    func testRouteNumberColorDefaultsToHoldColorAndRendersIndependently() throws {
        var document = try makeDocument()
        let restored = try JSONDecoder().decode(WallDocument.self, from: JSONEncoder().encode(document))
        XCTAssertNil(restored.content.routeNumberColor)
        let hold = Hold(position: WallPoint(x: 0.5, y: 0.5),
                        style: MarkStyle(color: "#2589C7"))
        document.content.holds = [hold]
        document.content.route = [hold.id]
        document.content.routeNumberSize = 40
        let legacy = SceneRenderer.render(image: image(), content: document.content)
        document.content.routeNumberColor = hold.style.color
        XCTAssertEqual(SceneRenderer.render(image: image(), content: document.content).pngData(), legacy.pngData())
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
            XCTAssertEqual(try files.read(files.url(for: document.id)).content.effectiveShowRouteNumbers, visible)
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
        wall.content.name = "更新済み"
        try files.save(wall)
        XCTAssertEqual(try files.list().count, 1)
        XCTAssertEqual(try files.read(files.url(for: wall.id)).content.name, "更新済み")
        try files.delete(wall.id)
        XCTAssertTrue(try files.list().isEmpty)
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

    func testEditorGestureIsOneUndoStepAndStyleIsUndoable() throws {
        let model = try EditorModel(document: makeDocument())
        model.content.autoDetectHolds = false
        model.addHold(at: WallPoint(x: 0.2, y: 0.3))
        let start = model.content
        let count = model.history.past.count
        model.beginGesture()
        for step in 1...10 {
            model.moveSelection(to: WallPoint(x: Double(step) / 10, y: 0.5))
        }
        model.endGesture()
        XCTAssertEqual(model.history.past.count, count + 1)
        model.undo()
        XCTAssertEqual(model.content, start)
        model.redo()
        XCTAssertEqual(model.content.holds[0].position.x, 1)
        let moved = model.content
        model.updateStyle { $0.color = "#E55050"; $0.outlineWidth = 3 }
        model.undo()
        XCTAssertEqual(model.content, moved)
    }

    func testCancelledGestureRestoresContent() throws {
        let model = try EditorModel(document: makeDocument())
        model.content.autoDetectHolds = false
        model.addHold(at: WallPoint(x: 0.3, y: 0.3))
        let start = model.content
        model.beginGesture()
        model.moveSelection(to: WallPoint(x: -1, y: 2))
        XCTAssertEqual(model.content.holds[0].position, WallPoint(x: 0, y: 1))
        model.cancelGesture()
        XCTAssertEqual(model.content, start)
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
                gesture.testTranslation = CGPoint(x: handle.direction.x * delta, y: handle.direction.y * delta)
                canvas.perform(NSSelectorFromString("panned:"), with: gesture)
                gesture.testTranslation = CGPoint(x: handle.direction.x * delta * 2, y: handle.direction.y * delta * 2)
                canvas.perform(NSSelectorFromString("panned:"), with: gesture)
                gesture.testState = .ended
                canvas.perform(NSSelectorFromString("panned:"), with: gesture)
                let resized = model.content
                XCTAssertEqual(resized.holds[0].position, hold.position)
                XCTAssertEqual(resized.holds[0].radiusX,
                               hold.radiusX + abs(handle.direction.x) * delta * 2 / 600, accuracy: 0.0001)
                XCTAssertEqual(resized.holds[0].radiusY,
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
            XCTAssertEqual(model.content.holds[0].radiusX * 600, 40, accuracy: 0.0001)
            XCTAssertEqual(model.content.holds[0].radiusY * 800, 40, accuracy: 0.0001)
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

    func testResizeHandlesDoNotStartTrashDragOrAppearInRouteTool() throws {
        let model = try EditorModel(document: makeDocument())
        model.content.autoDetectHolds = false
        model.addHold(at: WallPoint(x: 0.5, y: 0.5))
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
        let trash = try XCTUnwrap(canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
        XCTAssertTrue(trash.isHidden)
        model.tool = .route
        XCTAssertNil(canvas.resizeHandle(at: start))
    }

    func testLongPressTrashDeletesHoldsAndTextInOneUndoStep() throws {
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
                model.addHold(at: WallPoint(x: 0.5, y: 0.5))
                model.appendToRoute(try XCTUnwrap(model.content.holds.first).id)
            }
            let original = model.content
            let count = model.history.past.count
            let canvas = CanvasView(model: model)
            canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
            canvas.layoutIfNeeded()
            let trash = try XCTUnwrap(canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
            let gesture = SimulatedLongPress()
            if isText {
                let frame = SceneRenderer.textRect(try XCTUnwrap(model.content.texts.first), size: canvas.bounds.size)
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

    func testLongPressTrashCancelsOrMovesWhenDroppedOutside() throws {
        for cancelled in [false, true] {
            let model = try EditorModel(document: makeDocument())
            model.content.autoDetectHolds = false
            model.addHold(at: WallPoint(x: 0.5, y: 0.5))
            let original = model.content
            let count = model.history.past.count
            let canvas = CanvasView(model: model)
            canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
            canvas.layoutIfNeeded()
            let trash = try XCTUnwrap(canvas.subviews.first { $0.accessibilityIdentifier == "canvasTrashTarget" })
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

    func testStationaryLongPressOverTrashDoesNotDelete() throws {
        let model = try EditorModel(document: makeDocument())
        model.content.autoDetectHolds = false
        model.addHold(at: WallPoint(x: 0.5, y: 744.0 / 800))
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
            (.se, CGPoint(x: 180, y: 210))
        ]
        for (corner, point) in points {
            XCTAssertEqual(corner.position(in: frame), point)
            XCTAssertEqual(CanvasView.ResizeHandle.hit(at: point, in: frame), corner)
            XCTAssertEqual(CanvasView.ResizeHandle.hit(at: CGPoint(x: point.x + 3, y: point.y - 3), in: frame), corner)
        }
        XCTAssertNil(CanvasView.ResizeHandle.hit(at: CGPoint(x: frame.midX, y: frame.midY), in: frame))
        XCTAssertNil(CanvasView.ResizeHandle.hit(at: CGPoint(x: 0, y: 0), in: frame))
        let smallFrame = CGRect(x: 0, y: 0, width: 10, height: 10)
        XCTAssertEqual(CanvasView.ResizeHandle.hit(at: CGPoint(x: 9, y: 9), in: smallFrame), .se)
    }

    func testAllResizeCornersExpandAndShrinkHoldsAndTextWithUndo() throws {
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
                    model.addHold(at: WallPoint(x: 0.5, y: 0.5))
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
                    if isText {
                        XCTAssertEqual(model.content.texts[0].style.fontSize,
                                       original.texts[0].style.fontSize * expected, accuracy: 0.0001)
                        XCTAssertEqual(model.content.texts[0].position, original.texts[0].position)
                    } else {
                        XCTAssertEqual(model.content.holds[0].radiusX,
                                       original.holds[0].radiusX * expected, accuracy: 0.0001)
                        XCTAssertEqual(model.content.holds[0].radiusY,
                                       original.holds[0].radiusY * expected, accuracy: 0.0001)
                        XCTAssertEqual(model.content.holds[0].position, original.holds[0].position)
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

    func testSelectionDrawsOutlinedSquareHandlesInAllEightDirections() throws {
        let model = try EditorModel(document: makeDocument())
        model.content.autoDetectHolds = false
        model.addHold(at: WallPoint(x: 0.5, y: 0.5))
        let canvas = CanvasView(model: model)
        canvas.frame = CGRect(x: 0, y: 0, width: 600, height: 800)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let snapshot = UIGraphicsImageRenderer(size: canvas.bounds.size, format: format).image { renderer in
            canvas.draw(canvas.bounds)
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
                if rgba.count == 4 && rgba[0] < 128 { foundTextInk = true; break }
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

    func testDetectionFindsHoldAtCorrectImageCoordinatesAndRejectsFlatWall() throws {
        let size = CGSize(width: 600, height: 800)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let source = UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            UIColor.white.setFill()
            renderer.fill(CGRect(origin: .zero, size: size))
            UIColor.red.setFill()
            UIBezierPath(ovalIn: CGRect(x: 100, y: 120, width: 70, height: 40)).fill()
        }
        let detected = try XCTUnwrap(HoldDetection.detect(
            image: source, position: WallPoint(x: 135.0 / 600, y: 140.0 / 800), style: MarkStyle()
        ))
        XCTAssertEqual(detected.position.x, 135.0 / 600, accuracy: 0.01)
        XCTAssertEqual(detected.position.y, 140.0 / 800, accuracy: 0.01)
        XCTAssertGreaterThan(detected.radiusX * 600, detected.radiusY * 800)
        XCTAssertNil(try HoldDetection.detect(image: image(), position: WallPoint(x: 0.5, y: 0.5), style: MarkStyle()))
    }

    private func pixel(_ image: UIImage, x: Int, y: Int) -> [UInt8] {
        guard let source = image.cgImage, let crop = source.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)) else {
            XCTFail("Missing image pixels")
            return []
        }
        var bytes = [UInt8](repeating: 0, count: 4)
        bytes.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
                                          bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                XCTFail("Missing bitmap context")
                return
            }
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return bytes
    }

    private func removeTestDirectory(_ directory: URL) {
        do { try FileManager.default.removeItem(at: directory) }
        catch { XCTFail("Failed to clean test data: \(error)") }
    }
}
