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
  getImageRect,
  hitTestHold,
  type Viewport,
} from "./canvas-engine";
import { detectHoldOutline, detectHoldRadius } from "./hold-detection";

type Tool = "hold" | "route" | "pan" | "eraser";
type Props = {
  wall: Wall;
  imageUrl: string;
  holds: Hold[];
  route?: ClimbingRoute;
  selectedHoldId: string | null;
  tool: Tool;
  showLines: boolean;
  autoDetectHolds: boolean;
  onAddHold: (position: Hold["position"], markerRadius: number, bounds?: Hold["bounds"]) => void;
  onMoveHold: (id: string, position: Hold["position"]) => void;
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
  onAddHold,
  onMoveHold,
  onRemoveHold,
  onSelectHold,
  onAppendHold,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ holdId: string; pointerId: number } | null>(null);
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
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
  } | null>(null);

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
      renderCanvasScene(canvas, image, wall, holds, route, selectedHoldId, showLines, viewport);
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [imageReady, wall, holds, route, selectedHoldId, showLines, viewport]);

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
      pinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: viewport.zoom,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        panX: viewport.panX,
        panY: viewport.panY,
      };
      dragRef.current = null;
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
    const hit = hitTestHold(point, holds, rect);
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
        const detectedRadius =
          outline?.markerRadius ??
          (autoDetectHolds && imageRef.current
            ? detectHoldRadius(imageRef.current, position, wall.width, wall.height)
            : undefined);
        onAddHold(
          outline?.position ?? position,
          detectedRadius ?? 12 / imageRect.scale,
          outline?.bounds,
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
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      setViewport({
        zoom: Math.min(5, Math.max(0.5, (pinch.zoom * distance) / Math.max(1, pinch.distance))),
        panX: pinch.panX + centerX - pinch.centerX,
        panY: pinch.panY + centerY - pinch.centerY,
      });
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
          viewport,
        );
      }
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) {
      const position = dragPositionRef.current ?? normalizedPoint(event);
      if (position) onMoveHold(dragRef.current.holdId, position);
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
