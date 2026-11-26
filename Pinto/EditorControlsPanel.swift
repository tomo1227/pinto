import SwiftUI

struct EditorControlsPanel<HoldControls: View, Content: View>: View {
  var contentInset: CGFloat = 0
  @ViewBuilder let holdControls: HoldControls
  @ViewBuilder let content: Content

  var body: some View {
    HoldControlsPanelLayout {
      paddedControls(holdControls)
        .hidden()
        .accessibilityHidden(true)
      GeometryReader { viewport in
        ScrollView(.vertical, showsIndicators: false) {
          paddedControls(content)
            .frame(minHeight: viewport.size.height, alignment: .bottom)
        }
        .scrollBounceBehavior(.basedOnSize)
        .padding(.horizontal, contentInset)
      }
    }
  }

  private func paddedControls(_ controls: some View) -> some View {
    controls
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
  }
}

private struct HoldControlsPanelLayout: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    // Measure the hold controls without a vertical constraint, regardless of the active tool.
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let holdSize = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
    return CGSize(
      width: width ?? holdSize.width,
      height: min(holdSize.height, proposal.height ?? .infinity, 240))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews[1].place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
  }
}
