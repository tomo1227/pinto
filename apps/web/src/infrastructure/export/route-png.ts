import type { Route as ClimbingRoute, Hold } from "@pinto/shared";
import { drawScene } from "../../features/editor/canvas-engine";

type RoutePngOptions = {
  imageScale?: number;
  showLines?: boolean;
  allowEllipses?: boolean;
};

export async function exportRoutePng(
  imageBlob: Blob,
  width: number,
  height: number,
  holds: Hold[],
  route: ClimbingRoute,
  { imageScale = 1, showLines, allowEllipses }: RoutePngOptions = {},
): Promise<Blob> {
  if (!Number.isFinite(imageScale) || imageScale <= 0) {
    throw new Error("画像の描画倍率が不正です。");
  }
  const image = await createImageBitmap(imageBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG canvas is unavailable.");
    // Render in the editor's coordinate space, then scale to the original image resolution.
    context.setTransform(1 / imageScale, 0, 0, 1 / imageScale, 0, 0);
    drawScene(
      context,
      {
        image,
        imageWidth: width,
        imageHeight: height,
        holds,
        route,
        showLines,
        allowEllipses,
        viewport: { zoom: 1, panX: 0, panY: 0 },
      },
      width * imageScale,
      height * imageScale,
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNGの作成に失敗しました。"))),
        "image/png",
      );
    });
  } finally {
    image.close();
  }
}
