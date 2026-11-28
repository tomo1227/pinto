import SwiftUI

@MainActor
struct EditorView: View {
  @StateObject var model: EditorModel
  @EnvironmentObject private var store: WallStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @State private var showSettings = false
  @State private var showReset = false
  @State private var showLeave = false
  @State private var leaveSaveError = ""
  @State private var status: String?
  @State private var isSavingImage = false
  @State private var shareSheet: ImageShareSheet?
  @State private var editorDockExpanded = true

  var body: some View {
    ZStack {
      WallCanvas(model: model)
        .overlay(alignment: .topLeading) {
          if let status {
            Text(status)
              .font(Theme.roundedBody(12))
              .foregroundStyle(Theme.shadowRock)
              .padding(.horizontal, 10)
              .padding(.vertical, 4)
              .background(Theme.tape)
              .rotationEffect(.degrees(-1.5))
              .clipShape(RoundedRectangle(cornerRadius: 2))
              .padding(8)
          }
        }
        .allowsHitTesting(!model.textPrompt)
      if model.textPrompt {
        EditorTextEntryOverlay(
          style: model.activeStyle, cancelTextEntry: cancelTextEntry,
          finishTextEntry: finishTextEntry, text: $model.textDraft
        ) {
          EditorToolControlsPanel(model: model, mode: .textEntry)
        }
      }
    }
    .background(Theme.wall)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !model.textPrompt {
        EditorDock(
          requestReset: requestReset, model: model, editorDockExpanded: $editorDockExpanded)
      }
    }
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden()
    .toolbar(model.textPrompt ? .hidden : .visible, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .principal) {
        Text(model.content.name)
          .lineLimit(1)
          .truncationMode(.middle)
          .foregroundStyle(.primary)
      }
      ToolbarItem(placement: .topBarLeading) {
        Button(action: leaveEditor) {
          Image(systemName: "chevron.left")
            .frame(width: 44, height: 44)
        }
        .disabled(isSavingImage)
        .accessibilityLabel("課題一覧に戻る")
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button {
          model.undo()
        } label: {
          Image(systemName: "arrow.uturn.backward")
        }
        .disabled(!model.canUndo).accessibilityLabel("元に戻す")
        Button {
          model.redo()
        } label: {
          Image(systemName: "arrow.uturn.forward")
        }
        .disabled(!model.canRedo).accessibilityLabel("やり直す")
        Button(action: saveToPhotos) {
          if isSavingImage {
            ProgressView()
          } else {
            Image(systemName: "square.and.arrow.down")
          }
        }
        .disabled(isSavingImage)
        .accessibilityLabel("画像を写真ライブラリに保存")
        Button(action: shareImage) {
          Image(systemName: "square.and.arrow.up")
        }
        .disabled(isSavingImage)
        .accessibilityLabel("画像を共有")
        Button {
          showSettings = true
        } label: {
          Image(systemName: "gearshape")
        }
        .accessibilityLabel("課題の設定")
      }
    }
    .sheet(isPresented: $showSettings) {
      WallSettingsView(content: model.content) { updated in
        model.change { $0 = updated }
      }
    }
    .sheet(item: $shareSheet) { $0 }
    .background {
      Color.clear
        .alert("編集をすべてリセットしますか？", isPresented: $showReset) {
          Button("全リセット", role: .destructive, action: resetEdits)

          Button("キャンセル", role: .cancel) {}
        } message: {
          Text("ホールド・文字・ルートをすべて削除します。\n壁の写真と設定は残ります。操作後は「元に戻す」で取り消せます。")
        }
        .tint(Color(uiColor: .label))
    }
    .confirmationDialog("未保存の編集があります", isPresented: $showLeave, titleVisibility: .visible) {
      Button("保存して戻る", action: leaveEditor)
      Button("変更を破棄して戻る", role: .destructive) { dismiss() }
      Button("編集を続ける", role: .cancel) {}
    } message: {
      Text("自動保存できませんでした。編集内容はこの画面に残っています。\n\(leaveSaveError)")
    }
    .alert(
      "処理できませんでした",
      isPresented: Binding(
        get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } }
      )
    ) {
      Button("閉じる", role: .cancel) {}
    } message: {
      Text(model.errorMessage ?? "")
    }
    .onChange(of: model.tool) { _, _ in model.selection = nil }
    .onChange(of: model.content) { _, _ in status = nil }
    .task(id: model.content) { await autosave() }
    .onChange(of: scenePhase) { _, phase in saveWhenInactive(phase) }
  }

  private func requestReset() { showReset = true }

  private func resetEdits() {
    model.change {
      $0.holds = []
      $0.texts = []
      $0.route = []
    }
    model.selection = nil
  }

  private func autosave() async {
    do {
      try await model.autosave(to: store)
    } catch is CancellationError {
    } catch {
      reportSaveFailure(error)
    }
  }

  private func saveWhenInactive(_ phase: ScenePhase) {
    if phase != .active, model.dirty { Task { await save() } }
  }

  private func leaveEditor() {
    Task { await saveAndDismiss() }
  }

  private func saveAndDismiss() async {
    do {
      while model.dirty { try await model.save(to: store) }
      dismiss()
    } catch {
      leaveSaveError = error.localizedDescription
      showLeave = true
    }
  }

  private func cancelTextEntry() {
    model.textPrompt = false
  }

  private func finishTextEntry() {
    model.commitText()
    model.textPrompt = false
  }

  @discardableResult
  private func save() async -> Bool {
    guard model.dirty else { return true }
    do {
      try await model.save(to: store)
      status = "端末内に保存しました"
      return true
    } catch {
      reportSaveFailure(error)
      return false
    }
  }

  private func reportSaveFailure(_ error: Error) {
    model.errorMessage = "保存できませんでした。編集内容はこの画面に残っています。\n\(error.localizedDescription)"
  }

  private func saveToPhotos() {
    guard !isSavingImage else { return }
    isSavingImage = true
    Task {
      defer { isSavingImage = false }
      guard await save() else { return }
      status = "写真ライブラリに保存中…"
      do {
        try await model.saveImageToPhotos()
        status = "写真ライブラリに画像を保存しました"
      } catch {
        status = nil
        model.errorMessage =
          "編集データは端末内に保存しましたが、写真ライブラリに画像を保存できませんでした。\n\(error.localizedDescription)"
      }

    }
  }

  private func shareImage() {
    guard !isSavingImage else { return }
    isSavingImage = true
    Task {
      defer { isSavingImage = false }
      do {
        let image = try await model.renderForSharing()
        shareSheet = ImageShareSheet(image: image, onError: reportShareFailure)
      } catch {
        reportShareFailure(error)
      }
    }
  }

  private func reportShareFailure(_ error: Error) {
    model.errorMessage = "画像を共有できませんでした。\n\(error.localizedDescription)"
  }
}
