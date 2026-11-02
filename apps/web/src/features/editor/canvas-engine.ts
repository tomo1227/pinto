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
  allowEllipses?: boolean;
  viewport: Viewport;
};
export type ImageRect = { x: number; y: number; width: number; height: number; scale: number };
export type HoldResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type HoldMarkerGeometry = {
  center: Point;
  radiusX: number;
  radiusY: number;
  outlineRadiusX: number;
  outlineRadiusY: number;
};

const resizeHandleDirections: Record<HoldResizeHandle, Point> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

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
  imageWidth?: number,
  imageHeight?: number,
  allowEllipses = true,
): Hold | undefined {
  return [...holds].reverse().find((hold) => {
    if (imageWidth !== undefined && imageHeight !== undefined) {
      const geometry = getHoldMarkerGeometry(
        hold,
        imageWidth,
        imageHeight,
        rect,
        false,
        allowEllipses,
      );
      const normalizedX = (point.x - geometry.center.x) / (geometry.outlineRadiusX + 8);
      const normalizedY = (point.y - geometry.center.y) / (geometry.outlineRadiusY + 8);
      return normalizedX ** 2 + normalizedY ** 2 <= 1;
    }
    const center = normalizedToCanvas(hold.position, rect);
    return Math.hypot(center.x - point.x, center.y - point.y) <= radius;
  });
}

export function getHoldMarkerGeometry(
  hold: Hold,
  imageWidth: number,
  imageHeight: number,
  rect: ImageRect,
  isSelected = false,
  allowEllipses = true,
): HoldMarkerGeometry {
  const center = normalizedToCanvas(hold.position, rect);
  const lineWidth = hold.markerWidth ?? (isSelected ? 3 : 2);
  const markerScaleX = allowEllipses ? (hold.markerScaleX ?? 1) : 1;
  const markerScaleY = allowEllipses ? (hold.markerScaleY ?? 1) : 1;
  const boundsRadius = hold.bounds
    ? (Math.max(hold.bounds.width * imageWidth, hold.bounds.height * imageHeight) * rect.scale) / 2
    : undefined;
  const radius = hold.markerRadius
    ? Math.max(1, hold.markerRadius * rect.scale)
    : !allowEllipses && boundsRadius !== undefined
      ? boundsRadius
      : isSelected
        ? 15
        : 12;
  let radiusX = radius * markerScaleX;
  let radiusY = radius * markerScaleY;

  if (allowEllipses && hold.shape?.type === "ellipse" && hold.bounds) {
    const baseRadius =
      Math.max(hold.bounds.width * imageWidth, hold.bounds.height * imageHeight) / 2;
    const markerScale = hold.markerRadius && baseRadius > 0 ? hold.markerRadius / baseRadius : 1;
    radiusX =
      (hold.bounds.width * imageWidth * rect.scale * markerScale * markerScaleX) / 2 +
      lineWidth / 2;
    radiusY =
      (hold.bounds.height * imageHeight * rect.scale * markerScale * markerScaleY) / 2 +
      lineWidth / 2;
  } else if (markerScaleX !== 1 || markerScaleY !== 1 || (!allowEllipses && hold.bounds)) {
    radiusX += lineWidth / 2;
    radiusY += lineWidth / 2;
  } else if (hold.shape?.type === "point" && hold.bounds) {
    radiusX += lineWidth / 2;
    radiusY += lineWidth / 2;
  }

  return {
    center,
    radiusX,
    radiusY,
    outlineRadiusX: radiusX + lineWidth / 2,
    outlineRadiusY: radiusY + lineWidth / 2,
  };
}

export function getResizeHandleAt(
  point: Point,
  geometry: HoldMarkerGeometry,
  tolerance = 12,
): HoldResizeHandle | undefined {
  const frameRadiusX = geometry.outlineRadiusX + 6;
  const frameRadiusY = geometry.outlineRadiusY + 6;
  for (const [handle, direction] of Object.entries(resizeHandleDirections) as [
    HoldResizeHandle,
    Point,
  ][]) {
    const handleX = geometry.center.x + direction.x * frameRadiusX;
    const handleY = geometry.center.y + direction.y * frameRadiusY;
    if (Math.hypot(point.x - handleX, point.y - handleY) <= tolerance) return handle;
  }
  return undefined;
}

export function isInsideHoldMarker(point: Point, geometry: HoldMarkerGeometry): boolean {
  return (
    Math.abs(point.x - geometry.center.x) <= geometry.outlineRadiusX &&
    Math.abs(point.y - geometry.center.y) <= geometry.outlineRadiusY
  );
}

function drawSelectionFrame(context: CanvasRenderingContext2D, geometry: HoldMarkerGeometry): void {
  const frameRadiusX = geometry.outlineRadiusX + 6;
  const frameRadiusY = geometry.outlineRadiusY + 6;
  const left = geometry.center.x - frameRadiusX;
  const top = geometry.center.y - frameRadiusY;
  const width = frameRadiusX * 2;
  const height = frameRadiusY * 2;
  const handleSize = 8;

  context.save();
  context.strokeStyle = "#1673e6";
  context.lineWidth = 1;
  context.strokeRect(left, top, width, height);
  for (const direction of Object.values(resizeHandleDirections)) {
    const handleX = geometry.center.x + direction.x * frameRadiusX;
    const handleY = geometry.center.y + direction.y * frameRadiusY;
    context.fillStyle = "#ffffff";
    context.fillRect(handleX - handleSize / 2, handleY - handleSize / 2, handleSize, handleSize);
    context.strokeRect(handleX - handleSize / 2, handleY - handleSize / 2, handleSize, handleSize);
  }
  context.restore();
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
    allowEllipses = true,
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
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = "rgba(25, 30, 25, .65)";
    context.shadowBlur = 5;
    context.strokeStyle = "#202522";
    context.lineWidth = 8;
    context.stroke();
    context.strokeStyle = "#f2d13d";
    context.lineWidth = 4;
    context.stroke();
    context.shadowBlur = 0;
  }

  holds.forEach((hold) => {
    const routeIndex = route?.holdIds.indexOf(hold.id) ?? -1;
    const isInRoute = routeIndex >= 0;
    const isSelected = selectedHoldId === hold.id;
    const isStart = route?.startHoldIds.includes(hold.id) ?? false;
    const isFinish = route?.finishHoldIds.includes(hold.id) ?? false;
    const geometry = getHoldMarkerGeometry(
      hold,
      imageWidth,
      imageHeight,
      rect,
      isSelected,
      allowEllipses,
    );
    const point = geometry.center;
    const lineWidth = hold.markerWidth ?? (isSelected ? 3 : 2);
    const radius = hold.markerRadius
      ? Math.max(1, hold.markerRadius * rect.scale)
      : isSelected
        ? 15
        : 12;
    const markerScaleX = allowEllipses ? (hold.markerScaleX ?? 1) : 1;
    const markerScaleY = allowEllipses ? (hold.markerScaleY ?? 1) : 1;
    context.beginPath();
    if (isFinish) {
      context.moveTo(point.x, point.y - radius * markerScaleY);
      context.lineTo(point.x + radius * markerScaleX, point.y);
      context.lineTo(point.x, point.y + radius * markerScaleY);
      context.lineTo(point.x - radius * markerScaleX, point.y);
      context.closePath();
    } else if (allowEllipses && hold.shape?.type === "ellipse" && hold.bounds) {
      const baseRadius =
        Math.max(hold.bounds.width * imageWidth, hold.bounds.height * imageHeight) / 2;
      const markerScale = hold.markerRadius && baseRadius > 0 ? hold.markerRadius / baseRadius : 1;
      context.ellipse(
        point.x,
        point.y,
        (hold.bounds.width * imageWidth * rect.scale * markerScale * markerScaleX) / 2 +
          lineWidth / 2,
        (hold.bounds.height * imageHeight * rect.scale * markerScale * markerScaleY) / 2 +
          lineWidth / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else if (markerScaleX !== 1 || markerScaleY !== 1 || (!allowEllipses && hold.bounds)) {
      context.ellipse(
        point.x,
        point.y,
        radius * markerScaleX + lineWidth / 2,
        radius * markerScaleY + lineWidth / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      context.arc(
        point.x,
        point.y,
        radius + (hold.shape?.type === "point" && hold.bounds ? lineWidth / 2 : 0),
        0,
        Math.PI * 2,
      );
    }
    if (isFinish) {
      context.fillStyle = "#ee795a";
      context.fill();
    }
    context.strokeStyle = hold.color ?? (isStart ? "#79c7a2" : isInRoute ? "#202522" : "#49534e");
    context.lineWidth = lineWidth;
    context.stroke();
    if (isInRoute) {
      context.fillStyle = "#202522";
      context.font = '700 11px "DM Sans", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(routeIndex + 1), point.x, point.y + 0.5);
    }
    if (isSelected) drawSelectionFrame(context, geometry);
  });
  context.restore();
}
