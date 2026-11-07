import { describe, expect, it } from "vitest";
import { defaultCruxDisplayOptions, parseCruxDisplayOptions } from "./display-options";

describe("parseCruxDisplayOptions", () => {
  it("uses defaults when no settings have been saved", () => {
    expect(parseCruxDisplayOptions(null)).toEqual(defaultCruxDisplayOptions);
  });

  it("restores and merges saved display settings with defaults", () => {
    expect(parseCruxDisplayOptions('{"showVideo":false,"skeletonOpacity":0.4}')).toEqual({
      ...defaultCruxDisplayOptions,
      showVideo: false,
      skeletonOpacity: 0.4,
    });
  });

  it("restores individual joint visibility while keeping other points enabled", () => {
    expect(
      parseCruxDisplayOptions('{"jointVisibility":{"leftElbow":false}}').jointVisibility,
    ).toEqual({ leftElbow: false });
  });

  it("rejects invalid colors and opacity values", () => {
    expect(() => parseCruxDisplayOptions('{"jointColor":"red"}')).toThrow();
    expect(() => parseCruxDisplayOptions('{"skeletonOpacity":2}')).toThrow();
    expect(() => parseCruxDisplayOptions('{"jointVisibility":{"leftElbow":"hidden"}}')).toThrow();
  });
});
