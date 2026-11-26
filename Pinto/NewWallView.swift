import AVFoundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct NewWallView: View {
  var onCreate: (WallDocument) async throws -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var images: (original: UIImage, preview: UIImage)?
  @State private var photo: PhotosPickerItem?
  @State private var selectedFile: URL?
  @State private var importing = false
  @State private var camera = false
  @State private var busy = false
  @State private var errorMessage: String?

  var body: some View {
    NavigationStack {
      Form {
        Section("課題の名前") { TextField("例: 11月の課題・赤の3級", text: $name) }
        Section("壁の写真") {
          if let images {
            Image(uiImage: images.preview).resizable().scaledToFit().frame(maxHeight: 300)
          }
          PhotosPicker(selection: $photo, matching: .images, photoLibrary: .shared()) {
            Label("写真から選択", systemImage: "photo.on.rectangle")
          }
          Button("ファイルから選択", systemImage: "folder") { importing = true }
          if UIImagePickerController.isSourceTypeAvailable(.camera) {
            Button("カメラで撮影", systemImage: "camera") {
              Task {
                if await AVCaptureDevice.requestAccess(for: .video) {
                  camera = true
                } else {
                  errorMessage = "カメラへのアクセスが許可されていません。「設定」アプリから許可してください。"
                }
              }
            }
          }
        }
        .disabled(busy)
        Section {
          Text("ログイン・通信は不要です。写真と編集データはこの端末に保存されます。アプリを削除するとデータも消えるため、必要な画像はPNGで書き出してください。")
            .font(.footnote).foregroundStyle(.secondary)
        }
        if busy { ProgressView("画像を読み込み中…") }
      }
      .navigationTitle("課題を登録").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("登録") { Task { await create() } }
            .disabled(
              images == nil || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
        }
      }
      .interactiveDismissDisabled(busy)
      .onChange(of: photo) { _, selected in
        Task {
          busy = true
          defer { busy = false }
          do {
            guard let selected else { return }
            guard let data = try await selected.loadTransferable(type: Data.self) else {
              throw PintoError.invalidImage
            }
            images = try await WallImageWorker.shared.registrationImages(data: data)
          } catch { errorMessage = error.localizedDescription }
        }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.image]) { result in
        do {
          let url = try result.get()
          busy = true
          selectedFile = url
        } catch { errorMessage = error.localizedDescription }
      }
      .task(id: selectedFile) {
        guard let selectedFile else { return }
        await importFile(selectedFile)
      }
      .fullScreenCover(isPresented: $camera) {
        CameraPicker { result in
          camera = false
          switch result {
          case .success(let image): images = (image, image)
          case .failure(let error): errorMessage = error.localizedDescription
          }
        } onCancel: {
          camera = false
        }
        .ignoresSafeArea()
      }
      .alert(
        "登録できませんでした",
        isPresented: Binding(
          get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )
      ) {
        Button("閉じる", role: .cancel) {}
      } message: {
        Text(errorMessage ?? "")
      }
    }
  }

  private func importFile(_ url: URL) async {
    defer {
      busy = false
      selectedFile = nil
    }
    do {
      let imported = try await WallImageWorker.shared.importFile(url)
      try Task.checkCancellation()
      images = imported
    } catch is CancellationError {
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func create() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      guard let images else { throw PintoError.invalidImage }
      let document = WallDocument(
        imageData: try await WallImageWorker.shared.normalize(images.original),
        content: WallContent(name: name.trimmingCharacters(in: .whitespacesAndNewlines)))
      try await onCreate(document)
      dismiss()
    } catch { errorMessage = error.localizedDescription }
  }
}
