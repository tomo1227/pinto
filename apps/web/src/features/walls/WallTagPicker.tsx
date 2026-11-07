import {
  WALL_POST_TAG_CATEGORIES,
  WALL_POST_TAG_LABELS,
  WALL_POST_TAGS,
  type WallPostTags,
} from "@pinto/shared";

export function WallTagPicker({
  tags,
  onChange,
}: {
  tags: WallPostTags;
  onChange: (tags: WallPostTags) => void;
}) {
  return (
    <div className="wall-tag-groups">
      {WALL_POST_TAG_CATEGORIES.map((category) => {
        const selected: readonly string[] = tags[category];
        return (
          <fieldset className="wall-tag-group" key={category}>
            <legend>{WALL_POST_TAG_LABELS[category]}</legend>
            <div className="wall-tag-options">
              {WALL_POST_TAGS[category].map((tag) => (
                <label className="wall-tag-option" key={tag}>
                  <input
                    type="checkbox"
                    checked={selected.includes(tag)}
                    onChange={(event) => {
                      const next = event.currentTarget.checked
                        ? [...selected, tag]
                        : selected.filter((item) => item !== tag);
                      onChange({ ...tags, [category]: next } as WallPostTags);
                    }}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
