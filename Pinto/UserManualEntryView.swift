import SwiftUI

@MainActor
struct UserManualEntryView: View {
  let entry: UserManual.Entry
  @Binding var expandedHeadings: Set<Int>

  var body: some View {
    if entry.children.isEmpty {
      row.textSelection(.enabled)
    } else {
      DisclosureGroup(isExpanded: isExpanded) {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(entry.children) { child in
            UserManualEntryView(entry: child, expandedHeadings: $expandedHeadings)
          }
        }
        .padding(.top, 8)
      } label: {
        row.foregroundStyle(.primary)
      }
    }
  }

  private var isExpanded: Binding<Bool> {
    Binding(
      get: { expandedHeadings.contains(entry.id) },
      set: { expanded in
        if expanded {
          expandedHeadings.insert(entry.id)
        } else {
          expandedHeadings.remove(entry.id)
        }
      })
  }

  private var row: some View {
    let block = entry.block
    return HStack(alignment: .firstTextBaseline, spacing: 8) {
      if let marker = block.listMarker {
        Text(marker)
          .accessibilityHidden(true)
      }
      Text(block.text)
        .font(font(for: block.headingLevel))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(block.headingLevel == nil ? [] : .isHeader)
    }
    .padding(.leading, block.listMarker == nil ? 0 : 8)
  }

  private func font(for headingLevel: Int?) -> Font {
    switch headingLevel {
    case 1: return .title2.bold()
    case 2: return .title3.bold()
    case .some: return .headline
    case nil: return .body
    }
  }
}
