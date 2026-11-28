import SwiftUI

// 「壁・チョーク・テープ」デザインのカラートークン。
// 壁（Wall）を背景に、チョーク（Chalk）とホールド・テープの6色で構成する。
enum Theme {
  /// 壁の下地。カード面や一覧の背景に使う。
  static let wall = Color(light: UIColor(hex: "#E9E8E1"), dark: UIColor(hex: "#26292E"))
  /// チョークの白。壁の上に置く前景・文字に使う。
  static let chalk = Color(light: UIColor(hex: "#FFFEFA"), dark: UIColor(hex: "#FFFEFA"))
  /// 壁の影になる岩。サムネイルの余白や強い背景に使う。
  static let shadowRock = Color(light: UIColor(hex: "#282C33"), dark: UIColor(hex: "#181C22"))
  /// テープの黄。アクセントの強調に使う。
  static let tapeYellow = Color(light: UIColor(hex: "#F2D13D"), dark: UIColor(hex: "#E3C22E"))
  /// ホールドの赤。破壊的な操作に使う。
  static let holdRed = Color(light: UIColor(hex: "#E55050"), dark: UIColor(hex: "#E86868"))
  /// 岩場の空の青。アプリのアクセントカラー（AccentColor と同値）。
  static let accentBlue = Color(light: UIColor(hex: "#005CC8"), dark: UIColor(hex: "#58AAFF"))

  /// 壁にひかれたテープ風の帯。課題名やステータス表示の背景に使う。
  static var tape: some View { TapeTitleBackground() }

  /// 丸ゴシック体の見出し。課題名やセクション見出しに使う。
  static func roundedHeadline(_ size: CGFloat = 17) -> Font {
    .custom("HiraMaruProN-W4", size: size)
  }

  /// 丸ゴシック体の本文。テープ帯の中の文字などに使う。
  static func roundedBody(_ size: CGFloat = 13) -> Font {
    .custom("HiraMaruProN-W4", size: size)
  }
}

private struct TapeTitleBackground: View {
  @Environment(\.displayScale) private var displayScale

  var body: some View {
    GeometryReader { proxy in
      let tape = Theme.roundedTapeImage(width: proxy.size.width, scale: displayScale)
      Image(uiImage: tape)
        .resizable()
        .frame(width: proxy.size.width, height: proxy.size.height)
    }
  }
}

extension Theme {
  /// テープ帯の両端のギザギザを描いた画像。明るい場所に貼った見た目にする。
  static func roundedTapeImage(width: CGFloat, scale: CGFloat) -> UIImage {
    let height = max(1, width / 12)
    let size = CGSize(width: width, height: height)
    let rendererFormat = UIGraphicsImageRendererFormat()
    rendererFormat.scale = scale
    let renderer = UIGraphicsImageRenderer(size: size, format: rendererFormat)
    return renderer.image { context in
      let cgContext = context.cgContext
      let notches = max(2, Int(width / 6))
      let notchWidth = width / CGFloat(notches)
      let notchDepth = height / 4
      cgContext.move(to: CGPoint(x: 0, y: notchDepth))
      cgContext.addLine(to: CGPoint(x: 0, y: height - notchDepth))
      for index in 0 ..< notches {
        let x = notchWidth * CGFloat(index)
        let midX = x + notchWidth / 2
        cgContext.addLine(to: CGPoint(x: midX, y: index.isMultiple(of: 2) ? height - notchDepth : notchDepth))
      }
      cgContext.addLine(to: CGPoint(x: width, y: notchDepth))
      cgContext.addLine(to: CGPoint(x: width, y: height - notchDepth))
      cgContext.closePath()
      UIColor(hex: "#F2D13D").setFill()
      cgContext.fillPath()
    }
  }
}

extension Color {
  init(light: UIColor, dark: UIColor) {
    self.init(uiColor: UIColor { traits in
      traits.userInterfaceStyle == .dark ? dark : light
    })
  }
}

/// Liquid Glass を使う場合は iOS 26 以上でのみ有効にし、
/// それ未満では素材にフォールバックする。
extension View {
  /// ツール類の前面に浮く小さな円形サーフェス。
  @ViewBuilder
  func themeCircleGlass() -> some View {
    if #available(iOS 26.0, *) {
      self.glassEffect(.regular, in: .circle)
    } else {
      self.background(.regularMaterial, in: Circle())
    }
  }
}
