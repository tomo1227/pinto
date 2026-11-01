import { describe, expect, it } from "vitest";
import { normalizedToPixel, pixelToNormalized } from "./coordinates";

describe("normalized image coordinates", () => {
  it("converts between normalized and source-image coordinates", () => {
    const pixel = normalizedToPixel({ x: 0.25, y: 0.75 }, 1200, 800);
    expect(pixel).toEqual({ x: 300, y: 600 });
    expect(pixelToNormalized(pixel, 1200, 800)).toEqual({ x: 0.25, y: 0.75 });
  });

  it("clamps pointer values and rejects invalid dimensions", () => {
    expect(pixelToNormalized({ x: 150, y: -2 }, 100, 100)).toEqual({ x: 1, y: 0 });
    expect(() => pixelToNormalized({ x: 0, y: 0 }, 0, 100)).toThrow(RangeError);
  });
});
