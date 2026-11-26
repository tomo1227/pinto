import SwiftUI

struct EditorControlLabel: View {
  static let width: CGFloat = 104
  let title: String

  var body: some View {
    Text(title)
      .fixedSize(horizontal: false, vertical: true)
      .frame(width: Self.width, alignment: .leading)
  }
}
