import type { Point } from "@pinto/shared";

export function normalizedToPixel(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: point.y * height };
}

export function pixelToNormalized(point: Point, width: number, height: number): Point {
  if (width <= 0 || height <= 0) throw new RangeError("Image dimensions must be positive.");
  return {
    x: Math.min(1, Math.max(0, point.x / width)),
    y: Math.min(1, Math.max(0, point.y / height)),
  };
}
