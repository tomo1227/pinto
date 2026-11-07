import type { Route } from "@pinto/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawScene } from "../../features/editor/canvas-engine";
import { exportRoutePng } from "./route-png";

vi.mock("../../features/editor/canvas-engine", () => ({ drawScene: vi.fn() }));

const route: Route = {
  id: "route",
  wallId: "wall",
  name: "Test",
  holdIds: [],
  startHoldIds: [],
  finishHoldIds: [],
  source: "manual",
  createdAt: "",
  updatedAt: "",
};

describe("route PNG export", () => {
  const bitmap = { close: vi.fn() };
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
  let canvas: HTMLCanvasElement;
  const png = new Blob(["png"], { type: "image/png" });

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement("canvas");
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(png));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([0.15, 0.5, 2])("preserves editor annotation sizes at image scale %s", async (scale) => {
    await expect(
      exportRoutePng(new Blob(), 2400, 1600, [], route, { imageScale: scale }),
    ).resolves.toBe(png);
    expect(context.setTransform).toHaveBeenNthCalledWith(1, 1 / scale, 0, 0, 1 / scale, 0, 0);
    expect(drawScene).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ imageWidth: 2400, imageHeight: 1600, route }),
      2400 * scale,
      1600 * scale,
    );
    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1600);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.setTransform).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("keeps the original dimensions without adding a title or footer", async () => {
    await exportRoutePng(new Blob(), 2400, 1600, [], route, {
      imageScale: 0.2,
      showLines: false,
      allowEllipses: false,
    });
    expect(canvas.height).toBe(1600);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(drawScene).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ showLines: false, allowEllipses: false }),
      480,
      320,
    );
  });

  it("releases the bitmap when PNG encoding fails", async () => {
    vi.mocked(canvas.toBlob).mockImplementation((callback) => callback(null));
    await expect(exportRoutePng(new Blob(), 400, 400, [], route)).rejects.toThrow(
      "PNGの作成に失敗しました。",
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid image scale %s",
    async (imageScale) => {
      await expect(exportRoutePng(new Blob(), 400, 400, [], route, { imageScale })).rejects.toThrow(
        "画像の描画倍率が不正です。",
      );
      expect(createImageBitmap).not.toHaveBeenCalled();
    },
  );
});
