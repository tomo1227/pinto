import SwiftUI
import UIKit

@MainActor
struct WallCanvas: UIViewRepresentable {
  @ObservedObject var model: EditorModel

  func makeUIView(context: Context) -> CanvasView { CanvasView(model: model) }

  func updateUIView(_ view: CanvasView, context: Context) {
    view.refresh()
  }
}

@MainActor
final class CanvasView: UIView, UIGestureRecognizerDelegate {
  enum ResizeHandle: CaseIterable {
    case nw, n, ne, e, se, s, sw, w

    var direction: CGPoint {
      switch self {
      case .nw: return CGPoint(x: -1, y: -1)
      case .n: return CGPoint(x: 0, y: -1)
      case .ne: return CGPoint(x: 1, y: -1)
      case .e: return CGPoint(x: 1, y: 0)
      case .se: return CGPoint(x: 1, y: 1)
      case .s: return CGPoint(x: 0, y: 1)
      case .sw: return CGPoint(x: -1, y: 1)
      case .w: return CGPoint(x: -1, y: 0)
      }
    }

    func position(in frame: CGRect) -> CGPoint {
      CGPoint(
        x: frame.midX + direction.x * frame.width / 2,
        y: frame.midY + direction.y * frame.height / 2)
    }

    static func hit(
      at point: CGPoint, in frame: CGRect,
      handles: [ResizeHandle] = allCases
    ) -> ResizeHandle? {
      let nearest = handles.min {
        let first = $0.position(in: frame)
        let second = $1.position(in: frame)
        return hypot(point.x - first.x, point.y - first.y)
          < hypot(point.x - second.x, point.y - second.y)
      }
      guard let nearest else { return nil }
      let position = nearest.position(in: frame)
      return hypot(point.x - position.x, point.y - position.y) <= 22 ? nearest : nil
    }

    func scale(translation: CGPoint, size: CGSize, isText: Bool) -> CGSize {
      let factor = isText ? 1.0 : 2.0
      return CGSize(
        width: max(0.1, 1 + translation.x * direction.x * factor / max(1, size.width)),
        height: max(0.1, 1 + translation.y * direction.y * factor / max(1, size.height)))
    }
  }

  private let model: EditorModel
  private var zoom: CGFloat = 1
  private var offset = CGPoint.zero
  private var lastRevision = 0
  private var gestureOriginal: WallContent?
  private var dragOrigin = CGPoint.zero
  private var positionOrigin = WallPoint(x: 0, y: 0)
  private var resizeHandle: ResizeHandle?
  private var movingViewport = false
  private var resizeBase = CGSize.zero
  private var pinchResizes = false
  private var viewportPan: UIPanGestureRecognizer?
  private var trashDrag: UILongPressGestureRecognizer?
  private let resetViewportButton = UIButton(type: .system)
  private let trashTarget = UIImageView(image: UIImage(systemName: "trash.fill"))
  private var trashDragStart: CGPoint?
  private var trashHovered = false

  init(model: EditorModel) {
    self.model = model
    super.init(frame: .zero)
    backgroundColor = UIColor(hex: "#E9E8E1")
    contentMode = .redraw
    clipsToBounds = true
    isMultipleTouchEnabled = true
    accessibilityLabel = "課題の編集キャンバス"
    accessibilityHint =
      "タップして配置。ドラッグして移動。選択枠の四角い点をドラッグしてサイズ変更。選択物を長押ししてゴミ箱へドラッグすると削除。選択中は2本指でもサイズ変更。キャンバスを2本指で移動・拡大。"
    var resetConfiguration = UIButton.Configuration.filled()
    resetConfiguration.image = UIImage(systemName: "arrow.counterclockwise")
    resetConfiguration.cornerStyle = .capsule
    resetConfiguration.baseBackgroundColor = .secondarySystemBackground
    resetConfiguration.baseForegroundColor = .label
    resetViewportButton.configuration = resetConfiguration
    resetViewportButton.accessibilityLabel = "画像を元の位置に戻す"
    resetViewportButton.accessibilityHint = "表示位置と拡大率を初期状態に戻します"
    resetViewportButton.accessibilityIdentifier = "canvasResetViewport"
    resetViewportButton.addTarget(self, action: #selector(resetViewport), for: .touchUpInside)
    addSubview(resetViewportButton)
    trashTarget.contentMode = .center
    trashTarget.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
      pointSize: 28, weight: .semibold)
    trashTarget.tintColor = .systemRed
    trashTarget.backgroundColor = .secondarySystemBackground
    trashTarget.layer.cornerRadius = 32
    trashTarget.layer.borderColor = UIColor.systemRed.cgColor
    trashTarget.layer.borderWidth = 2
    trashTarget.isHidden = true
    trashTarget.isAccessibilityElement = true
    trashTarget.accessibilityLabel = "ここにドラッグして離すと削除"
    trashTarget.accessibilityIdentifier = "canvasTrashTarget"
    addSubview(trashTarget)
    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
    let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
    pan.maximumNumberOfTouches = 1
    let longPress = UILongPressGestureRecognizer(target: self, action: #selector(trashDragged(_:)))
    longPress.minimumPressDuration = 0.5
    trashDrag = longPress
    tap.require(toFail: longPress)
    pan.require(toFail: longPress)
    let twoFingerPan = UIPanGestureRecognizer(target: self, action: #selector(viewportPanned(_:)))
    twoFingerPan.minimumNumberOfTouches = 2
    twoFingerPan.maximumNumberOfTouches = 2
    viewportPan = twoFingerPan
    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:)))
    let gestures: [UIGestureRecognizer] = [tap, pan, twoFingerPan, pinch, longPress]
    for gesture in gestures {
      gesture.delegate = self
      addGestureRecognizer(gesture)
    }
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func layoutSubviews() {
    super.layoutSubviews()
    let buttonSize: CGFloat = 44
    let inset: CGFloat = 8
    resetViewportButton.frame = CGRect(
      x: max(bounds.minX, bounds.maxX - buttonSize - inset),
      y: max(bounds.minY, bounds.maxY - buttonSize - inset),
      width: buttonSize, height: buttonSize)
    trashTarget.bounds = CGRect(x: 0, y: 0, width: 64, height: 64)
    trashTarget.center = CGPoint(x: bounds.midX, y: max(32, bounds.maxY - 56))
  }

  func refresh() {
    if lastRevision != model.viewportRevision {
      zoom = 1
      offset = .zero
      lastRevision = model.viewportRevision
    }
    setNeedsDisplay()
  }

  @objc private func resetViewport() {
    model.resetViewport()
    refresh()
  }

  private var imageRect: CGRect {
    let size = model.image.size
    let scale = min(bounds.width / size.width, bounds.height / size.height) * zoom
    let width = size.width * scale
    let height = size.height * scale
    return CGRect(
      x: (bounds.width - width) / 2 + offset.x,
      y: (bounds.height - height) / 2 + offset.y, width: width, height: height)
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext(), imageRect.width > 0 else { return }
    let imageFrame = imageRect
    context.saveGState()
    context.translateBy(x: imageFrame.minX, y: imageFrame.minY)
    SceneRenderer.draw(
      image: model.image, content: model.content,
      size: imageFrame.size, context: context)
    context.restoreGState()
    if let frame = selectionRect() {
      UIColor.systemBlue.setStroke()
      let selectionFrame = frame.insetBy(dx: -5, dy: -5)
      let path = UIBezierPath(rect: selectionFrame)
      path.lineWidth = 1
      path.stroke()
      for handle in resizeHandles {
        let point = handle.position(in: selectionFrame)
        let handlePath = UIBezierPath(
          rect: CGRect(
            x: point.x - 4, y: point.y - 4,
            width: 8, height: 8))
        UIColor.white.setFill()
        handlePath.fill()
        handlePath.lineWidth = 1
        handlePath.stroke()
      }
    }
  }

  private var resizeHandles: [ResizeHandle] {
    guard model.tool == .hold || model.tool == .text else { return [] }
    switch model.selection {
    case .hold: return ResizeHandle.allCases
    case .text: return [.nw, .ne, .se, .sw]
    case nil: return []
    }
  }

  func resizeHandle(at point: CGPoint) -> ResizeHandle? {
    guard let frame = selectionRect()?.insetBy(dx: -5, dy: -5) else { return nil }
    return ResizeHandle.hit(at: point, in: frame, handles: resizeHandles)
  }

  private func local(_ point: CGPoint) -> CGPoint {
    CGPoint(x: point.x - imageRect.minX, y: point.y - imageRect.minY)
  }

  private func normalized(_ point: CGPoint) -> WallPoint {
    let point = local(point)
    return WallPoint(x: point.x / imageRect.width, y: point.y / imageRect.height).clamped()
  }

  private func selectionRect() -> CGRect? {
    let rect: CGRect?
    switch model.selection {
    case .hold(let id):
      rect = model.content.holds.first(where: { $0.id == id }).map {
        SceneRenderer.holdRect($0, content: model.content, size: imageRect.size)
      }
    case .text(let id):
      rect = model.content.texts.first(where: { $0.id == id }).map {
        SceneRenderer.textRect($0, size: imageRect.size)
      }
    case nil: rect = nil
    }
    return rect?.offsetBy(dx: imageRect.minX, dy: imageRect.minY)
  }

  private func hit(_ point: CGPoint) -> EditorSelection? {
    let p = local(point)
    let size = imageRect.size
    for text in model.content.texts.reversed() {
      if SceneRenderer.textRect(text, size: size).insetBy(dx: -8, dy: -8).contains(p) {
        return .text(text.id)
      }
    }
    for hold in model.content.holds.reversed() {
      if SceneRenderer.holdPath(hold, content: model.content, size: size, padding: 8).contains(p) {
        return .hold(hold.id)
      }
    }
    return nil
  }

  @objc private func tapped(_ gesture: UITapGestureRecognizer) {
    let point = gesture.location(in: self)
    guard imageRect.contains(point) else {
      model.selection = nil
      return
    }
    let target = hit(point)
    switch model.tool {
    case .pan: model.selection = nil
    case .eraser:
      model.selection = target
      model.removeSelection()
    case .route:
      if case .hold(let id) = target { model.appendToRoute(id) }
    case .hold:
      if let target { model.selection = target } else { model.addHold(at: normalized(point)) }
    case .text:
      if case .text(let id) = target,
        let text = model.content.texts.first(where: { $0.id == id })
      {
        model.selection = target
        model.promptText(at: text.position, id: id)
      } else {
        model.selection = nil
        model.promptText(at: normalized(point))
      }
    }
    setNeedsDisplay()
  }

  @objc private func trashDragged(_ gesture: UILongPressGestureRecognizer) {
    let point = gesture.location(in: self)
    switch gesture.state {
    case .began:
      guard beginTrashDrag(at: point) else { return }
    case .changed:
      updateTrashDrag(at: point)
    case .ended:
      guard trashDragStart != nil else { return }
      updateTrashDrag(at: point)
      if trashHovered {
        model.cancelGesture()
        model.removeSelection()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      } else {
        model.endGesture()
      }
      hideTrashTarget()
    case .cancelled, .failed:
      guard trashDragStart != nil else { return }
      model.cancelGesture()
      hideTrashTarget()
    default: break
    }
    setNeedsDisplay()
  }

  private func beginTrashDrag(at point: CGPoint) -> Bool {
    guard model.tool == .hold || model.tool == .text, model.selection != nil,
      resizeHandle(at: point) == nil,
      hit(point) == model.selection, let frame = selectionRect(),
      let position = selectionPosition()
    else { return false }
    positionOrigin = position
    guard frame.width > 0, imageRect.width > 0, imageRect.height > 0 else { return false }
    model.beginGesture()
    trashDragStart = point
    trashTarget.isHidden = false
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    updateTrashDrag(at: point)
    return true
  }

  private func selectionPosition() -> WallPoint? {
    switch model.selection {
    case .hold(let id):
      return model.content.holds.first(where: { $0.id == id })?.position
    case .text(let id):
      return model.content.texts.first(where: { $0.id == id })?.position
    case nil:
      return nil
    }
  }

  private func updateTrashDrag(at point: CGPoint) {
    guard let start = trashDragStart else { return }
    model.moveSelection(
      to: WallPoint(
        x: positionOrigin.x + (point.x - start.x) / imageRect.width,
        y: positionOrigin.y + (point.y - start.y) / imageRect.height
      ))
    let dropArea = CGRect(
      x: trashTarget.center.x - 44, y: trashTarget.center.y - 44, width: 88, height: 88)
    let hovered = hypot(point.x - start.x, point.y - start.y) > 12 && dropArea.contains(point)
    if hovered != trashHovered {
      trashHovered = hovered
      trashTarget.backgroundColor = hovered ? .systemRed : .secondarySystemBackground
      trashTarget.tintColor = hovered ? .white : .systemRed
      trashTarget.transform = hovered ? CGAffineTransform(scaleX: 1.15, y: 1.15) : .identity
      if hovered { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }
  }

  private func hideTrashTarget() {
    trashDragStart = nil
    trashHovered = false
    trashTarget.isHidden = true
    trashTarget.transform = .identity
    trashTarget.backgroundColor = .secondarySystemBackground
    trashTarget.tintColor = .systemRed
  }

  @objc private func panned(_ gesture: UIPanGestureRecognizer) {
    let translation = gesture.translation(in: self)
    switch gesture.state {
    case .began:
      let location = gesture.location(in: self)
      let start = CGPoint(x: location.x - translation.x, y: location.y - translation.y)
      guard beginPan(at: start) else { return }
    case .changed:
      updatePan(translation: translation)
    case .ended:
      if gestureOriginal != nil { model.endGesture() }
      gestureOriginal = nil
      resizeHandle = nil
    case .cancelled, .failed:
      if gestureOriginal != nil { model.cancelGesture() }
      gestureOriginal = nil
      resizeHandle = nil
    default: break
    }
    setNeedsDisplay()
  }

  private func beginPan(at start: CGPoint) -> Bool {
    movingViewport = model.tool == .pan
    dragOrigin = offset
    guard !movingViewport else { return false }
    resizeHandle = resizeHandle(at: start)
    if resizeHandle == nil { model.selection = hit(start) }
    guard model.selection != nil, model.tool == .hold || model.tool == .text else { return false }
    gestureOriginal = model.content
    model.beginGesture()
    if let frame = selectionRect() { resizeBase = frame.size }
    guard let position = selectionPosition() else { return false }
    positionOrigin = position
    return true
  }

  private func updatePan(translation: CGPoint) {
    if movingViewport {
      offset = CGPoint(x: dragOrigin.x + translation.x, y: dragOrigin.y + translation.y)
      return
    }
    guard let original = gestureOriginal else { return }
    if let handle = resizeHandle {
      let scale = selectionResizeScale(for: handle, translation: translation)
      model.resizeSelection(x: scale.width, y: scale.height, from: original)
    } else {
      model.moveSelection(
        to: WallPoint(
          x: positionOrigin.x + translation.x / imageRect.width,
          y: positionOrigin.y + translation.y / imageRect.height))
    }
  }

  private func selectionResizeScale(for handle: ResizeHandle, translation: CGPoint) -> CGSize {
    let direction = handle.direction
    let scale = handle.scale(
      translation: translation, size: resizeBase, isText: model.editingText)
    guard let hold = model.selectedHold, model.content.locksHoldAspectRatio(hold) else {
      return scale
    }
    let uniformScale =
      direction.x == 0
      ? scale.height
      : direction.y == 0 ? scale.width : max(scale.width, scale.height)
    return CGSize(width: uniformScale, height: uniformScale)
  }

  @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
    switch gesture.state {
    case .began:
      pinchResizes = shouldResize(with: gesture)
      if pinchResizes {
        gestureOriginal = model.content
        model.beginGesture()
      }
    case .changed:
      if pinchResizes, let original = gestureOriginal {
        model.resizeSelection(x: gesture.scale, y: gesture.scale, from: original)
      } else {
        let oldRect = imageRect
        let anchor = gesture.location(in: self)
        let nextZoom = min(8, max(0.5, zoom * gesture.scale))
        let ratio = nextZoom / zoom
        offset.x =
          anchor.x - bounds.midX - (anchor.x - oldRect.minX) * ratio + oldRect.width * ratio / 2
        offset.y =
          anchor.y - bounds.midY - (anchor.y - oldRect.minY) * ratio + oldRect.height * ratio / 2
        zoom = nextZoom
        gesture.scale = 1
      }
    case .ended:
      if pinchResizes { model.endGesture() }
      gestureOriginal = nil
      pinchResizes = false
    case .cancelled, .failed:
      if pinchResizes { model.cancelGesture() }
      gestureOriginal = nil
      pinchResizes = false
    default: break
    }
    setNeedsDisplay()
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    let viewportPair =
      (gestureRecognizer === viewportPan && otherGestureRecognizer is UIPinchGestureRecognizer)
      || (otherGestureRecognizer === viewportPan && gestureRecognizer is UIPinchGestureRecognizer)
    guard viewportPair else { return false }
    let pinch =
      (gestureRecognizer as? UIPinchGestureRecognizer)
      ?? (otherGestureRecognizer as? UIPinchGestureRecognizer)
    return pinch.map { !shouldResize(with: $0) } ?? false
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    if touch.view?.isDescendant(of: resetViewportButton) == true { return false }
    guard gestureRecognizer === trashDrag else { return true }
    let point = touch.location(in: self)
    return (model.tool == .hold || model.tool == .text) && model.selection != nil
      && resizeHandle(at: point) == nil && hit(point) == model.selection
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    if gestureRecognizer === viewportPan {
      return !shouldResize(at: gestureRecognizer.location(in: self))
    }
    return true
  }

  private func shouldResize(at point: CGPoint) -> Bool {
    (model.tool == .hold || model.tool == .text) && model.selection != nil
      && selectionRect()?.insetBy(dx: -20, dy: -20).contains(point) == true
  }

  private func shouldResize(with pinch: UIPinchGestureRecognizer) -> Bool {
    guard model.tool == .hold || model.tool == .text, model.selection != nil,
      let frame = selectionRect()?.insetBy(dx: -20, dy: -20)
    else { return false }
    if (0..<pinch.numberOfTouches).contains(where: {
      frame.contains(pinch.location(ofTouch: $0, in: self))
    }) {
      return true
    }
    return frame.contains(pinch.location(in: self))
  }

  @objc private func viewportPanned(_ gesture: UIPanGestureRecognizer) {
    guard gesture.state == .changed else { return }
    let translation = gesture.translation(in: self)
    offset.x += translation.x
    offset.y += translation.y
    gesture.setTranslation(.zero, in: self)
    setNeedsDisplay()
  }
}
