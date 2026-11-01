import type { Hold } from "@pinto/shared";
import { describe, expect, it } from "vitest";
import { canvasToNormalized, getImageRect, hitTestHold, normalizedToCanvas } from "./canvas-engine";

const hold: Hold = {
  id: "hold-1",
  wallId: "wall-1",
  position: { x: 0.5, y: 0.5 },
  detectionSource: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const rect = getImageRect(1000, 800, 400, 400, { zoom: 1, panX: 0, panY: 0 });

describe("canvas coordinate engine", () => {
  it("preserves image aspect ratio and transforms between viewport and normalized space", () => {
    expect(rect).toEqual({ x: 100, y: 0, width: 800, height: 800, scale: 2 });
    const center = normalizedToCanvas({ x: 0.5, y: 0.5 }, rect);
    expect(center).toEqual({ x: 500, y: 400 });
    expect(canvasToNormalized(center, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(canvasToNormalized({ x: 30, y: 300 }, rect)).toBeNull();
  });

  it("hit-tests markers in view coordinates", () => {
    expect(hitTestHold({ x: 503, y: 400 }, [hold], rect)?.id).toBe("hold-1");
    expect(hitTestHold({ x: 800, y: 400 }, [hold], rect)).toBeUndefined();
  });
});
