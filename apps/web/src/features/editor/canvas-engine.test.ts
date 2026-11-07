import type { Hold, Route } from "@pinto/shared";
import { describe, expect, it, vi } from "vitest";
import {
  canvasToNormalized,
  drawScene,
  getHoldMarkerGeometry,
  getImageRect,
  getResizeHandleAt,
  getRouteTextGeometry,
  getRouteTextResizeHandleAt,
  hitTestHold,
  hitTestRouteText,
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
    strokeRect: vi.fn(),
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
    strokeText: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("canvas coordinate engine", () => {
  it("draws custom line and marker widths with an outer outline", () => {
    const context = createCanvasContext();
    const strokes: { width: number; color: string | CanvasGradient | CanvasPattern }[] = [];
    vi.mocked(context.stroke).mockImplementation(() => {
      strokes.push({ width: context.lineWidth, color: context.strokeStyle });
    });
    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [
          { ...hold, color: "#2589C7", markerWidth: 6, outlineWidth: 3, outlineColor: "#FFFEFA" },
          nextHold,
        ],
        route: {
          ...route,
          holdIds: [hold.id, nextHold.id],
          lineWidth: 10,
          lineColor: "#E55050",
          lineOutlineWidth: 4,
          lineOutlineColor: "#202522",
        },
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );
    expect(strokes).toEqual([
      { width: 18, color: "#202522" },
      { width: 10, color: "#E55050" },
      { width: 12, color: "#FFFEFA" },
      { width: 6, color: "#2589C7" },
      { width: 2, color: "#202522" },
    ]);
    const geometry = getHoldMarkerGeometry(
      { ...hold, markerWidth: 6, outlineWidth: 3 },
      400,
      400,
      rect,
    );
    expect(geometry.outlineRadiusX).toBe(18);
    expect(
      hitTestHold(
        { x: 525, y: 400 },
        [{ ...hold, markerWidth: 6, outlineWidth: 3 }],
        rect,
        24,
        400,
        400,
      ),
    ).toEqual(expect.objectContaining({ id: hold.id }));
  });

  it("draws text in its saved font and weight with an outline before its fill", () => {
    const context = createCanvasContext();
    const draws: string[] = [];
    vi.mocked(context.strokeText).mockImplementation(() => {
      draws.push("outline");
      expect(context.lineWidth).toBe(6);
      expect(context.strokeStyle).toBe("#FFFEFA");
    });
    vi.mocked(context.fillText).mockImplementation(() => draws.push("fill"));
    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [],
        route: {
          ...route,
          holdIds: [],
          textAnnotations: [
            {
              id: "text-1",
              text: "Text",
              position: hold.position,
              fontFamily: "serif",
              fontWeight: 900,
              outlineWidth: 3,
              outlineColor: "#FFFEFA",
            },
          ],
        },
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );
    expect(context.font).toBe("900 14px serif");
    expect(draws).toEqual(["outline", "fill"]);
  });

  it("disables line outlines at zero and preserves legacy text styling", () => {
    const context = createCanvasContext();
    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [hold, nextHold],
        route: {
          ...route,
          holdIds: [hold.id, nextHold.id],
          lineOutlineWidth: 0,
          textAnnotations: [{ id: "text-1", text: "Text", position: hold.position }],
        },
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );
    expect(context.stroke).toHaveBeenCalledTimes(3);
    expect(context.strokeText).not.toHaveBeenCalled();
    expect(context.font).toBe("600 14px sans-serif");
  });

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
    const enlargedHold = { ...hold, markerRadius: 60 };
    expect(hitTestHold({ x: 575, y: 400 }, [enlargedHold], rect, 24, 400, 400)?.id).toBe(
      enlargedHold.id,
    );
  });

  it("hit-tests route text in view coordinates", () => {
    const annotation = { id: "text-1", text: "Crux", position: { x: 0.25, y: 0.75 } };

    expect(hitTestRouteText({ x: 302, y: 600 }, [annotation], rect)?.id).toBe("text-1");
    expect(hitTestRouteText({ x: 95, y: 600 }, [annotation], rect)).toBeUndefined();
  });

  it("scales route text and locates its resize handles", () => {
    const annotation = {
      id: "text-1",
      text: "Crux",
      position: { x: 0.25, y: 0.75 },
      fontScale: 2,
    };
    const geometry = getRouteTextGeometry(annotation, rect);
    const bottomRight = {
      x: geometry.frame.x + geometry.frame.width,
      y: geometry.frame.y + geometry.frame.height,
    };

    expect(geometry.fontSize).toBe(96);
    expect(hitTestRouteText({ x: 500, y: 600 }, [annotation], rect)?.id).toBe(annotation.id);
    expect(getRouteTextResizeHandleAt(bottomRight, geometry)).toBe("se");
  });

  it("hit-tests the full width of Japanese route text", () => {
    const annotation = { id: "text-ja", text: "壁", position: { x: 0.25, y: 0.75 } };

    expect(hitTestRouteText({ x: 346, y: 600 }, [annotation], rect)?.id).toBe("text-ja");
  });

  it("locates resize handles on the selected marker frame", () => {
    const markerRect = getImageRect(100, 100, 400, 400, { zoom: 1, panX: 0, panY: 0 });
    const geometry = getHoldMarkerGeometry(
      { ...hold, markerRadius: 40 },
      400,
      400,
      markerRect,
      true,
    );

    expect(getResizeHandleAt({ x: 27.5, y: 50 }, geometry)).toBe("w");
    expect(getResizeHandleAt({ x: 50, y: 27.5 }, geometry)).toBe("n");
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

  it("draws text annotations attached to the active route", () => {
    const context = createCanvasContext();
    const routeWithText: Route = {
      ...route,
      textAnnotations: [
        { id: "text-1", text: "Crux", position: { x: 0.25, y: 0.75 }, color: "#ff0000" },
      ],
    };

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [],
        route: routeWithText,
        selectedTextId: "text-1",
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.fillText).toHaveBeenCalledWith("Crux", 25, 75);
    expect(context.strokeText).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledTimes(5);
    expect(context.strokeRect).toHaveBeenCalledTimes(5);
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

  it("uses a hold's custom color for its route number", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [{ ...hold, color: "#ff0000" }],
        route,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.fillText).toHaveBeenCalledWith("1", 50, 50.5);
    expect(context.fillStyle).toBe("#ff0000");
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

  it("renders every saved ellipse as a 1:1 circle when ellipse mode is off", () => {
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
            markerScaleX: 2,
            markerScaleY: 0.5,
            bounds: { x: 0.4, y: 0.45, width: 0.2, height: 0.1 },
            shape: { type: "ellipse" },
          },
        ],
        allowEllipses: false,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.ellipse).toHaveBeenCalledWith(50, 50, 11, 11, 0, 0, Math.PI * 2);
    expect(context.arc).not.toHaveBeenCalled();
  });

  it("scales a circular marker horizontally and vertically", () => {
    const context = createCanvasContext();

    drawScene(
      context,
      {
        image: {} as CanvasImageSource,
        imageWidth: 400,
        imageHeight: 400,
        holds: [{ ...hold, markerRadius: 20, markerScaleX: 2, markerScaleY: 0.5 }],
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      100,
      100,
    );

    expect(context.ellipse).toHaveBeenCalledWith(50, 50, 11, 3.5, 0, 0, Math.PI * 2);
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

  it("draws a selection frame and resize handles around a selected hold", () => {
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

    expect(context.strokeRect).toHaveBeenCalledTimes(9);
    expect(context.strokeStyle).toBe("#1673e6");
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
