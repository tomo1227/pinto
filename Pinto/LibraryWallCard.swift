import SwiftUI

@MainActor
struct LibraryWallCard: View {
  let document: WallMetadata
  let photoURL: URL?
  let grid: Bool
  let selectionMode: Bool
  let isSelected: Bool
  let onTap: () -> Void
  let onSelect: () -> Void

  var body: some View {
    card
      .overlay(alignment: .topTrailing) {
        if selectionMode {
          Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
            .padding(3)
            .background(.regularMaterial, in: Circle())
            .padding(8)
            .accessibilityHidden(true)
        }
      }
      .contentShape(RoundedRectangle(cornerRadius: 16))
      .gesture(
        LongPressGesture().onEnded { _ in onSelect() }
          .exclusively(before: TapGesture().onEnded { onTap() })
      )
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isButton)
      .accessibilityAddTraits(isSelected ? .isSelected : [])
      .accessibilityAction { onTap() }
      .accessibilityAction(named: Text("選択")) { onSelect() }
  }

  private var card: some View {
    Group {
      if grid {
        VStack(alignment: .leading, spacing: 8) {
          WallThumbnail(document: document, photoURL: photoURL)
            .frame(height: 190).clipped()
          details
            .padding([.horizontal, .bottom], 12)
        }
      } else {
        HStack(spacing: 12) {
          WallThumbnail(document: document, photoURL: photoURL)
            .frame(width: 80, height: 80).clipped()
            .clipShape(RoundedRectangle(cornerRadius: 8))
          details
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
      }
    }
    .background(
      Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16)
    )
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(document.content.name).font(.headline).lineLimit(2)
      if !document.content.grade.isEmpty {
        Text(document.content.grade).font(.subheadline)
      }
      if !document.content.gymName.isEmpty {
        Text(document.content.gymName).font(.caption).foregroundStyle(.secondary)
          .lineLimit(grid ? nil : 1)
      }
      Text(document.updatedAt, format: .dateTime.year().month().day())
        .font(.caption2).foregroundStyle(.secondary)
    }
  }
}
