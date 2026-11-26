import SwiftUI

@MainActor
struct CameraPicker: UIViewControllerRepresentable {
  var onResult: (Result<UIImage, Error>) -> Void
  var onCancel: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }
  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

  final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate
  {
    let parent: CameraPicker
    init(parent: CameraPicker) { self.parent = parent }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      guard let image = info[.originalImage] as? UIImage else {
        parent.onResult(.failure(PintoError.invalidImage))
        return
      }
      parent.onResult(.success(image))
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onCancel() }
  }
}
