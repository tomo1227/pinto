import SwiftUI

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
    LibraryWallCard(
      document: document, photoURL: store.photoURL(for: document.id), grid: grid,
      selectionMode: selectedIDs != nil, isSelected: selectedIDs?.contains(document.id) == true,
      onTap: { openOrToggleSelection(document.id) }, onSelect: { select(document.id) }
    )
  }

  private func openOrToggleSelection(_ id: UUID) {
    if var selection = selectedIDs {
      if selection.remove(id) == nil { selection.insert(id) }
      selectedIDs = selection
    } else {
      path.append(id)
    }
  }

  private func select(_ id: UUID) {
    if selectedIDs == nil { selectedIDs = [] }
    selectedIDs?.insert(id)
  }
}
