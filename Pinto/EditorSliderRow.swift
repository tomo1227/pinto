import SwiftUI

struct EditorSliderRow: View {
  let title: String
  let range: ClosedRange<Double>
  let onReset: () -> Void
  @Binding var value: Double

  init(
    title: String, value: Binding<Double>, range: ClosedRange<Double>, onReset: @escaping () -> Void
  ) {
    self.title = title
    self._value = value
    self.range = range
    self.onReset = onReset
  }

  var body: some View {
    HStack(spacing: 8) {
      EditorControlLabel(title: title)
      ResettableSlider(title: title, value: $value, range: range, onReset: onReset)
        .frame(maxWidth: .infinity)
        .frame(height: 32)
      Text("000")
        .monospacedDigit()
        .fixedSize()
        .hidden()
        .overlay(alignment: .trailing) {
          Text("\(Int(value))")
            .monospacedDigit()
            .foregroundStyle(.secondary)
        }
        .accessibilityHidden(true)
    }
  }
}
