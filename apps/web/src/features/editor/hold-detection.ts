import type { Point } from "@pinto/shared";

type Color = [number, number, number];

function averageColorAt(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Color {
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  const total: Color = [0, 0, 0];
  let samples = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sampleX = centerX + offsetX;
      const sampleY = centerY + offsetY;
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
      const index = (sampleY * width + sampleX) * 4;
      total[0] += pixels[index];
      total[1] += pixels[index + 1];
      total[2] += pixels[index + 2];
      samples += 1;
    }
  }
  return [total[0] / samples, total[1] / samples, total[2] / samples];
}

function colorDistance(first: Color, second: Color): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export type DetectedHoldOutline = {
  position: Point;
  bounds: { x: number; y: number; width: number; height: number };
  markerRadius: number;
};

export function estimateHoldBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const backgroundSamples: Color[] = [];
  for (let x = 2; x < width - 2; x += 4) {
    backgroundSamples.push(averageColorAt(pixels, width, height, x, 1));
    backgroundSamples.push(averageColorAt(pixels, width, height, x, height - 2));
  }
  for (let y = 2; y < height - 2; y += 4) {
    backgroundSamples.push(averageColorAt(pixels, width, height, 1, y));
    backgroundSamples.push(averageColorAt(pixels, width, height, width - 2, y));
  }
  if (backgroundSamples.length === 0) return undefined;

  const seedColor = averageColorAt(pixels, width, height, seedX, seedY);
  const background: Color = [0, 1, 2].map((channel) =>
    median(backgroundSamples.map((sample) => sample[channel])),
  ) as Color;
  const separation = colorDistance(seedColor, background);
  if (separation < 28) return undefined;

  const colorLimit = Math.min(112, Math.max(28, separation * 0.72));
  const margin = Math.max(8, separation * 0.08);
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const seedIndex = Math.round(seedY) * width + Math.round(seedX);
  let head = 0;
  let tail = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  const isHoldPixel = (index: number) => {
    const color: Color = [pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]];
    return (
      colorDistance(color, seedColor) <= colorLimit &&
      colorDistance(color, seedColor) + margin < colorDistance(color, background)
    );
  };

  if (!isHoldPixel(seedIndex)) return undefined;
  visited[seedIndex] = 1;
  queue[tail] = seedIndex;
  tail += 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    const neighbors = [index - 1, index + 1, index - width, index + width];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= total || visited[neighbor]) continue;
      const neighborX = neighbor % width;
      if (Math.abs(neighborX - x) > 1 || !isHoldPixel(neighbor)) continue;
      visited[neighbor] = 1;
      queue[tail] = neighbor;
      tail += 1;
      if (tail > total * 0.3) return undefined;
    }
  }

  const componentWidth = maxX - minX + 1;
  const componentHeight = maxY - minY + 1;
  if (
    tail < Math.max(24, total * 0.0003) ||
    componentWidth < 8 ||
    componentHeight < 8 ||
    minX <= 1 ||
    minY <= 1 ||
    maxX >= width - 2 ||
    maxY >= height - 2
  ) {
    return undefined;
  }

  const padding = Math.max(3, Math.round(Math.max(componentWidth, componentHeight) * 0.08));
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function detectHoldOutline(
  image: CanvasImageSource,
  position: Point,
  imageWidth: number,
  imageHeight: number,
): DetectedHoldOutline | undefined {
  try {
    const size = Math.min(320, imageWidth, imageHeight);
    if (size < 32) return undefined;
    const centerX = Math.min(imageWidth - 1, Math.max(0, position.x * imageWidth));
    const centerY = Math.min(imageHeight - 1, Math.max(0, position.y * imageHeight));
    const left = Math.min(imageWidth - size, Math.max(0, Math.round(centerX - size / 2)));
    const top = Math.min(imageHeight - size, Math.max(0, Math.round(centerY - size / 2)));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, left, top, size, size, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const localBounds = estimateHoldBounds(pixels, size, size, centerX - left, centerY - top);
    if (!localBounds) return undefined;

    const bounds = {
      x: (left + localBounds.x) / imageWidth,
      y: (top + localBounds.y) / imageHeight,
      width: localBounds.width / imageWidth,
      height: localBounds.height / imageHeight,
    };
    return {
      position: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      bounds,
      markerRadius: Math.max(bounds.width * imageWidth, bounds.height * imageHeight) / 2,
    };
  } catch {
    return undefined;
  }
}

export function estimateHoldRadius(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): number | undefined {
  const maxRadius = Math.min(128, centerX, width - centerX - 1, centerY, height - centerY - 1);
  if (maxRadius < 20) return undefined;

  const edgeRadii: number[] = [];
  const directions = 48;
  for (let direction = 0; direction < directions; direction += 1) {
    const angle = (direction / directions) * Math.PI * 2;
    const deltaX = Math.cos(angle);
    const deltaY = Math.sin(angle);
    for (let radius = 10; radius <= maxRadius - 4; radius += 2) {
      const inner = averageColorAt(
        pixels,
        width,
        height,
        centerX + deltaX * (radius - 3),
        centerY + deltaY * (radius - 3),
      );
      const outer = averageColorAt(
        pixels,
        width,
        height,
        centerX + deltaX * (radius + 3),
        centerY + deltaY * (radius + 3),
      );
      if (colorDistance(inner, outer) > 48) {
        edgeRadii.push(radius);
        break;
      }
    }
  }

  if (edgeRadii.length < directions * 0.6) return undefined;
  const radius = median(edgeRadii);
  const deviations = edgeRadii.map((edgeRadius) => Math.abs(edgeRadius - radius));
  if (median(deviations) > Math.max(10, radius * 0.45)) return undefined;
  return radius;
}

export function detectHoldRadius(
  image: CanvasImageSource,
  position: Point,
  imageWidth: number,
  imageHeight: number,
): number | undefined {
  try {
    const size = Math.min(320, imageWidth, imageHeight);
    const centerX = Math.min(imageWidth - 1, Math.max(0, position.x * imageWidth));
    const centerY = Math.min(imageHeight - 1, Math.max(0, position.y * imageHeight));
    const left = Math.min(imageWidth - size, Math.max(0, Math.round(centerX - size / 2)));
    const top = Math.min(imageHeight - size, Math.max(0, Math.round(centerY - size / 2)));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, left, top, size, size, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    return estimateHoldRadius(pixels, size, size, centerX - left, centerY - top);
  } catch {
    return undefined;
  }
}
