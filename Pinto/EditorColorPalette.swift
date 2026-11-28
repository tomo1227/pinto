import SwiftUI

struct EditorColorPalette: View {
  let selectedColor: String
  let title: String?
  var accessibilityTitle: String?
  let onSelect: (String) -> Void

  var body: some View {
    HStack(spacing: 8) {
      if let title {
        EditorControlLabel(title: title)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 10) {
          ForEach(WallCatalog.colors, id: \.self) { hex in
            Button {
              onSelect(hex)
            } label: {
              Circle().fill(Color(uiColor: UIColor(hex: hex)))
                .frame(width: 28, height: 28)
                .overlay(Circle().strokeBorder(Theme.shadowRock.opacity(0.2), lineWidth: 0.5))
                .overlay(
                  Circle().stroke(selectedColor == hex ? Theme.chalk : .clear, lineWidth: 2)
                )
                .padding(2)
                .background(
                  Circle().stroke(selectedColor == hex ? Theme.accentBlue : .clear, lineWidth: 2)
                )
            }
            .accessibilityLabel(
              (accessibilityTitle ?? title).map { "\($0): \(colorLabel(hex))" } ?? colorLabel(hex)
            )
            .accessibilityAddTraits(selectedColor == hex ? .isSelected : [])
          }
        }
        .padding(2)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
  }

  private func colorLabel(_ hex: String) -> String {
    let names = ["黒", "白", "赤", "オレンジ", "黄", "緑", "青", "紫"]
    return names[WallCatalog.colors.firstIndex(of: hex) ?? 0]
  }
}
