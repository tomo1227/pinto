import SwiftUI

@MainActor
struct EditorTextEntryOverlay<Controls: View>: View {
  let style: MarkStyle
  let cancelTextEntry: () -> Void
  let finishTextEntry: () -> Void
  @Binding var text: String
  @ViewBuilder let controls: Controls

  var body: some View {
    VStack(spacing: 12) {
      HStack {
        Button(action: cancelTextEntry) {
          Image(systemName: "xmark")
            .font(.headline)
            .foregroundStyle(.primary)
            .frame(width: 44, height: 44)
            .background(.regularMaterial, in: Circle())
        }
        .accessibilityLabel("テキスト編集をキャンセル")
        Spacer()
        Button(action: finishTextEntry) {
          Text("完了")
            .font(.headline)
            .foregroundStyle(.primary)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
        }
      }
      .padding(.horizontal, 20)

      Spacer(minLength: 0)
      StyledTextEntry(text: $text, style: style)
        .frame(minHeight: 52, idealHeight: 144, maxHeight: 144)
        .padding(.horizontal, 20)
      Spacer(minLength: 0)
      controls
        .background {
          RoundedRectangle(cornerRadius: 12)
            .fill(.regularMaterial)
            .padding(.horizontal, 20)
        }
    }
    .padding(.top, 16)
    .background { Color.black.opacity(0.76).ignoresSafeArea() }
    .preferredColorScheme(.dark)
  }
}
