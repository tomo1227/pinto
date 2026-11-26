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
        HStack(spacing: 8) {
          ForEach(WallCatalog.colors, id: \.self) { hex in
            Button {
              onSelect(hex)
            } label: {
              Circle().fill(Color(uiColor: UIColor(hex: hex)))
                .frame(width: 26, height: 26)
                .overlay(Circle().strokeBorder(.gray, lineWidth: 0.5))
                .overlay(
                  Circle().stroke(selectedColor == hex ? Color.accentColor : .clear, lineWidth: 2))
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
