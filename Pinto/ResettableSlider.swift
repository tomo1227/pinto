import SwiftUI

struct ResettableSlider: UIViewRepresentable {
  let title: String
  @Binding var value: Double
  let range: ClosedRange<Double>
  let onReset: () -> Void

  func makeUIView(context: Context) -> ResettableSliderView {
    ResettableSliderView(frame: .zero)
  }

  func updateUIView(_ view: ResettableSliderView, context: Context) {
    let slider = view.slider
    slider.accessibilityLabel = title
    slider.minimumValue = Float(range.lowerBound)
    slider.maximumValue = Float(range.upperBound)
    slider.onReset = onReset
    let binding = $value
    slider.onValueChange = { binding.wrappedValue = $0 }
    let next = Float(value)
    if slider.value != next && (!slider.isTracking || slider.value.rounded() != next) {
      slider.setValue(next, animated: false)
    }
  }
}

final class ResettableSliderView: UIView, UIGestureRecognizerDelegate {
  let slider = ResettableSliderControl(frame: .zero)

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(slider)
    slider.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    slider.frame = bounds
    // Observe taps above UISlider so its own tracking gestures do not consume them first.
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(resetFromDoubleTap))
    doubleTap.numberOfTapsRequired = 2
    doubleTap.delegate = self
    addGestureRecognizer(doubleTap)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    slider.thumbContains(touch.location(in: slider))
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    otherGestureRecognizer.view?.isDescendant(of: self) == true
  }

  @objc private func resetFromDoubleTap() {
    // Let UISlider finish cancelling its tracking before writing the default.
    Task { @MainActor [weak self] in
      self?.slider.onReset?()
    }
  }
}

final class ResettableSliderControl: UISlider {
  var onValueChange: ((Double) -> Void)?
  var onReset: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    addTarget(self, action: #selector(valueChanged), for: .valueChanged)
    accessibilityCustomActions = [
      UIAccessibilityCustomAction(
        name: "初期値に戻す", target: self, selector: #selector(resetValue))
    ]
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func accessibilityIncrement() { adjustAccessibilityValue(by: 1) }

  override func accessibilityDecrement() { adjustAccessibilityValue(by: -1) }

  private func adjustAccessibilityValue(by step: Float) {
    let next = min(maximumValue, max(minimumValue, value.rounded() + step))
    guard next != value else { return }
    setValue(next, animated: true)
    valueChanged()
  }

  func thumbContains(_ point: CGPoint) -> Bool {
    thumbRect(forBounds: bounds, trackRect: trackRect(forBounds: bounds), value: value)
      .contains(point)
  }

  @objc private func valueChanged() {
    onValueChange?(Double(value.rounded()))
  }

  @objc private func resetValue() -> Bool {
    guard let onReset else { return false }
    onReset()
    return true
  }
}
