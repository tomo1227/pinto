import SwiftUI

@MainActor
struct ImageShareSheet: UIViewControllerRepresentable, Identifiable {
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
