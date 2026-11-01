import type { Route as ClimbingRoute, Hold, Point } from "@pinto/shared";

export type Viewport = { zoom: number; panX: number; panY: number };
export type CanvasScene = {
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  holds: Hold[];
  route?: ClimbingRoute;
  selectedHoldId?: string | null;
  showLines?: boolean;
  viewport: Viewport;
};
export type ImageRect = { x: number; y: number; width: number; height: number; scale: number };

export function getImageRect(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  viewport: Viewport,
): ImageRect {
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight) * viewport.zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (canvasWidth - width) / 2 + viewport.panX,
    y: (canvasHeight - height) / 2 + viewport.panY,
    width,
    height,
    scale,
  };
}

export function canvasToNormalized(point: Point, rect: ImageRect): Point | null {
  const x = (point.x - rect.x) / rect.width;
  const y = (point.y - rect.y) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function normalizedToCanvas(point: Point, rect: ImageRect): Point {
  return { x: rect.x + point.x * rect.width, y: rect.y + point.y * rect.height };
}

export function hitTestHold(
  point: Point,
  holds: Hold[],
  rect: ImageRect,
  radius = 24,
): Hold | undefined {
  return [...holds].reverse().find((hold) => {
    const center = normalizedToCanvas(hold.position, rect);
    return Math.hypot(center.x - point.x, center.y - point.y) <= radius;
  });
}

export function drawScene(
  context: CanvasRenderingContext2D,
  scene: CanvasScene,
  width: number,
  height: number,
): void {
  const {
    image,
    imageWidth,
    imageHeight,
    holds,
    route,
    selectedHoldId,
    showLines = true,
    viewport,
  } = scene;
  const rect = getImageRect(width, height, imageWidth, imageHeight, viewport);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#e9e8e1";
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);

  const holdsById = new Map(holds.map((hold) => [hold.id, hold]));
  const routeHolds =
    route?.holdIds.map((id) => holdsById.get(id)).filter((hold): hold is Hold => Boolean(hold)) ??
    [];
  if (showLines && routeHolds.length > 1) {
    context.beginPath();
    routeHolds.forEach((hold, index) => {
      const point = normalizedToCanvas(hold.position, rect);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = "#f2d13d";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = "rgba(25, 30, 25, .65)";
    context.shadowBlur = 5;
    context.stroke();
    context.shadowBlur = 0;
  }

  holds.forEach((hold) => {
    const point = normalizedToCanvas(hold.position, rect);
    const routeIndex = route?.holdIds.indexOf(hold.id) ?? -1;
    const isInRoute = routeIndex >= 0;
    const isSelected = selectedHoldId === hold.id;
    const isStart = route?.startHoldIds.includes(hold.id) ?? false;
    const isFinish = route?.finishHoldIds.includes(hold.id) ?? false;
    const radius = isSelected ? 15 : 12;
    context.beginPath();
    if (isFinish) {
      context.moveTo(point.x, point.y - radius);
      context.lineTo(point.x + radius, point.y);
      context.lineTo(point.x, point.y + radius);
      context.lineTo(point.x - radius, point.y);
      context.closePath();
    } else {
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = isStart
      ? "#79c7a2"
      : isFinish
        ? "#ee795a"
        : isInRoute
          ? "#f2d13d"
          : "#f7f6ef";
    context.strokeStyle = isInRoute || isSelected ? "#202522" : "#49534e";
    context.lineWidth = isSelected ? 3 : 2;
    context.fill();
    context.stroke();
    if (isInRoute) {
      context.fillStyle = "#202522";
      context.font = '700 11px "DM Sans", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(routeIndex + 1), point.x, point.y + 0.5);
    }
  });
  context.restore();
}
