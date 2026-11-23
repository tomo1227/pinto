import SwiftUI

@MainActor
struct WallSettingsView: View {
    @State var content: WallContent
    var onSave: (WallContent) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("壁・課題") {
                    TextField("名前", text: $content.name)
                    Picker("日本グレード", selection: $content.japaneseGrade) {
                        Text("未設定").tag("")
                        ForEach(WallCatalog.japaneseGrades, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Vグレード", selection: $content.vGrade) {
                        Text("未設定").tag("")
                        ForEach(WallCatalog.vGrades, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("ジム名（任意・手入力）", text: $content.gymName)
                    TextField("作成者（任意）", text: $content.author)
                    TextField("説明", text: $content.notes, axis: .vertical).lineLimit(3...8)
                }
                Section("キャンバス設定") {
                    Toggle("ホールド輪郭の自動検出", isOn: $content.autoDetectHolds)
                    Toggle("楕円を許可", isOn: $content.allowEllipses)
                    Text("輪郭が見つからない場合は通常の丸を配置します。画像は端末内で処理され、外部へ送信されません。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(WallCatalog.tagGroups, id: \.0) { group in
                    Section(group.0) {
                        ForEach(group.1, id: \.self) { tag in
                            Toggle(tag, isOn: Binding(
                                get: { content.tags.contains(tag) },
                                set: { selected in
                                    if selected { content.tags.insert(tag) } else { content.tags.remove(tag) }
                                }
                            ))
                        }
                    }
                }
            }
            .navigationTitle("壁の設定").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("適用") {
                        content.name = content.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSave(content)
                        dismiss()
                    }
                    .disabled(content.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
