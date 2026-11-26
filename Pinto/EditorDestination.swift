import SwiftUI

@MainActor
struct EditorDestination: View {
  @EnvironmentObject private var store: WallStore
  let id: UUID
  @State private var model: EditorModel?
  @State private var error: String?

  var body: some View {
    Group {
      if let model {
        EditorView(model: model)
      } else if let error {
        ContentUnavailableView(
          "編集画面を開けません", systemImage: "exclamationmark.triangle",
          description: Text(error))
      } else {
        ProgressView()
      }
    }
    .task {
      guard model == nil else { return }
      do {
        let document = try await store.document(for: id)
        let preview = try await WallImageWorker.shared.editorPreview(data: document.imageData)
        try Task.checkCancellation()
        model = try EditorModel(document: document, preview: preview)
      } catch is CancellationError {
      } catch {
        self.error = error.localizedDescription
      }
    }
  }
}
