import SwiftUI

@MainActor
struct EditorToolControlsPanel: View {
  enum Mode {
    case dock, textEntry
  }

  @ObservedObject var model: EditorModel
  let mode: Mode

  var body: some View {
    EditorControlsPanel(contentInset: mode == .textEntry ? 20 : 0) {
      dockControls(for: .hold, editingText: false)
    } content: {
      switch mode {
      case .dock:
        dockControls(for: model.tool, editingText: model.editingText)
      case .textEntry:
        VStack(alignment: .leading, spacing: 10) {
          textColorControls
          styleControls(editingText: true)
        }
      }
    }
  }

  private func dockControls(for tool: EditorTool, editingText: Bool) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      if tool == .route {
        colorControls(title: "線の色")
      } else if editingText {
        textColorControls
      } else {
        HStack(spacing: 8) {
          if tool == .hold {
            holdShapePicker
              .frame(width: 76)
              .frame(width: EditorControlLabel.width, alignment: .leading)
          }
          colorControls()
        }
      }
      styleControls(editingText: editingText)
      if tool == .route {
        routeControls
      }
      HStack {
        Spacer()
        Button(role: .destructive) {
          model.removeSelection()
        } label: {
          Label("削除", systemImage: "trash")
        }
        .disabled(model.selection == nil)
      }
    }
  }

  private var routeControls: some View {
    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 8) {
        if let color = model.content.routeNumberColor {
          EditorColorPalette(selectedColor: color, title: "ルートの数字色") { hex in
            model.change { $0.routeNumberColor = hex }
          }
        } else {
          EditorControlLabel(title: "ルートの数字色")
        }
        Toggle(
          "ホールドと同じ色",
          isOn: Binding(
            get: { model.content.routeNumberColor == nil },
            set: { sameColor in
              model.change { $0.routeNumberColor = sameColor ? nil : $0.holdStyle.color }
            }
          ))
      }
      EditorSliderRow(
        title:
          "ルートの数字サイズ",
        value: Binding(
          get: { model.content.effectiveRouteNumberSize },
          set: { value in model.change { $0.routeNumberSize = value } }
        ),
        range: 6...60, onReset: model.resetRouteNumberSize)
      HStack {
        Button {
          model.change { $0.showLines.toggle() }
        } label: {
          Label("ルート線", systemImage: model.content.showLines ? "eye" : "eye.slash")
        }
        .accessibilityValue(model.content.showLines ? "表示" : "非表示")
        Spacer()
        Button {
          model.change { $0.showRouteNumbers = !$0.effectiveShowRouteNumbers }
        } label: {
          Label(
            "ルートの数字",
            systemImage: model.content.effectiveShowRouteNumbers ? "eye" : "eye.slash")
        }
        .accessibilityValue(model.content.effectiveShowRouteNumbers ? "表示" : "非表示")
      }
    }
  }

  private var holdShapePicker: some View {
    Picker(
      "ホールドの形",
      selection: Binding(
        get: { model.activeHoldShape },
        set: { model.updateHoldShape($0) }
      )
    ) {
      ForEach(HoldShape.allCases, id: \.self) { shape in
        Image(systemName: shape == .oval ? "circle" : "square")
          .accessibilityLabel(Text(shape.label))
          .tag(shape)
      }
    }
    .pickerStyle(.segmented)
  }

  private func colorControls(title: String? = nil) -> some View {
    EditorColorPalette(selectedColor: model.activeStyle.color, title: title) { hex in
      model.updateStyle { $0.color = hex }
    }
  }

  private var textColorControls: some View {
    HStack(spacing: 8) {
      HStack(spacing: 8) {
        Toggle(isOn: styleBinding(\.isBold)) {
          Text("B").font(.title3.bold())
        }
        .accessibilityLabel("太字")
        Toggle(isOn: styleBinding(\.isItalic)) {
          Text("I").font(.title3.italic())
        }
        .accessibilityLabel("斜体")
      }
      .toggleStyle(.button)
      .frame(width: EditorControlLabel.width, alignment: .leading)
      EditorColorPalette(
        selectedColor: model.activeStyle.color, title: nil, accessibilityTitle: "文字の色"
      ) {
        hex in
        model.updateStyle { $0.color = hex }
      }
    }
  }

  private func styleSliderRow(
    _ title: String, _ keyPath: WritableKeyPath<MarkStyle, Double>, in range: ClosedRange<Double>
  ) -> some View {
    EditorSliderRow(title: title, value: styleBinding(keyPath), range: range) {
      model.resetStyleValue(keyPath)
    }
  }

  @ViewBuilder
  private func styleControls(editingText: Bool) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      if editingText {
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(TextFamily.allCases, id: \.self) { family in
              Button {
                model.updateStyle { $0.fontFamily = family }
              } label: {
                Text(family.label)
                  .font(fontOptionPreview(family))
                  .padding(.horizontal, 14)
                  .padding(.vertical, 10)
                  .background(
                    model.activeStyle.fontFamily == family
                      ? Color.accentColor.opacity(0.25) : Color.secondary.opacity(0.12),
                    in: Capsule()
                  )
                  .overlay(
                    Capsule().strokeBorder(
                      model.activeStyle.fontFamily == family ? Color.accentColor : .clear,
                      lineWidth: 2
                    ))
              }
              .buttonStyle(.plain)
              .accessibilityLabel("フォント: \(family.label)")
              .accessibilityAddTraits(model.activeStyle.fontFamily == family ? .isSelected : [])
            }
          }
          .scrollBounceBehavior(.basedOnSize)
        }
        styleSliderRow("文字サイズ", \.fontSize, in: 6...120)
      } else {
        styleSliderRow("線の太さ", \.width, in: 1...20)
      }
      styleSliderRow("枠線の太さ", \.outlineWidth, in: 0...12)
      EditorColorPalette(selectedColor: model.activeStyle.outlineColor, title: "枠線の色") { hex in
        model.updateStyle { $0.outlineColor = hex }
      }
    }
  }

  private func fontOptionPreview(_ family: TextFamily) -> Font {
    var style = model.activeStyle
    style.fontFamily = family
    style.fontSize = 13
    return Font(SceneRenderer.font(style, unit: 1))
  }

  private func styleBinding<T>(_ keyPath: WritableKeyPath<MarkStyle, T>) -> Binding<T> {
    Binding(
      get: { model.activeStyle[keyPath: keyPath] },
      set: { value in model.updateStyle { $0[keyPath: keyPath] = value } })
  }
}
