import SwiftUI

@main
@MainActor
struct PintoApp: App {
  @StateObject private var store = WallStore()

  var body: some Scene {
    WindowGroup {
      StartupView()
        .environmentObject(store)
    }
  }
}

private struct StartupView: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var finished = false
  @State private var routeDrawn = false

  private var showingIntro: Bool { !reduceMotion && !finished }

  var body: some View {
    LibraryView()
      .allowsHitTesting(!showingIntro)
      .accessibilityHidden(showingIntro)
      .overlay {
        if showingIntro {
          ZStack {
            Color("LaunchBackground")
            Image("PintoWordmark")
              .foregroundStyle(Color(uiColor: .label))
              .accessibilityLabel("Pinto")
            StartupRoute(drawn: routeDrawn)
              .offset(y: 62)
              .accessibilityHidden(true)
          }
          .ignoresSafeArea()
          .transition(.opacity)
        }
      }
      .task(id: reduceMotion) {
        guard !finished else { return }
        if reduceMotion {
          finished = true
          return
        }
        try? await Task.sleep(for: .milliseconds(120))
        guard !Task.isCancelled else { return }
        withAnimation(.easeInOut(duration: 0.65)) { routeDrawn = true }
        try? await Task.sleep(for: .milliseconds(980))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.22)) { finished = true }
      }
  }
}

private struct StartupRoute: View {
  let drawn: Bool
  private let holds = [
    CGPoint(x: 8, y: 29), CGPoint(x: 40, y: 12),
    CGPoint(x: 72, y: 23), CGPoint(x: 108, y: 5),
  ]

  var body: some View {
    ZStack(alignment: .topLeading) {
      Path { path in path.addLines(holds) }
        .trim(from: 0, to: drawn ? 1 : 0)
        .stroke(Color.blue, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
      ForEach(holds.indices, id: \.self) { index in
        Circle()
          .fill(Color.blue)
          .frame(width: 8, height: 8)
          .position(holds[index])
          .opacity(drawn ? 1 : 0)
          .animation(.easeOut(duration: 0.15).delay(Double(index) * 0.17), value: drawn)
      }
    }
    .frame(width: 116, height: 34)
  }
}

#Preview("Pinto") {
  LibraryView().environmentObject(WallStore())
}
