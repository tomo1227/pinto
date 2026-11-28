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
        VStack(alignment: .leading, spacing: 0) {
          WallThumbnail(document: document, photoURL: photoURL)
            .frame(height: 190).clipped()
          details
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
            .padding(.top, 4)
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
    .overlay(alignment: .topLeading) {
      Text(document.content.name)
        .font(Theme.roundedBody(12))
        .foregroundStyle(Theme.shadowRock)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Theme.tape)
        .fixedSize(horizontal: true, vertical: false)
        .rotationEffect(.degrees(-2))
        .offset(x: -8, y: 10)
        .lineLimit(1)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 4) {
      if grid {
        if !document.content.grade.isEmpty {
          Text(document.content.grade).font(.subheadline)
        }
      } else {
        Text(document.content.name).font(Theme.roundedHeadline(16)).lineLimit(2)
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
