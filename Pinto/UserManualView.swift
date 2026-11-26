import SwiftUI

@MainActor
struct UserManualView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var outline: [UserManual.Entry] = []
  @State private var expandedHeadings: Set<Int> = []
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Group {
        if let error {
          ContentUnavailableView(
            "マニュアルを開けません", systemImage: "exclamationmark.triangle",
            description: Text(error))
        } else if outline.isEmpty {
          ProgressView()
        } else {
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
              ForEach(outline) { entry in
                UserManualEntryView(entry: entry, expandedHeadings: $expandedHeadings)
              }
            }
            .padding(20)
          }
        }
      }
      .navigationTitle("ユーザーマニュアル")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("閉じる") { dismiss() }
        }
      }
      .task {
        do {
          outline = UserManual.outline(from: try UserManual.load())
        } catch {
          self.error = error.localizedDescription
        }
      }
    }
  }
}
