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
          .padding(.horizontal, 12)
      }
      tools
    }
    .background(.bar)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.shadowRock.opacity(0.25))
        .frame(height: 1 / 3)
    }
  }

  private func setEditorDockExpanded(_ expanded: Bool) {
    withAnimation(.easeInOut(duration: 0.22)) {
      editorDockExpanded = expanded
    }
  }

  private var tools: some View {
    HStack(spacing: 12) {
      ForEach(EditorTool.allCases, id: \.self) { tool in
        toolButton(tool)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 10)
    .padding(.top, 12)
    .padding(.bottom, 12)
  }

  @ViewBuilder
  private func toolButton(_ tool: EditorTool) -> some View {
    let isSelected = model.tool == tool
    if tool == .eraser {
      Image(systemName: tool.icon)
        .font(.system(size: 19, weight: .medium))
        .frame(width: 44, height: 44)
        .foregroundStyle(isSelected ? Theme.chalk : Theme.shadowRock)
        .background(
          Circle().fill(isSelected ? Theme.holdRed : Theme.shadowRock.opacity(0.06))
        )
        .contentShape(Circle())
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
        Image(systemName: tool.icon)
          .font(.system(size: 19, weight: .medium))
          .frame(width: 44, height: 44)
          .foregroundStyle(isSelected ? Theme.chalk : Theme.shadowRock)
          .background(
            Circle().fill(isSelected ? Theme.cragGreen : Theme.shadowRock.opacity(0.06))
          )
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(tool.title)
      .accessibilityAddTraits(isSelected ? .isSelected : [])
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
