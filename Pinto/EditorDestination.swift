import SwiftUI

@MainActor
struct EditorDestination: View {
  private enum LoadState {
    case loading
    case loaded(EditorModel)
    case failed(String)
  }

  @EnvironmentObject private var store: WallStore
  let id: UUID
  @State private var state = LoadState.loading

  var body: some View {
    Group {
      switch state {
      case .loaded(let model):
        EditorView(model: model)
      case .failed(let error):
        ContentUnavailableView(
          "編集画面を開けません", systemImage: "exclamationmark.triangle",
          description: Text(error))
      case .loading:
        ProgressView()
      }
    }
    .task { await load() }
  }

  private func load() async {
    if case .loaded = state { return }
    do {
      let document = try await store.document(for: id)
      let preview = try await WallImageWorker.shared.editorPreview(data: document.imageData)
      try Task.checkCancellation()
      state = .loaded(try EditorModel(document: document, preview: preview))
    } catch is CancellationError {
    } catch {
      state = .failed(error.localizedDescription)
    }
  }
}
