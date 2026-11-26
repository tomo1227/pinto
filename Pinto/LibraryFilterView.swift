import SwiftUI

@MainActor
struct LibraryFilterView: View {
  @State var draft: LibraryFilters
  var onApply: (LibraryFilters) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section("グレード") {
          Picker("日本グレード", selection: $draft.japaneseGrade) {
            Text("すべて").tag("")
            ForEach(WallCatalog.japaneseGrades, id: \.self) { Text($0).tag($0) }
          }
          Picker("Vグレード", selection: $draft.vGrade) {
            Text("すべて").tag("")
            ForEach(WallCatalog.vGrades, id: \.self) { Text($0).tag($0) }
          }
          Button("条件をリセット") { draft = LibraryFilters() }
            .disabled(!draft.isActive)
        }
        ForEach(WallCatalog.tagGroups, id: \.0) { group in
          Section(group.0) {
            ForEach(group.1, id: \.self) { tag in
              Toggle(
                tag,
                isOn: Binding(
                  get: { draft.tags.contains(tag) },
                  set: { selected in
                    if selected { draft.tags.insert(tag) } else { draft.tags.remove(tag) }
                  }
                ))
            }
          }
        }
      }
      .navigationTitle("絞り込み").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("適用") {
            onApply(draft)
            dismiss()
          }
        }
      }
    }
  }
}
