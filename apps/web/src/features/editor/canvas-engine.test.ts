import type { Hold, Route } from "@pinto/shared";
import { describe, expect, it, vi } from "vitest";
import {
  canvasToNormalized,
  drawScene,
  getImageRect,
  hitTestHold,
  normalizedToCanvas,
} from "./canvas-engine";
import { estimateHoldBounds, estimateHoldRadius } from "./hold-detection";

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
    ellipse: vi.fn(),
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

  it("estimates a hold radius from a clear color boundary", () => {
    const width = 100;
    const height = 100;
    const centerX = 50;
    const centerY = 50;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const inside = Math.hypot(x - centerX, y - centerY) <= 25;
        pixels[index] = inside ? 220 : 25;
        pixels[index + 1] = inside ? 80 : 35;
        pixels[index + 2] = inside ? 45 : 45;
        pixels[index + 3] = 255;
      }
    }

    const radius = estimateHoldRadius(pixels, width, height, centerX, centerY);

    expect(radius).toBeGreaterThan(20);
    expect(radius).toBeLessThan(30);
  });

  it("leaves radius detection empty when the image has no clear boundary", () => {
    const pixels = new Uint8ClampedArray(100 * 100 * 4).fill(80);

    expect(estimateHoldRadius(pixels, 100, 100, 50, 50)).toBeUndefined();
  });

  it("fits an off-center hold without arbitrary padding", () => {
    const width = 120;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const inside = ((x - 60) / 24) ** 2 + ((y - 50) / 14) ** 2 <= 1;
        pixels[index] = inside ? 225 : 70;
        pixels[index + 1] = inside ? 55 : 80;
        pixels[index + 2] = inside ? 35 : 85;
        pixels[index + 3] = 255;
      }
    }

    const outline = estimateHoldBounds(pixels, width, height, 68, 50);
    const bounds = outline?.bounds;

    expect(bounds).toBeDefined();
    expect(bounds?.width).toBeLessThan(56);
    expect(outline?.circleRadius).toBeGreaterThan(23);
    expect(bounds?.x).toBeLessThan(36);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeGreaterThan(84);
    expect(bounds?.y).toBeLessThan(36);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeGreaterThan(64);
    if (bounds) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4] !== 225) continue;
          const ellipseDistance =
            ((x - centerX) / (bounds.width / 2)) ** 2 + ((y - centerY) / (bounds.height / 2)) ** 2;
          expect(ellipseDistance).toBeLessThanOrEqual(1);
        }
      }
    }
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

  it("uses each hold's custom marker size, width, and color", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [{ ...hold, markerRadius: 20, markerWidth: 5, color: "#ff0000" }],
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.arc).toHaveBeenCalledWith(50, 50, 5, 0, Math.PI * 2);
    expect(context.strokeStyle).toBe("#ff0000");
    expect(context.lineWidth).toBe(5);
  });

  it("draws detected hold bounds as an ellipse", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [
          {
            ...hold,
            markerRadius: 40,
            bounds: { x: 0.4, y: 0.45, width: 0.2, height: 0.1 },
            shape: { type: "ellipse" },
          },
        ],
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.ellipse).toHaveBeenCalledWith(50, 50, 11, 6, 0, 0, Math.PI * 2);
  });

  it("keeps a detected circular outline outside its fitted radius", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [
          {
            ...hold,
            markerRadius: 20,
            bounds: { x: 0.45, y: 0.45, width: 0.1, height: 0.1 },
            shape: { type: "point" },
          },
        ],
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.arc).toHaveBeenCalledWith(50, 50, 6, 0, Math.PI * 2);
  });

  it("keeps a legacy hold's color stable when selected", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [hold],
        selectedHoldId: hold.id,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.strokeStyle).toBe("#49534e");
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
