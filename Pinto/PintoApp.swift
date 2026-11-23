import SwiftUI

@main
@MainActor
struct PintoApp: App {
  @StateObject private var store = WallStore()

  var body: some Scene {
    WindowGroup {
      LibraryView().environmentObject(store)
    }
  }
}

#Preview("Pinto") {
  LibraryView().environmentObject(WallStore())
}
