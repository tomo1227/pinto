import type { Hold, Route } from "@pinto/shared";
import { describe, expect, it, vi } from "vitest";
import {
  canvasToNormalized,
  drawScene,
  getImageRect,
  hitTestHold,
  normalizedToCanvas,
} from "./canvas-engine";

const hold: Hold = {
  id: "hold-1",
  wallId: "wall-1",
  position: { x: 0.5, y: 0.5 },
  detectionSource: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const rect = getImageRect(1000, 800, 400, 400, { zoom: 1, panX: 0, panY: 0 });
const route: Route = {
  id: "route-1",
  wallId: "wall-1",
  name: "Test route",
  holdIds: [hold.id],
  startHoldIds: [hold.id],
  finishHoldIds: [],
  source: "manual",
  createdAt: hold.createdAt,
  updatedAt: hold.updatedAt,
};
const nextHold: Hold = { ...hold, id: "hold-2", position: { x: 0.8, y: 0.8 } };

function createCanvasContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

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

  it("draws route circles as transparent outlines with their sequence number", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [hold],
        route,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.fill).not.toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fillText).toHaveBeenCalledWith("1", 50, 50.5);
    expect(context.strokeStyle).toBe("#79c7a2");
  });

  it("draws a high-contrast line between consecutive route holds", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [hold, nextHold],
        route: { ...route, holdIds: [hold.id, nextHold.id] },
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.lineTo).toHaveBeenCalledWith(80, 80);
    expect(context.stroke).toHaveBeenCalledTimes(4);
  });
});
