import SwiftUI

@MainActor
struct EditorDock: View {
  let requestReset: () -> Void
  @ObservedObject var model: EditorModel
  @Binding var editorDockExpanded: Bool

  private var activeToolHasEditingControls: Bool {
    switch model.tool {
    case .hold, .route, .text: return true
    case .pan, .eraser: return false
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      if activeToolHasEditingControls && editorDockExpanded {
        EditorToolControlsPanel(model: model, mode: .dock)
      }
      Divider()
      tools
    }
    .background(.bar)
  }

  private func setEditorDockExpanded(_ expanded: Bool) {
    withAnimation(.easeInOut(duration: 0.22)) {
      editorDockExpanded = expanded
    }
  }

  private var tools: some View {
    HStack(spacing: 0) {
      ForEach(EditorTool.allCases, id: \.self) { tool in
        let label = VStack(spacing: 4) {
          Image(systemName: tool.icon).font(.title3)
          Text(tool.title).font(.caption2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .foregroundStyle(model.tool == tool ? Color.accentColor : .secondary)
        .background(model.tool == tool ? Color.accentColor.opacity(0.1) : .clear)
        .accessibilityAddTraits(model.tool == tool ? .isSelected : [])

        if tool == .eraser {
          label
            .contentShape(Rectangle())
            .gesture(
              LongPressGesture(minimumDuration: 0.6)
                .exclusively(before: TapGesture())
                .onEnded { action in
                  switch action {
                  case .first: requestReset()
                  case .second: selectTool(tool)
                  }
                }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(tool.title)
            .accessibilityHint("長押しで編集を全リセット")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { selectTool(tool) }
            .accessibilityAction(named: Text("編集を全リセット")) {
              requestReset()
            }
        } else {
          Button {
            selectTool(tool)
          } label: {
            label
          }
        }
      }
    }
  }

  private func selectTool(_ tool: EditorTool) {
    let isCurrentTool = model.tool == tool
    model.tool = tool
    if activeToolHasEditingControls {
      setEditorDockExpanded(!isCurrentTool || !editorDockExpanded)
    }
  }
}
