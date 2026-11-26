import SwiftUI

struct StyledTextEntry: UIViewRepresentable {
  @Binding var text: String
  let style: MarkStyle

  func makeUIView(context: Context) -> StyledTextEntryView {
    StyledTextEntryView(frame: .zero)
  }

  func updateUIView(_ view: StyledTextEntryView, context: Context) {
    let binding = $text
    view.onTextChange = {
      if binding.wrappedValue != $0 { binding.wrappedValue = $0 }
    }
    view.update(text: text, style: style)
  }
}

final class StyledTextEntryView: UITextView, UITextViewDelegate {
  var onTextChange: ((String) -> Void)?
  private var style = MarkStyle()
  private var appliedStyle: MarkStyle?
  private var didRequestFocus = false

  override init(frame: CGRect, textContainer: NSTextContainer? = nil) {
    let container = textContainer ?? NSTextContainer()
    let storage = NSTextStorage()
    let layout = OutlinedTextLayoutManager()
    storage.addLayoutManager(layout)
    layout.addTextContainer(container)
    super.init(frame: frame, textContainer: container)
    delegate = self
    backgroundColor = .clear
    textContainerInset = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
    accessibilityLabel = "文字を入力"
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil, !didRequestFocus else { return }
    didRequestFocus = true
    becomeFirstResponder()
  }

  func update(text: String, style: MarkStyle) {
    self.style = style
    if markedTextRange == nil, self.text != text {
      let attributes = entryAttributes()
      appliedStyle = style
      attributedText = NSAttributedString(string: text, attributes: attributes)
      typingAttributes = attributes
    }
    applyStyleIfNeeded()
  }

  func textViewDidChange(_ textView: UITextView) {
    applyStyleIfNeeded()
    onTextChange?(text)
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    applyStyleIfNeeded()
  }

  override func unmarkText() {
    super.unmarkText()
    applyStyleIfNeeded()
  }

  private func entryAttributes() -> [NSAttributedString.Key: Any] {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    var attributes = SceneRenderer.textAttributes(style, unit: 1)
    attributes[.paragraphStyle] = paragraph
    return attributes
  }

  private func applyStyleIfNeeded() {
    // Replacing attributes while Japanese input is still marked can interrupt conversion.
    guard appliedStyle != style, markedTextRange == nil else { return }
    appliedStyle = style
    let attributes = entryAttributes()
    textStorage.setAttributes(attributes, range: NSRange(location: 0, length: textStorage.length))
    typingAttributes = attributes
  }
}

private final class OutlinedTextLayoutManager: NSLayoutManager {
  private var drawsOutline = false

  override func drawGlyphs(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
    let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
    var hasOutline = false
    textStorage?.enumerateAttribute(.strokeWidth, in: characters) { value, _, stop in
      if let width = value as? Double, width < 0 {
        hasOutline = true
        stop.pointee = true
      }
    }
    if hasOutline {
      // Draw every outline before any fill so strokes cannot cover adjacent font runs.
      drawsOutline = true
      super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
      drawsOutline = false
    }
    super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
  }

  override func showCGGlyphs(
    _ glyphs: UnsafePointer<CGGlyph>, positions: UnsafePointer<CGPoint>, count glyphCount: Int,
    font: UIFont, textMatrix: CGAffineTransform, attributes: [NSAttributedString.Key: Any],
    in context: CGContext
  ) {
    guard let width = attributes[.strokeWidth] as? Double, width < 0 else {
      guard !drawsOutline else { return }
      super.showCGGlyphs(
        glyphs, positions: positions, count: glyphCount, font: font, textMatrix: textMatrix,
        attributes: attributes, in: context)
      return
    }

    context.saveGState()
    context.setTextDrawingMode(drawsOutline ? .stroke : .fill)
    super.showCGGlyphs(
      glyphs, positions: positions, count: glyphCount, font: font, textMatrix: textMatrix,
      attributes: attributes, in: context)
    context.restoreGState()
  }
}
