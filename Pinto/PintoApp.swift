import SwiftUI

#if DEBUG
  import Darwin
  import OSLog
#endif

@main
@MainActor
struct PintoApp: App {
  @StateObject private var store = WallStore()

  var body: some Scene {
    WindowGroup {
      StartupView()
        .environmentObject(store)
        .tint(Color.accentColor)
        #if DEBUG
          .overlay(alignment: .topTrailing, content: debugMemoryOverlay)
        #endif
    }
  }

  #if DEBUG
    @ViewBuilder
    private func debugMemoryOverlay() -> some View {
      if ProcessInfo.processInfo.arguments.contains("-PintoMemoryCheck") {
        DebugMemoryBadge()
          .padding(8)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
      }
    }
  #endif
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
        .stroke(
          Color.accentColor, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
        )
      ForEach(holds.indices, id: \.self) { index in
        Circle()
          .fill(Color.accentColor)
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

#if DEBUG
  struct DebugMemorySample {
    static let budgetMB: UInt64 = 300
    private static let budgetBytes = budgetMB * 1_000_000
    let current: UInt64
    let peak: UInt64

    var exceedsBudget: Bool { peak > Self.budgetBytes }

    static func read() -> Self? {
      var info = task_vm_info_data_t()
      let capacity = MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size
      var count = mach_msg_type_number_t(capacity)
      let result = withUnsafeMutablePointer(to: &info) { pointer in
        pointer.withMemoryRebound(to: integer_t.self, capacity: capacity) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
      }

      // Older kernels can return a shorter struct; don't treat a missing peak as zero.
      guard result == KERN_SUCCESS,
        let peakOffset = MemoryLayout<task_vm_info_data_t>.offset(
          of: \.ledger_phys_footprint_peak),
        Int(count) * MemoryLayout<integer_t>.size >= peakOffset + MemoryLayout<Int64>.size,
        info.ledger_phys_footprint_peak > 0
      else { return nil }
      return Self(
        current: info.phys_footprint,
        peak: max(info.phys_footprint, UInt64(info.ledger_phys_footprint_peak)))
    }
  }

  private struct DebugMemoryBadge: View {
    private static let logger = Logger(subsystem: "com.tomokiota.pinto", category: "MemoryCheck")
    @State private var sample: DebugMemorySample?
    @State private var didWarn = false

    var body: some View {
      Group {
        if let sample {
          Text(
            "RAM \(megabytes(sample.current)) MB · Peak \(megabytes(sample.peak))"
              + " / \(DebugMemorySample.budgetMB) MB" + (sample.exceedsBudget ? " ⚠" : ""))
        } else {
          Text("RAM: 計測不可")
        }
      }
      .font(.caption2.monospacedDigit())
      .padding(6)
      .foregroundStyle(.white)
      .background(
        sample?.exceedsBudget == true ? Color.red : Color.black.opacity(0.8), in: Capsule()
      )
      .task {
        while !Task.isCancelled {
          sample = DebugMemorySample.read()
          if let sample, sample.exceedsBudget, !didWarn {
            didWarn = true
            Self.logger.warning(
              "Debug memory budget exceeded: peak \(sample.peak, privacy: .public) bytes")
          }
          do {
            try await Task.sleep(for: .seconds(1))
          } catch is CancellationError {
            return
          } catch {
            Self.logger.error(
              "Memory checks stopped: \(error.localizedDescription, privacy: .public)")
            return
          }
        }
      }
    }

    private func megabytes(_ bytes: UInt64) -> String {
      (Double(bytes) / 1_000_000).formatted(.number.precision(.fractionLength(1)))
    }
  }
#endif
