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
  @FocusState private var textInputFocused: Bool
  private let controlLabelWidth: CGFloat = 104

  var body: some View {
    ZStack {
      WallCanvas(model: model)
        .overlay(alignment: .topLeading) {
          if let status {
            Text(status).font(.caption).padding(10)
              .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8)).padding(8)
          }
        }
        .allowsHitTesting(!model.textPrompt)
      if model.textPrompt {
        textEntryOverlay
      }
    }
    .background(Color(uiColor: .systemBackground))
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !model.textPrompt { editorDock }
    }
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden()
    .toolbar(model.textPrompt ? .hidden : .visible, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .principal) {
        Text(model.content.name + (model.dirty ? " *" : ""))
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
        .accessibilityLabel("壁一覧に戻る")
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
        Button {
          shareSheet = ImageShareSheet(
            image: SceneRenderer.render(image: model.image, content: model.content),
            onError: { error in
              model.errorMessage = "画像を共有できませんでした。\n\(error.localizedDescription)"
            }
          )
        } label: {
          Image(systemName: "square.and.arrow.up")
        }
        .disabled(isSavingImage)
        .accessibilityLabel("画像を共有")
        Button {
          showSettings = true
        } label: {
          Image(systemName: "gearshape")
        }
        .accessibilityLabel("壁の設定")
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
          Button("全リセット", role: .destructive) {
            model.change {
              $0.holds = []
              $0.texts = []
              $0.route = []
            }
            model.selection = nil
          }

          Button("キャンセル", role: .cancel) {}
        } message: {
          Text("ホールド・文字・ルートをすべて削除します。\n壁の写真と設定は残ります。操作後は「元に戻す」で取り消せます。")
        }
        .tint(Color(uiColor: .label))
    }
    .confirmationDialog("未保存の編集があります", isPresented: $showLeave, titleVisibility: .visible) {
      Button("保存して戻る") { if save() { dismiss() } }
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
    .task(id: model.content) {
      do {
        try await model.autosave(to: store)
      } catch is CancellationError {
      } catch {
        reportSaveFailure(error)
      }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active, model.dirty { save() }
    }
  }

  private func leaveEditor() {
    do {
      if model.dirty { try model.save(to: store) }
      dismiss()
    } catch {
      leaveSaveError = error.localizedDescription
      showLeave = true
    }
  }

  private var textEntryOverlay: some View {
    VStack(spacing: 12) {
      HStack {
        Button(action: cancelTextEntry) {
          Image(systemName: "xmark")
            .font(.headline)
            .foregroundStyle(.primary)
            .frame(width: 44, height: 44)
            .background(.regularMaterial, in: Circle())
        }
        .accessibilityLabel("テキスト編集をキャンセル")
        Spacer()
        Button(action: finishTextEntry) {
          Text("完了")
            .font(.headline)
            .foregroundStyle(.primary)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
        }
      }

      Spacer(minLength: 16)
      TextField("文字を入力", text: $model.textDraft, axis: .vertical)
        .font(textPreviewFont)
        .foregroundStyle(Color(uiColor: UIColor(hex: model.activeStyle.color)))
        .multilineTextAlignment(.center)
        .lineLimit(1...5)
        .textFieldStyle(.plain)
        .submitLabel(.done)
        .focused($textInputFocused)
        .onSubmit(finishTextEntry)
        .frame(maxWidth: .infinity)
      Spacer(minLength: 16)
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 10) {
          textColorControls
          styleControls
        }
        .padding(12)
      }
      .frame(maxHeight: 200)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 16)
    .background { Color.black.opacity(0.76).ignoresSafeArea() }
    .preferredColorScheme(.dark)
    .onAppear { textInputFocused = true }
  }

  private var textPreviewFont: Font {
    var style = model.activeStyle
    style.fontSize = min(56, max(18, style.fontSize))
    return Font(SceneRenderer.font(style, unit: 1))
  }

  private func cancelTextEntry() {
    textInputFocused = false
    model.textPrompt = false
  }

  private func finishTextEntry() {
    model.commitText()
    textInputFocused = false
    model.textPrompt = false
  }

  private var editorDock: some View {
    VStack(spacing: 0) {
      if editorDockExpanded {
        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 10) {
            if model.tool == .route {
              colorControls(title: "線の色")
            } else if model.editingText {
              textColorControls
            } else {
              HStack(spacing: 8) {
                if model.tool == .hold {
                  holdShapePicker
                    .frame(width: 76)
                    .frame(width: controlLabelWidth, alignment: .leading)
                }
                colorControls()
              }
            }
            styleControls
            if model.tool == .route {
              VStack(alignment: .leading, spacing: 8) {
                if let color = model.content.routeNumberColor {
                  colorPalette(selectedColor: color, title: "ルートの数字色") { hex in
                    model.change { $0.routeNumberColor = hex }
                  }
                } else {
                  controlLabel("ルートの数字色")
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
              sliderRow(
                "ルートの数字サイズ",
                value: Binding(
                  get: { model.content.effectiveRouteNumberSize },
                  set: { value in model.change { $0.routeNumberSize = value } }
                ),
                in: 6...60, onReset: model.resetRouteNumberSize)
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
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
        }
        .frame(maxHeight: 240)
      }
      Divider()
      tools
    }
    .background(.bar)
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

  private func toggleEditorDock() {
    setEditorDockExpanded(!editorDockExpanded)
  }

  private func setEditorDockExpanded(_ expanded: Bool) {
    withAnimation(.easeInOut(duration: 0.22)) {
      editorDockExpanded = expanded
    }
  }

  private func colorControls(title: String? = nil) -> some View {
    colorPalette(selectedColor: model.activeStyle.color, title: title) { hex in
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
      .frame(width: controlLabelWidth, alignment: .leading)
      colorPalette(selectedColor: model.activeStyle.color, title: nil, accessibilityTitle: "文字の色") {
        hex in
        model.updateStyle { $0.color = hex }
      }
    }
  }

  private func colorPalette(
    selectedColor: String, title: String?, accessibilityTitle: String? = nil,
    onSelect: @escaping (String) -> Void
  ) -> some View {
    HStack(spacing: 8) {
      if let title {
        controlLabel(title)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(WallCatalog.colors, id: \.self) { hex in
            Button {
              onSelect(hex)
            } label: {
              Circle().fill(Color(uiColor: UIColor(hex: hex)))
                .frame(width: 26, height: 26)
                .overlay(Circle().strokeBorder(.gray, lineWidth: 0.5))
                .overlay(
                  Circle().stroke(selectedColor == hex ? Color.accentColor : .clear, lineWidth: 2))
            }
            .accessibilityLabel(
              (accessibilityTitle ?? title).map { "\($0): \(colorLabel(hex))" } ?? colorLabel(hex)
            )
            .accessibilityAddTraits(selectedColor == hex ? .isSelected : [])
          }
        }
        .padding(2)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
  }

  private func controlLabel(_ title: String) -> some View {
    Text(title)
      .fixedSize(horizontal: false, vertical: true)
      .frame(width: controlLabelWidth, alignment: .leading)
  }

  private func sliderRow(
    _ title: String, value: Binding<Double>, in range: ClosedRange<Double>,
    onReset: @escaping () -> Void
  ) -> some View {
    HStack(spacing: 8) {
      controlLabel(title)
      ResettableSlider(title: title, value: value, range: range, onReset: onReset)
        .frame(maxWidth: .infinity)
        .frame(height: 32)
      Text("000")
        .monospacedDigit()
        .fixedSize()
        .hidden()
        .overlay(alignment: .trailing) {
          Text("\(Int(value.wrappedValue))")
            .monospacedDigit()
            .foregroundStyle(.secondary)
        }
        .accessibilityHidden(true)
    }
  }

  private func styleSliderRow(
    _ title: String, _ keyPath: WritableKeyPath<MarkStyle, Double>, in range: ClosedRange<Double>
  ) -> some View {
    sliderRow(title, value: styleBinding(keyPath), in: range) {
      model.resetStyleValue(keyPath)
    }
  }

  @ViewBuilder
  private var styleControls: some View {
    VStack(alignment: .leading, spacing: 4) {
      if model.editingText {
        ScrollView(.horizontal, showsIndicators: false) {
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
        }
        styleSliderRow("文字サイズ", \.fontSize, in: 6...120)
      } else {
        styleSliderRow("線の太さ", \.width, in: 1...20)
      }
      styleSliderRow("枠線の太さ", \.outlineWidth, in: 0...12)
      colorPalette(selectedColor: model.activeStyle.outlineColor, title: "枠線の色") { hex in
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
                  case .first: showReset = true
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
              showReset = true
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
    if isCurrentTool {
      toggleEditorDock()
    }
  }

  private func styleBinding<T>(_ keyPath: WritableKeyPath<MarkStyle, T>) -> Binding<T> {
    Binding(
      get: { model.activeStyle[keyPath: keyPath] },
      set: { value in model.updateStyle { $0[keyPath: keyPath] = value } })
  }

  private func radiusBinding(_ index: Int, _ keyPath: WritableKeyPath<Hold, Double>) -> Binding<
    Double
  > {
    let id = model.content.holds[index].id
    return Binding(
      get: {
        model.content.holds.first { $0.id == id }?[keyPath: keyPath] ?? 0.035
      },
      set: { value in
        model.change { content in
          if let current = content.holds.firstIndex(where: { $0.id == id }) {
            content.holds[current][keyPath: keyPath] = value
          }
        }
      })
  }

  @discardableResult
  private func save() -> Bool {
    guard model.dirty else { return true }
    do {
      try model.save(to: store)
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
    guard save() else { return }
    isSavingImage = true
    status = "写真ライブラリに保存中…"
    Task {
      defer { isSavingImage = false }
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

  private func colorLabel(_ hex: String) -> String {
    let names = ["黒", "白", "赤", "オレンジ", "黄", "緑", "青", "紫"]
    return names[WallCatalog.colors.firstIndex(of: hex) ?? 0]
  }
}

private struct ResettableSlider: UIViewRepresentable {
  let title: String
  @Binding var value: Double
  let range: ClosedRange<Double>
  let onReset: () -> Void

  func makeUIView(context: Context) -> ResettableSliderView {
    ResettableSliderView(frame: .zero)
  }

  func updateUIView(_ view: ResettableSliderView, context: Context) {
    let slider = view.slider
    slider.accessibilityLabel = title
    slider.minimumValue = Float(range.lowerBound)
    slider.maximumValue = Float(range.upperBound)
    slider.onReset = onReset
    let binding = $value
    slider.onValueChange = { binding.wrappedValue = $0 }
    let next = Float(value)
    if slider.value != next && (!slider.isTracking || slider.value.rounded() != next) {
      slider.setValue(next, animated: false)
    }
  }
}

final class ResettableSliderView: UIView, UIGestureRecognizerDelegate {
  let slider = ResettableSliderControl(frame: .zero)

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(slider)
    slider.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    slider.frame = bounds
    // Observe taps above UISlider so its own tracking gestures do not consume them first.
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(resetFromDoubleTap))
    doubleTap.numberOfTapsRequired = 2
    doubleTap.delegate = self
    addGestureRecognizer(doubleTap)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    slider.thumbContains(touch.location(in: slider))
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    otherGestureRecognizer.view?.isDescendant(of: self) == true
  }

  @objc private func resetFromDoubleTap() {
    // Let UISlider finish cancelling its tracking before writing the default.
    Task { @MainActor [weak self] in
      self?.slider.onReset?()
    }
  }
}

final class ResettableSliderControl: UISlider {
  var onValueChange: ((Double) -> Void)?
  var onReset: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    addTarget(self, action: #selector(valueChanged), for: .valueChanged)
    accessibilityCustomActions = [
      UIAccessibilityCustomAction(
        name: "初期値に戻す", target: self, selector: #selector(resetValue))
    ]
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func accessibilityIncrement() { adjustAccessibilityValue(by: 1) }

  override func accessibilityDecrement() { adjustAccessibilityValue(by: -1) }

  private func adjustAccessibilityValue(by step: Float) {
    let next = min(maximumValue, max(minimumValue, value.rounded() + step))
    guard next != value else { return }
    setValue(next, animated: true)
    valueChanged()
  }

  func thumbContains(_ point: CGPoint) -> Bool {
    thumbRect(forBounds: bounds, trackRect: trackRect(forBounds: bounds), value: value)
      .contains(point)
  }

  @objc private func valueChanged() {
    onValueChange?(Double(value.rounded()))
  }

  @objc private func resetValue() -> Bool {
    guard let onReset else { return false }
    onReset()
    return true
  }
}

@MainActor
private struct ImageShareSheet: UIViewControllerRepresentable, Identifiable {
  let id = UUID()
  let image: UIImage
  let onError: @MainActor (Error) -> Void

  func makeUIViewController(context: Context) -> UIActivityViewController {
    let controller = UIActivityViewController(activityItems: [image], applicationActivities: nil)
    controller.completionWithItemsHandler = { _, _, _, error in
      if let error {
        Task { @MainActor in onError(error) }
      }
    }
    return controller
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
