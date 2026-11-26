import Foundation

enum UserManual {
  struct Block: Identifiable {
    let id: Int
    var text: AttributedString
    let headingLevel: Int?
    let listMarker: String?
  }

  struct Entry: Identifiable {
    let block: Block
    let children: [Entry]

    var id: Int { block.id }
  }

  static func outline(from blocks: [Block]) -> [Entry] {
    var index = blocks.startIndex

    func entries(below level: Int) -> [Entry] {
      var result: [Entry] = []
      while index < blocks.endIndex {
        let block = blocks[index]
        if let heading = block.headingLevel, heading <= level { break }
        index += 1
        let children: [Entry]
        if let heading = block.headingLevel, heading > 1 {
          children = entries(below: heading)
        } else {
          children = []
        }
        result.append(Entry(block: block, children: children))
      }
      return result
    }

    return entries(below: 0)
  }

  static func load(bundle: Bundle = .main) throws -> [Block] {
    guard let url = bundle.url(forResource: "USER_GUIDE", withExtension: "md") else {
      throw CocoaError(.fileReadNoSuchFile)
    }
    return try blocks(markdown: String(contentsOf: url, encoding: .utf8))
  }

  static func blocks(markdown: String) throws -> [Block] {
    let parsed = try AttributedString(markdown: markdown)
    var blocks: [Block] = []
    for run in parsed.runs {
      guard let intent = run.presentationIntent, let metadata = BlockMetadata(intent) else {
        continue
      }
      let text = AttributedString(parsed[run.range])
      if blocks.last?.id == metadata.id {
        blocks[blocks.count - 1].text.append(text)
      } else {
        blocks.append(
          Block(
            id: metadata.id, text: text, headingLevel: metadata.headingLevel,
            listMarker: metadata.listMarker))
      }
    }
    guard !blocks.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
    return blocks
  }

  private struct BlockMetadata {
    let id: Int
    let headingLevel: Int?
    let listMarker: String?

    init?(_ intent: PresentationIntent) {
      var identity: Int?
      var heading: Int?
      var ordinal: Int?
      var ordered = false
      for component in intent.components {
        switch component.kind {
        case .header(let level):
          identity = component.identity
          heading = level
        case .paragraph:
          identity = component.identity
        case .listItem(let number):
          ordinal = number
        case .orderedList:
          ordered = true
        default: break
        }
      }
      guard let identity else { return nil }
      id = identity
      headingLevel = heading
      listMarker = ordinal.map { ordered ? "\($0)." : "\u{2022}" }
    }
  }
}
