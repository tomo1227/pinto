import AVFoundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct LibraryView: View {
  @EnvironmentObject private var store: WallStore
  @State private var path: [UUID] = []
  @State private var registering = false
  @State private var showingManual = false
  @State private var showingFilters = false
  @State private var search = ""
  @State private var filters = LibraryFilters()
  @AppStorage("libraryGrid") private var grid = true
  @State private var selectedIDs: Set<UUID>?
  @State private var pendingDeletion: Set<UUID> = []

  var body: some View {
    let filtered = store.walls.filter { filters.matches($0.content, search: search) }
    NavigationStack(path: $path) {
      Group {
        if !grid, store.ready, !filtered.isEmpty {
          List(filtered) { document in
            wallItem(document)
              .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if selectedIDs == nil {
                  // This only opens the alert; a destructive swipe action animates row removal.
                  Button("削除", systemImage: "trash") {
                    pendingDeletion = [document.id]
                  }
                  .tint(.red)
                }
              }
              .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 16, trailing: 16))
              .listRowSeparator(.hidden)
              .listRowBackground(Color.clear)
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .contentMargins(.top, 16, for: .scrollContent)
        } else {
          libraryGrid(filtered)
        }
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle(selectedIDs.map { "\($0.count)件選択中" } ?? "")
      .navigationBarTitleDisplayMode(.inline)
      .searchable(text: $search, prompt: "課題名・グレード・タグ")
      .onChange(of: filtered.map(\.id)) { _, visibleIDs in
        selectedIDs?.formIntersection(visibleIDs)
      }
      .toolbar {
        if let selectedIDs {
          ToolbarItem(placement: .topBarLeading) {
            Button("キャンセル") { self.selectedIDs = nil }
          }
          ToolbarItem(placement: .topBarTrailing) {
            Button("選択した課題を削除", systemImage: "trash", role: .destructive) {
              pendingDeletion = selectedIDs
            }
            .labelStyle(.iconOnly)
            .tint(.red)
            .disabled(selectedIDs.isEmpty)
          }
        } else {
          ToolbarItem(placement: .topBarLeading) {
            Button {
              grid.toggle()
            } label: {
              Image(systemName: grid ? "list.bullet" : "square.grid.2x2")
            }
            .accessibilityLabel(grid ? "リスト表示" : "グリッド表示")
          }
          ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
              showingFilters = true
            } label: {
              Image(systemName: "line.3.horizontal.decrease.circle")
                .symbolVariant(filters.isActive ? .fill : .none)
            }
            .accessibilityLabel("絞り込み")
            .accessibilityValue(filters.isActive ? "適用中" : "なし")
            .disabled(!store.ready)
            Button {
              showingManual = true
            } label: {
              Image(systemName: "questionmark.circle")
            }
            .accessibilityLabel("ユーザーマニュアル")
            Button {
              registering = true
            } label: {
              Image(systemName: "plus")
            }
            .disabled(!store.ready).accessibilityLabel("課題を登録")
          }
        }
      }
      .navigationDestination(for: UUID.self) { id in
        if let document = store.walls.first(where: { $0.id == id }) {
          EditorDestination(id: document.id)
        } else {
          ContentUnavailableView("課題が見つかりません", systemImage: "photo")
        }
      }
      .sheet(isPresented: $registering) {
        NewWallView { document in
          try await store.save(document)
          path.append(document.id)
        }
      }
      .sheet(isPresented: $showingManual) {
        UserManualView()
      }
      .sheet(isPresented: $showingFilters) {
        LibraryFilterView(draft: filters) { filters = $0 }
      }
      .alert(
        "削除しますか？",
        isPresented: Binding(
          get: { !pendingDeletion.isEmpty }, set: { if !$0 { pendingDeletion = [] } }
        ),
        presenting: pendingDeletion
      ) { ids in
        Button("キャンセル", role: .cancel) {}
        Button("削除する", role: .destructive) {
          Task { await delete(ids) }
        }
      } message: { ids in
        deletionMessage(for: ids)
      }
      .alert(
        "読み込み・保存エラー",
        isPresented: Binding(
          get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } }
        )
      ) {
        Button("閉じる", role: .cancel) {}
      } message: {
        Text(store.errorMessage ?? "")
      }
    }
    .tint(Color(uiColor: UIColor(hex: "#2F7A68")))
    .task { if !store.ready { await store.load() } }
  }

  private func libraryGrid(_ filtered: [WallMetadata]) -> some View {
    ScrollView {
      if store.loading {
        ProgressView("課題を読み込み中…")
      } else if !store.ready {
        ContentUnavailableView {
          Label("保存先を開けません", systemImage: "externaldrive.badge.exclamationmark")
        } description: {
          Text("端末の空き容量と保存先を確認して、再読み込みしてください。")
        } actions: {
          Button("再読み込み") { Task { await store.load() } }
        }
      } else if store.walls.isEmpty {
        ContentUnavailableView {
          Label("ボルタリングの課題を登録しよう", systemImage: "photo.badge.plus")
        } actions: {
          Button("課題を登録") { registering = true }
        }
      } else if filtered.isEmpty {
        if filters.isActive {
          ContentUnavailableView {
            Label("条件に合う課題がありません", systemImage: "line.3.horizontal.decrease.circle")
          } description: {
            Text("検索語や絞り込み条件を見直してください。")
          } actions: {
            Button("絞り込みを解除") { filters = LibraryFilters() }
          }
        } else {
          ContentUnavailableView.search(text: search)
        }
      } else {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 16)], spacing: 16) {
          ForEach(filtered) { document in
            wallItem(document)
          }
        }
        .padding()
      }
    }
  }

  private func deletionMessage(for ids: Set<UUID>) -> Text {
    if ids.count == 1,
      let document = store.walls.first(where: { ids.contains($0.id) })
    {
      return Text("「\(document.content.name)」とその編集データを端末から削除します。")
    }

    return Text("\(ids.count)件の課題とその編集データを端末から削除します。")
  }

  private func delete(_ ids: Set<UUID>) async {
    await store.delete(ids)
    if let selectedIDs {
      let remaining = selectedIDs.intersection(store.walls.map(\.id))
      self.selectedIDs = remaining.isEmpty ? nil : remaining
    }
  }

  private func wallItem(_ document: WallMetadata) -> some View {
    let isSelected = selectedIDs?.contains(document.id) == true
    let tap = {
      if var selection = selectedIDs {
        if selection.remove(document.id) == nil { selection.insert(document.id) }
        selectedIDs = selection
      } else {
        path.append(document.id)
      }
    }
    let select = {
      if selectedIDs == nil { selectedIDs = [] }
      selectedIDs?.insert(document.id)
    }
    return card(document)
      .overlay(alignment: .topTrailing) {
        if selectedIDs != nil {
          Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
            .padding(3)
            .background(.regularMaterial, in: Circle())
            .padding(8)
            .accessibilityHidden(true)
        }
      }
      .contentShape(RoundedRectangle(cornerRadius: 16))
      .gesture(
        LongPressGesture().onEnded { _ in select() }
          .exclusively(before: TapGesture().onEnded { tap() })
      )
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isButton)
      .accessibilityAddTraits(isSelected ? .isSelected : [])
      .accessibilityAction { tap() }
      .accessibilityAction(named: Text("選択")) { select() }
  }

  private func card(_ document: WallMetadata) -> some View {
    Group {
      if grid {
        VStack(alignment: .leading, spacing: 8) {
          WallThumbnail(document: document, photoURL: store.photoURL(for: document.id))
            .frame(height: 190).clipped()
          details(document)
            .padding([.horizontal, .bottom], 12)
        }
      } else {
        HStack(spacing: 12) {
          WallThumbnail(document: document, photoURL: store.photoURL(for: document.id))
            .frame(width: 80, height: 80).clipped()
            .clipShape(RoundedRectangle(cornerRadius: 8))
          details(document)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
      }
    }
    .background(
      Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16)
    )
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }

  private func details(_ document: WallMetadata) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(document.content.name).font(.headline).lineLimit(2)
      if !document.content.grade.isEmpty {
        Text(document.content.grade).font(.subheadline)
      }
      if !document.content.gymName.isEmpty {
        Text(document.content.gymName).font(.caption).foregroundStyle(.secondary)
          .lineLimit(grid ? nil : 1)
      }
      Text(document.updatedAt, format: .dateTime.year().month().day())
        .font(.caption2).foregroundStyle(.secondary)
    }
  }
}

@MainActor
private struct LibraryFilterView: View {
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

enum UserManual {
  struct Block: Identifiable {
    let id: Int
    var text: AttributedString
    let headingLevel: Int?
    let listMarker: String?
  }

  struct Entry: Identifiable {
    let block: Block
    let children: [Entry]

    var id: Int { block.id }
  }

  static func outline(from blocks: [Block]) -> [Entry] {
    var index = blocks.startIndex

    func entries(below level: Int) -> [Entry] {
      var result: [Entry] = []
      while index < blocks.endIndex {
        let block = blocks[index]
        if let heading = block.headingLevel, heading <= level { break }
        index += 1
        let children: [Entry]
        if let heading = block.headingLevel, heading > 1 {
          children = entries(below: heading)
        } else {
          children = []
        }
        result.append(Entry(block: block, children: children))
      }
      return result
    }

    return entries(below: 0)
  }

  static func load(bundle: Bundle = .main) throws -> [Block] {
    guard let url = bundle.url(forResource: "USER_GUIDE", withExtension: "md") else {
      throw CocoaError(.fileReadNoSuchFile)
    }
    return try blocks(markdown: String(contentsOf: url, encoding: .utf8))
  }

  static func blocks(markdown: String) throws -> [Block] {
    let parsed = try AttributedString(markdown: markdown)
    var blocks: [Block] = []
    for run in parsed.runs {
      guard let intent = run.presentationIntent, let metadata = BlockMetadata(intent) else {
        continue
      }
      let text = AttributedString(parsed[run.range])
      if blocks.last?.id == metadata.id {
        blocks[blocks.count - 1].text.append(text)
      } else {
        blocks.append(
          Block(
            id: metadata.id, text: text, headingLevel: metadata.headingLevel,
            listMarker: metadata.listMarker))
      }
    }
    guard !blocks.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
    return blocks
  }

  private struct BlockMetadata {
    let id: Int
    let headingLevel: Int?
    let listMarker: String?

    init?(_ intent: PresentationIntent) {
      var identity: Int?
      var heading: Int?
      var ordinal: Int?
      var ordered = false
      for component in intent.components {
        switch component.kind {
        case .header(let level):
          identity = component.identity
          heading = level
        case .paragraph:
          identity = component.identity
        case .listItem(let number):
          ordinal = number
        case .orderedList:
          ordered = true
        default: break
        }
      }
      guard let identity else { return nil }
      id = identity
      headingLevel = heading
      listMarker = ordinal.map { ordered ? "\($0)." : "\u{2022}" }
    }
  }
}

@MainActor
private struct UserManualView: View {
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

@MainActor
private struct UserManualEntryView: View {
  let entry: UserManual.Entry
  @Binding var expandedHeadings: Set<Int>

  var body: some View {
    if entry.children.isEmpty {
      row.textSelection(.enabled)
    } else {
      DisclosureGroup(isExpanded: isExpanded) {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(entry.children) { child in
            UserManualEntryView(entry: child, expandedHeadings: $expandedHeadings)
          }
        }
        .padding(.top, 8)
      } label: {
        row.foregroundStyle(.primary)
      }
    }
  }

  private var isExpanded: Binding<Bool> {
    Binding(
      get: { expandedHeadings.contains(entry.id) },
      set: { expanded in
        if expanded {
          expandedHeadings.insert(entry.id)
        } else {
          expandedHeadings.remove(entry.id)
        }
      })
  }

  private var row: some View {
    let block = entry.block
    return HStack(alignment: .firstTextBaseline, spacing: 8) {
      if let marker = block.listMarker {
        Text(marker)
          .accessibilityHidden(true)
      }
      Text(block.text)
        .font(font(for: block.headingLevel))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(block.headingLevel == nil ? [] : .isHeader)
    }
    .padding(.leading, block.listMarker == nil ? 0 : 8)
  }

  private func font(for headingLevel: Int?) -> Font {
    switch headingLevel {
    case 1: return .title2.bold()
    case 2: return .title3.bold()
    case .some: return .headline
    case nil: return .body
    }
  }
}

@MainActor
private struct WallThumbnail: View {
  @Environment(\.displayScale) private var displayScale
  let document: WallMetadata
  let photoURL: URL?
  @State private var rendered: (WallThumbnailCache.Key, UIImage)?
  @State private var failed = false

  var body: some View {
    GeometryReader { geometry in
      let size = geometry.size
      let maxPixels = Int((max(size.width, size.height) * displayScale).rounded(.up))
      let key = WallThumbnailCache.Key(
        id: document.id, updatedAt: document.updatedAt, maxPixels: maxPixels)
      ZStack {
        Color(uiColor: .systemGray5)
        if let (renderedKey, image) = rendered, renderedKey == key {
          Image(uiImage: image).resizable().scaledToFit()
        } else if failed {
          Label("画像を読み込めません", systemImage: "exclamationmark.triangle")
        } else {
          ProgressView()
        }
      }
      .task(id: key) { await load(key) }
    }
    .accessibilityLabel("\(document.content.name)の編集済み画像")
  }

  private func load(_ key: WallThumbnailCache.Key) async {
    guard key.maxPixels > 0 else { return }
    failed = false
    do {
      guard let photoURL else { throw PintoError.invalidImage }
      let image = try await WallThumbnailCache.shared.image(
        for: key, content: document.content, photoURL: photoURL)
      try Task.checkCancellation()
      rendered = (key, image)
    } catch is CancellationError {
    } catch {
      if !Task.isCancelled { failed = true }
    }
  }
}

@MainActor
private struct EditorDestination: View {
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

@MainActor
struct NewWallView: View {
  var onCreate: (WallDocument) async throws -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var image: UIImage?
  @State private var photo: PhotosPickerItem?
  @State private var importing = false
  @State private var camera = false
  @State private var busy = false
  @State private var errorMessage: String?

  var body: some View {
    NavigationStack {
      Form {
        Section("課題の名前") { TextField("例: 11月の課題・赤の3級", text: $name) }
        Section("壁の写真") {
          if let image {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 300)
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
              image == nil || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
        }
      }
      .interactiveDismissDisabled(busy)
      .onChange(of: photo) { _, selected in
        Task {
          busy = true
          defer { busy = false }
          do {
            guard let selected else { return }
            guard let data = try await selected.loadTransferable(type: Data.self),
              let decoded = UIImage(data: data)
            else { throw PintoError.invalidImage }
            image = decoded
          } catch { errorMessage = error.localizedDescription }
        }
      }
      .fileImporter(isPresented: $importing, allowedContentTypes: [.image]) { result in
        do {
          let url = try result.get()
          let scoped = url.startAccessingSecurityScopedResource()
          defer { if scoped { url.stopAccessingSecurityScopedResource() } }
          guard let decoded = UIImage(data: try Data(contentsOf: url)) else {
            throw PintoError.invalidImage
          }
          image = decoded
        } catch { errorMessage = error.localizedDescription }
      }
      .fullScreenCover(isPresented: $camera) {
        CameraPicker { result in
          camera = false
          switch result {
          case .success(let image): self.image = image
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

  private func create() async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      guard let image else { throw PintoError.invalidImage }
      let document = WallDocument(
        imageData: try await WallImageWorker.shared.normalize(image),
        content: WallContent(name: name.trimmingCharacters(in: .whitespacesAndNewlines)))
      try await onCreate(document)
      dismiss()
    } catch { errorMessage = error.localizedDescription }
  }
}

@MainActor
private struct CameraPicker: UIViewControllerRepresentable {
  var onResult: (Result<UIImage, Error>) -> Void
  var onCancel: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }
  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

  final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate
  {
    let parent: CameraPicker
    init(parent: CameraPicker) { self.parent = parent }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      guard let image = info[.originalImage] as? UIImage else {
        parent.onResult(.failure(PintoError.invalidImage))
        return
      }
      parent.onResult(.success(image))
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onCancel() }
  }
}
