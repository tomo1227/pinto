import type { Route as ClimbingRoute, Hold, Wall } from "@pinto/shared";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  canvasToNormalized,
  drawScene,
  getHoldMarkerGeometry,
  getImageRect,
  getResizeHandleAt,
  type HoldResizeHandle,
  hitTestHold,
  isInsideHoldMarker,
  type Viewport,
} from "./canvas-engine";
import { detectHoldOutline, detectHoldRadius } from "./hold-detection";

type Tool = "hold" | "route" | "pan" | "eraser";
type ResizeGesture = {
  holdId: string;
  pointerId: number;
  handle: HoldResizeHandle;
  centerX: number;
  centerY: number;
  outlineRadiusX: number;
  outlineRadiusY: number;
  scaleX: number;
  scaleY: number;
  imageScale: number;
  lineWidth: number;
  patch: Partial<Hold>;
};
type PinchGesture = {
  mode: "viewport" | "hold";
  distance: number;
  zoom: number;
  centerX: number;
  centerY: number;
  panX: number;
  panY: number;
  holdId?: string;
  initialRadius?: number;
  currentRadius?: number;
};
type Props = {
  wall: Wall;
  imageUrl: string;
  holds: Hold[];
  route?: ClimbingRoute;
  selectedHoldId: string | null;
  tool: Tool;
  showLines: boolean;
  autoDetectHolds: boolean;
  allowEllipses: boolean;
  onAddHold: (
    position: Hold["position"],
    markerRadius: number,
    bounds?: Hold["bounds"],
    shape?: Hold["shape"],
  ) => void;
  onMoveHold: (id: string, position: Hold["position"]) => void;
  onResizeHold: (id: string, patch: Partial<Hold>) => void;
  onRemoveHold: (id: string) => void;
  onSelectHold: (id: string | null) => void;
  onAppendHold: (id: string) => void;
};

function renderCanvasScene(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  wall: Wall,
  holds: Hold[],
  route: ClimbingRoute | undefined,
  selectedHoldId: string | null,
  showLines: boolean,
  allowEllipses: boolean,
  viewport: Viewport,
) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawScene(
    context,
    {
      image,
      imageWidth: wall.width,
      imageHeight: wall.height,
      holds,
      route,
      selectedHoldId,
      showLines,
      allowEllipses,
      viewport,
    },
    bounds.width,
    bounds.height,
  );
}

export function WallCanvas({
  wall,
  imageUrl,
  holds,
  route,
  selectedHoldId,
  tool,
  showLines,
  autoDetectHolds,
  allowEllipses,
  onAddHold,
  onMoveHold,
  onResizeHold,
  onRemoveHold,
  onSelectHold,
  onAppendHold,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ holdId: string; pointerId: number } | null>(null);
  const resizeRef = useRef<ResizeGesture | null>(null);
  const panRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    pointerId: number;
  } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const [imageReady, setImageReady] = useState(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchGesture | null>(null);

  useEffect(() => {
    let active = true;
    setImageReady(false);
    const image = new Image();
    image.onload = () => {
      if (active) {
        imageRef.current = image;
        setImageReady(true);
      }
    };
    image.src = imageUrl;
    return () => {
      active = false;
      image.onload = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageReady) return;
    const render = () =>
      renderCanvasScene(
        canvas,
        image,
        wall,
        holds,
        route,
        selectedHoldId,
        showLines,
        allowEllipses,
        viewport,
      );
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [imageReady, wall, holds, route, selectedHoldId, showLines, allowEllipses, viewport]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function normalizedPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const point = canvasPoint(event);
    const rect = getImageRect(
      canvas.clientWidth,
      canvas.clientHeight,
      wall.width,
      wall.height,
      viewport,
    );
    return canvasToNormalized(point, rect);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      const bounds = canvas.getBoundingClientRect();
      const rect = getImageRect(
        canvas.clientWidth,
        canvas.clientHeight,
        wall.width,
        wall.height,
        viewport,
      );
      const selectedHold = holds.find((hold) => hold.id === selectedHoldId);
      const geometry = selectedHold
        ? getHoldMarkerGeometry(selectedHold, wall.width, wall.height, rect, true, allowEllipses)
        : undefined;
      const isHoldPinch =
        tool === "hold" &&
        selectedHold &&
        geometry &&
        isInsideHoldMarker({ x: first.x - bounds.left, y: first.y - bounds.top }, geometry) &&
        isInsideHoldMarker({ x: second.x - bounds.left, y: second.y - bounds.top }, geometry);
      pinchRef.current = {
        mode: isHoldPinch ? "hold" : "viewport",
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: viewport.zoom,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        panX: viewport.panX,
        panY: viewport.panY,
        ...(isHoldPinch && selectedHold
          ? {
              holdId: selectedHold.id,
              initialRadius: selectedHold.markerRadius ?? 48,
              currentRadius: selectedHold.markerRadius ?? 48,
            }
          : {}),
      };
      dragRef.current = null;
      resizeRef.current = null;
      panRef.current = null;
      return;
    }
    const point = canvasPoint(event);
    const rect = getImageRect(
      canvas.clientWidth,
      canvas.clientHeight,
      wall.width,
      wall.height,
      viewport,
    );
    const selectedHold = holds.find((hold) => hold.id === selectedHoldId);
    if (tool === "hold" && selectedHold) {
      const geometry = getHoldMarkerGeometry(
        selectedHold,
        wall.width,
        wall.height,
        rect,
        true,
        allowEllipses,
      );
      const handle = getResizeHandleAt(point, geometry);
      if (handle) {
        resizeRef.current = {
          holdId: selectedHold.id,
          pointerId: event.pointerId,
          handle,
          centerX: geometry.center.x,
          centerY: geometry.center.y,
          outlineRadiusX: geometry.outlineRadiusX,
          outlineRadiusY: geometry.outlineRadiusY,
          scaleX: selectedHold.markerScaleX ?? 1,
          scaleY: selectedHold.markerScaleY ?? 1,
          imageScale: rect.scale,
          lineWidth: selectedHold.markerWidth ?? 3,
          patch: {},
        };
        return;
      }
    }
    const hit = hitTestHold(point, holds, rect, 24, wall.width, wall.height, allowEllipses);
    if (tool === "pan" || event.button === 1 || event.shiftKey) {
      panRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
        pointerId: event.pointerId,
      };
      return;
    }
    if (tool === "eraser") {
      if (hit) onRemoveHold(hit.id);
      return;
    }
    if (hit && tool === "hold") {
      onSelectHold(hit.id);
      dragPositionRef.current = null;
      dragRef.current = { holdId: hit.id, pointerId: event.pointerId };
      return;
    }
    if (hit && tool === "route") {
      onAppendHold(hit.id);
      return;
    }
    if (tool === "hold") {
      const position = normalizedPoint(event);
      if (position) {
        const imageRect = getImageRect(
          canvas.clientWidth,
          canvas.clientHeight,
          wall.width,
          wall.height,
          viewport,
        );
        const outline =
          autoDetectHolds && imageRef.current
            ? detectHoldOutline(imageRef.current, position, wall.width, wall.height)
            : undefined;
        const fallbackRadius =
          autoDetectHolds && imageRef.current
            ? detectHoldRadius(imageRef.current, position, wall.width, wall.height)
            : undefined;
        const detectedPosition = outline?.position ?? position;
        const detectedRadius = outline
          ? allowEllipses
            ? outline.markerRadius
            : outline.circleRadius
          : (fallbackRadius ?? 12 / imageRect.scale);
        const fallbackBounds =
          fallbackRadius === undefined
            ? undefined
            : {
                x: position.x - fallbackRadius / wall.width,
                y: position.y - fallbackRadius / wall.height,
                width: (fallbackRadius * 2) / wall.width,
                height: (fallbackRadius * 2) / wall.height,
              };
        onAddHold(
          detectedPosition,
          detectedRadius,
          outline?.bounds ?? fallbackBounds,
          outline
            ? { type: allowEllipses ? "ellipse" : "point" }
            : fallbackRadius === undefined
              ? undefined
              : { type: "point" },
        );
      }
    } else {
      onSelectHold(null);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      const pinch = pinchRef.current;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (pinch.mode === "hold" && pinch.holdId && pinch.initialRadius !== undefined) {
        const markerRadius = Math.min(
          300,
          Math.max(4, pinch.initialRadius * (distance / Math.max(1, pinch.distance))),
        );
        pinch.currentRadius = markerRadius;
        previewHold(pinch.holdId, { markerRadius });
        return;
      }
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      setViewport({
        zoom: Math.min(5, Math.max(0.5, (pinch.zoom * distance) / Math.max(1, pinch.distance))),
        panX: pinch.panX + centerX - pinch.centerX,
        panY: pinch.panY + centerY - pinch.centerY,
      });
      return;
    }
    if (resizeRef.current?.pointerId === event.pointerId) {
      const gesture = resizeRef.current;
      const point = canvasPoint(event);
      const directionX = gesture.handle.includes("w") ? -1 : gesture.handle.includes("e") ? 1 : 0;
      const directionY = gesture.handle.includes("n") ? -1 : gesture.handle.includes("s") ? 1 : 0;
      const patch: Partial<Hold> = {};
      if (allowEllipses && directionX !== 0) {
        const radiusX = Math.max(4, Math.abs(point.x - gesture.centerX) - 6);
        patch.markerScaleX = Math.min(
          5,
          Math.max(0.1, gesture.scaleX * (radiusX / Math.max(1, gesture.outlineRadiusX))),
        );
      }
      if (allowEllipses && directionY !== 0) {
        const radiusY = Math.max(4, Math.abs(point.y - gesture.centerY) - 6);
        patch.markerScaleY = Math.min(
          5,
          Math.max(0.1, gesture.scaleY * (radiusY / Math.max(1, gesture.outlineRadiusY))),
        );
      }
      if (!allowEllipses) {
        const pointerRadiusX = Math.abs(point.x - gesture.centerX);
        const pointerRadiusY = Math.abs(point.y - gesture.centerY);
        const pointerRadius =
          directionX !== 0 && directionY !== 0
            ? Math.max(pointerRadiusX, pointerRadiusY)
            : directionX !== 0
              ? pointerRadiusX
              : pointerRadiusY;
        patch.markerRadius = Math.min(
          300,
          Math.max(
            4,
            (pointerRadius - 6 - gesture.lineWidth) / Math.max(0.001, gesture.imageScale),
          ),
        );
      }
      gesture.patch = patch;
      previewHold(gesture.holdId, patch);
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) {
      const pan = panRef.current;
      setViewport((current) => ({
        ...current,
        panX: pan.panX + event.clientX - pan.x,
        panY: pan.panY + event.clientY - pan.y,
      }));
      return;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      const canvas = event.currentTarget;
      const bounds = canvas.getBoundingClientRect();
      const rect = getImageRect(
        canvas.clientWidth,
        canvas.clientHeight,
        wall.width,
        wall.height,
        viewport,
      );
      const clamped = canvasToNormalized(
        {
          x: Math.min(rect.x + rect.width, Math.max(rect.x, event.clientX - bounds.left)),
          y: Math.min(rect.y + rect.height, Math.max(rect.y, event.clientY - bounds.top)),
        },
        rect,
      );
      if (clamped) setDragPosition(clamped);
    }
  }

  const dragPositionRef = useRef<Hold["position"] | null>(null);
  function setDragPosition(position: Hold["position"]) {
    dragPositionRef.current = position;
    const id = dragRef.current?.holdId;
    if (id) {
      const hold = holds.find((item) => item.id === id);
      if (hold) {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        renderCanvasScene(
          canvas,
          imageRef.current,
          wall,
          holds.map((item) => (item.id === id ? { ...item, position } : item)),
          route,
          selectedHoldId,
          showLines,
          allowEllipses,
          viewport,
        );
      }
    }
  }

  function previewHold(holdId: string, patch: Partial<Hold>) {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    renderCanvasScene(
      canvas,
      imageRef.current,
      wall,
      holds.map((hold) => (hold.id === holdId ? { ...hold, ...patch } : hold)),
      route,
      selectedHoldId,
      showLines,
      allowEllipses,
      viewport,
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.mode === "hold" && pointersRef.current.size < 2) {
      const pinch = pinchRef.current;
      if (
        pinch.holdId &&
        pinch.currentRadius !== undefined &&
        pinch.currentRadius !== pinch.initialRadius
      ) {
        onResizeHold(pinch.holdId, { markerRadius: pinch.currentRadius });
      }
      pinchRef.current = null;
    } else if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (resizeRef.current?.pointerId === event.pointerId) {
      const resize = resizeRef.current;
      if (Object.keys(resize.patch).length > 0) onResizeHold(resize.holdId, resize.patch);
      resizeRef.current = null;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      if (dragPositionRef.current) {
        onMoveHold(dragRef.current.holdId, dragPositionRef.current);
      }
      dragRef.current = null;
      dragPositionRef.current = null;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  }

  function onWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    setViewport((current) => ({
      ...current,
      zoom: Math.min(5, Math.max(0.5, current.zoom * (event.deltaY < 0 ? 1.1 : 0.9))),
    }));
  }

  return (
    <div className="canvas-stage">
      <canvas
        ref={canvasRef}
        className="wall-canvas h-full w-full touch-none"
        aria-label={`${wall.name}のホールド編集キャンバス`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
      <div className="canvas-zoom-controls">
        <button
          className="icon-button"
          type="button"
          title="拡大"
          aria-label="拡大"
          onClick={() =>
            setViewport((current) => ({ ...current, zoom: Math.min(5, current.zoom * 1.2) }))
          }
        >
          +
        </button>
        <button
          className="icon-button"
          type="button"
          title="縮小"
          aria-label="縮小"
          onClick={() =>
            setViewport((current) => ({ ...current, zoom: Math.max(0.5, current.zoom / 1.2) }))
          }
        >
          −
        </button>
        <button
          className="icon-button"
          type="button"
          title="全体表示"
          aria-label="全体表示"
          onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
        >
          ⌂
        </button>
      </div>
    </div>
  );
}
