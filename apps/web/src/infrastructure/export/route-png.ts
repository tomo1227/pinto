import type { Route as ClimbingRoute, Hold } from "@pinto/shared";
import { drawScene } from "../../features/editor/canvas-engine";

export async function exportRoutePng(
  imageBlob: Blob,
  width: number,
  height: number,
  holds: Hold[],
  route: ClimbingRoute,
): Promise<Blob> {
  const image = await createImageBitmap(imageBlob);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG canvas is unavailable.");
  drawScene(
    context,
    {
      image,
      imageWidth: width,
      imageHeight: height,
      holds,
      route,
      viewport: { zoom: 1, panX: 0, panY: 0 },
    },
    width,
    height,
  );
  context.fillStyle = "rgba(25, 31, 27, 0.78)";
  context.fillRect(0, height - 90, width, 90);
  context.fillStyle = "#fff";
  context.font = '700 32px "DM Sans", sans-serif';
  context.textBaseline = "middle";
  context.fillText(`${route.name}${route.grade ? `  ·  ${route.grade}` : ""}`, 32, height - 45);
  image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNGの作成に失敗しました。"))),
      "image/png",
    );
  });
}
