import type { Route as ClimbingRoute, Hold, Wall } from "@pinto/shared";
import { Trash2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import {
  canvasToNormalized,
  clampRouteTextScale,
  drawScene,
  getHoldMarkerGeometry,
  getImageRect,
  getResizeHandleAt,
  getRouteTextGeometry,
  getRouteTextResizeHandleAt,
  type HoldResizeHandle,
  hitTestHold,
  hitTestRouteText,
  isInsideHoldMarker,
  normalizedToCanvas,
  type RouteTextResizeHandle,
  type Viewport,
} from "./canvas-engine";
import { detectHoldOutline, detectHoldRadius } from "./hold-detection";

type Tool = "hold" | "route" | "pan" | "eraser" | "text";
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
  mode: "viewport" | "hold" | "text";
  distance: number;
  zoom: number;
  centerX: number;
  centerY: number;
  panX: number;
  panY: number;
  holdId?: string;
  initialRadius?: number;
  currentRadius?: number;
  textId?: string;
  initialFontScale?: number;
  currentFontScale?: number;
};
type TextResizeGesture = {
  id: string;
  pointerId: number;
  handle: RouteTextResizeHandle;
  start: { x: number; y: number };
  fontScale: number;
  fontSize: number;
  currentFontScale: number;
};
type Props = {
  wall: Wall;
  imageUrl: string;
  holds: Hold[];
  route?: ClimbingRoute;
  selectedHoldId: string | null;
  selectedTextId: string | null;
  tool: Tool;
  textColor: string;
  textFontWeight: number;
  textFontFamily: NonNullable<Wall["editorStyleDefaults"]>["textFontFamily"];
  textOutlineWidth: number;
  textOutlineColor: string;
  showLines: boolean;
  autoDetectHolds: boolean;
  allowEllipses: boolean;
  onImageScaleChange: (scale: number) => void;
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
  onAddText: (position: Hold["position"], text: string) => void;
  onEditText: (id: string, text: string) => void;
  onMoveText: (id: string, position: Hold["position"]) => void;
  onResizeText: (id: string, fontScale: number) => void;
  onSelectText: (id: string | null) => void;
  onRemoveText: (id: string) => void;
};

type TextInputDraft = {
  key: string;
  id?: string;
  position: Hold["position"];
  x: number;
  y: number;
  text: string;
};
type TextDragGesture = {
  id: string;
  pointerId: number;
  pointerStart: { x: number; y: number };
  start: Hold["position"];
  position: Hold["position"];
  moved: boolean;
};

function focusTextInput(element: HTMLInputElement | null) {
  if (!element) return;
  requestAnimationFrame(() => {
    if (element.isConnected) element.focus();
  });
}

function renderCanvasScene(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  wall: Wall,
  holds: Hold[],
  route: ClimbingRoute | undefined,
  selectedHoldId: string | null,
  selectedTextId: string | null,
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
      selectedTextId,
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
  selectedTextId,
  tool,
  textColor,
  textFontWeight,
  textFontFamily,
  textOutlineWidth,
  textOutlineColor,
  showLines,
  autoDetectHolds,
  allowEllipses,
  onImageScaleChange,
  onAddHold,
  onMoveHold,
  onResizeHold,
  onRemoveHold,
  onSelectHold,
  onAppendHold,
  onAddText,
  onEditText,
  onMoveText,
  onResizeText,
  onSelectText,
  onRemoveText,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ holdId: string; pointerId: number; pointerType: string } | null>(null);
  const textDragRef = useRef<TextDragGesture | null>(null);
  const textResizeRef = useRef<TextResizeGesture | null>(null);
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
  const [touchDragging, setTouchDragging] = useState(false);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  const [textInputDraft, setTextInputDraft] = useState<TextInputDraft | null>(null);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
  const trashTargetRef = useRef<HTMLDivElement>(null);
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
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setViewport((current) => ({
        ...current,
        zoom: Math.min(5, Math.max(0.5, current.zoom * (event.deltaY < 0 ? 1.1 : 0.9))),
      }));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageReady) return;
    const visibleRoute =
      route && textInputDraft?.id
        ? {
            ...route,
            textAnnotations: route.textAnnotations?.filter(
              (annotation) => annotation.id !== textInputDraft.id,
            ),
          }
        : route;
    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      onImageScaleChange(
        getImageRect(bounds.width, bounds.height, wall.width, wall.height, viewport).scale,
      );
      renderCanvasScene(
        canvas,
        image,
        wall,
        holds,
        visibleRoute,
        selectedHoldId,
        selectedTextId,
        showLines,
        allowEllipses,
        viewport,
      );
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    imageReady,
    wall,
    holds,
    route,
    selectedHoldId,
    selectedTextId,
    textInputDraft?.id,
    showLines,
    allowEllipses,
    viewport,
    onImageScaleChange,
  ]);

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

  function commitTextInput() {
    if (!textInputDraft) return;
    const text = textInputDraft.text.trim();
    if (textInputDraft.id) {
      if (text) onEditText(textInputDraft.id, text);
      else onRemoveText(textInputDraft.id);
    } else if (text) {
      onAddText(textInputDraft.position, text);
    }
    setTextInputDraft(null);
  }

  function previewTextPosition(id: string, position: Hold["position"]) {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !route) return;
    const previewRoute: ClimbingRoute = {
      ...route,
      textAnnotations: route.textAnnotations?.map((annotation) =>
        annotation.id === id ? { ...annotation, position } : annotation,
      ),
    };
    renderCanvasScene(
      canvas,
      imageRef.current,
      wall,
      holds,
      previewRoute,
      selectedHoldId,
      selectedTextId,
      showLines,
      allowEllipses,
      viewport,
    );
  }

  function previewTextScale(id: string, fontScale: number) {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !route) return;
    const previewRoute: ClimbingRoute = {
      ...route,
      textAnnotations: route.textAnnotations?.map((annotation) =>
        annotation.id === id ? { ...annotation, fontScale } : annotation,
      ),
    };
    renderCanvasScene(
      canvas,
      imageRef.current,
      wall,
      holds,
      previewRoute,
      selectedHoldId,
      selectedTextId,
      showLines,
      allowEllipses,
      viewport,
    );
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      if (textInputDraft) commitTextInput();
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
      const selectedText = route?.textAnnotations?.find(({ id }) => id === selectedTextId);
      const geometry = selectedHold
        ? getHoldMarkerGeometry(selectedHold, wall.width, wall.height, rect, true, allowEllipses)
        : undefined;
      const textHitFirst = route?.textAnnotations
        ? hitTestRouteText(
            { x: first.x - bounds.left, y: first.y - bounds.top },
            route.textAnnotations,
            rect,
          )
        : undefined;
      const textHitSecond = route?.textAnnotations
        ? hitTestRouteText(
            { x: second.x - bounds.left, y: second.y - bounds.top },
            route.textAnnotations,
            rect,
          )
        : undefined;
      const isTextPinch =
        tool === "text" &&
        selectedText !== undefined &&
        textHitFirst?.id === selectedText.id &&
        textHitSecond?.id === selectedText.id;
      const isHoldPinch =
        tool === "hold" &&
        selectedHold &&
        geometry &&
        isInsideHoldMarker({ x: first.x - bounds.left, y: first.y - bounds.top }, geometry) &&
        isInsideHoldMarker({ x: second.x - bounds.left, y: second.y - bounds.top }, geometry);
      pinchRef.current = {
        mode: isTextPinch ? "text" : isHoldPinch ? "hold" : "viewport",
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
        ...(isTextPinch && selectedText
          ? {
              textId: selectedText.id,
              initialFontScale: selectedText.fontScale ?? 1,
              currentFontScale: selectedText.fontScale ?? 1,
            }
          : {}),
      };
      dragRef.current = null;
      textDragRef.current = null;
      setTouchDragging(false);
      setDragOverTrash(false);
      resizeRef.current = null;
      panRef.current = null;
      return;
    }
    if (textInputDraft) {
      commitTextInput();
      if (tool !== "text") return;
    }
    const point = canvasPoint(event);
    const rect = getImageRect(
      canvas.clientWidth,
      canvas.clientHeight,
      wall.width,
      wall.height,
      viewport,
    );
    const selectedText = route?.textAnnotations?.find(({ id }) => id === selectedTextId);
    const selectedTextGeometry = selectedText
      ? getRouteTextGeometry(selectedText, rect)
      : undefined;
    const textResizeHandle =
      tool === "text" && selectedTextGeometry
        ? getRouteTextResizeHandleAt(point, selectedTextGeometry)
        : undefined;
    if (selectedText && selectedTextGeometry && textResizeHandle) {
      textResizeRef.current = {
        id: selectedText.id,
        pointerId: event.pointerId,
        handle: textResizeHandle,
        start: point,
        fontScale: selectedText.fontScale ?? 1,
        fontSize: selectedTextGeometry.fontSize,
        currentFontScale: selectedText.fontScale ?? 1,
      };
      textDragRef.current = null;
      return;
    }
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
          lineWidth: (selectedHold.markerWidth ?? 3) + (selectedHold.outlineWidth ?? 0),
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
    if (tool === "text") {
      const textHit = route?.textAnnotations
        ? hitTestRouteText(point, route.textAnnotations, rect)
        : undefined;
      onSelectHold(null);
      if (textHit) {
        const editOnClick =
          (event.pointerType !== "touch" && selectedTextId === textHit.id) || event.detail > 1;
        onSelectText(textHit.id);
        setHoveredTextId(textHit.id);
        if (editOnClick) {
          textDragRef.current = null;
          setTextInputDraft({
            key: crypto.randomUUID(),
            id: textHit.id,
            position: textHit.position,
            ...normalizedToCanvas(textHit.position, rect),
            text: textHit.text,
          });
          return;
        }
        textDragRef.current = {
          id: textHit.id,
          pointerId: event.pointerId,
          pointerStart: { x: event.clientX, y: event.clientY },
          start: textHit.position,
          position: textHit.position,
          moved: false,
        };
        return;
      }
      onSelectText(null);
      const position = normalizedPoint(event);
      if (position)
        setTextInputDraft({
          key: crypto.randomUUID(),
          position,
          x: point.x,
          y: point.y,
          text: "",
        });
      return;
    }
    if (tool === "eraser") {
      const textHit = route?.textAnnotations
        ? hitTestRouteText(point, route.textAnnotations, rect)
        : undefined;
      if (textHit) {
        onRemoveText(textHit.id);
        return;
      }
      if (hit) onRemoveHold(hit.id);
      return;
    }
    if (hit && tool === "hold") {
      onSelectHold(hit.id);
      dragPositionRef.current = null;
      setTouchDragging(false);
      setDragOverTrash(false);
      dragRef.current = {
        holdId: hit.id,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      };
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

  function onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "text") return;
    const point = canvasPoint(event as ReactPointerEvent<HTMLCanvasElement>);
    const rect = getImageRect(
      event.currentTarget.clientWidth,
      event.currentTarget.clientHeight,
      wall.width,
      wall.height,
      viewport,
    );
    const annotation = route?.textAnnotations
      ? hitTestRouteText(point, route.textAnnotations, rect)
      : undefined;
    if (!annotation || textInputDraft?.id === annotation.id) return;
    onSelectHold(null);
    onSelectText(annotation.id);
    setTextInputDraft({
      key: crypto.randomUUID(),
      id: annotation.id,
      position: annotation.position,
      ...normalizedToCanvas(annotation.position, rect),
      text: annotation.text,
    });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (tool === "text" && pointersRef.current.size === 0) {
      const point = canvasPoint(event);
      const rect = getImageRect(
        event.currentTarget.clientWidth,
        event.currentTarget.clientHeight,
        wall.width,
        wall.height,
        viewport,
      );
      const textHit = route?.textAnnotations
        ? hitTestRouteText(point, route.textAnnotations, rect)
        : undefined;
      setHoveredTextId(textHit?.id ?? null);
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const [first, second] = points;
      const pinch = pinchRef.current;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (pinch.mode === "text" && pinch.textId && pinch.initialFontScale !== undefined) {
        const fontScale = clampRouteTextScale(
          pinch.initialFontScale * (distance / Math.max(1, pinch.distance)),
        );
        pinch.currentFontScale = fontScale;
        previewTextScale(pinch.textId, fontScale);
        return;
      }
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
    const textDrag = textDragRef.current;
    if (textDrag?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (
        Math.hypot(
          event.clientX - textDrag.pointerStart.x,
          event.clientY - textDrag.pointerStart.y,
        ) > 8
      ) {
        textDrag.moved = true;
      }
      if (textDrag.moved) {
        const canvas = event.currentTarget;
        const rect = getImageRect(
          canvas.clientWidth,
          canvas.clientHeight,
          wall.width,
          wall.height,
          viewport,
        );
        const position = canvasToNormalized(
          {
            x: Math.min(rect.x + rect.width, Math.max(rect.x, event.clientX - bounds.left)),
            y: Math.min(rect.y + rect.height, Math.max(rect.y, event.clientY - bounds.top)),
          },
          rect,
        );
        if (position) {
          textDrag.position = position;
          previewTextPosition(textDrag.id, position);
        }
      }
      return;
    }
    if (textResizeRef.current?.pointerId === event.pointerId) {
      const gesture = textResizeRef.current;
      const point = canvasPoint(event);
      const horizontalDirection = gesture.handle.endsWith("e") ? 1 : -1;
      const verticalDirection = gesture.handle.startsWith("s") ? 1 : -1;
      const sizeDelta =
        ((point.x - gesture.start.x) * horizontalDirection +
          (point.y - gesture.start.y) * verticalDirection) /
        2;
      gesture.currentFontScale = clampRouteTextScale(
        gesture.fontScale * (1 + sizeDelta / gesture.fontSize),
      );
      previewTextScale(gesture.id, gesture.currentFontScale);
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
      if (clamped) {
        if (dragRef.current.pointerType === "touch") {
          setTouchDragging(true);
          const targetBounds = trashTargetRef.current?.getBoundingClientRect();
          setDragOverTrash(
            Boolean(
              targetBounds &&
                event.clientX >= targetBounds.left &&
                event.clientX <= targetBounds.right &&
                event.clientY >= targetBounds.top &&
                event.clientY <= targetBounds.bottom,
            ),
          );
        }
        setDragPosition(clamped);
      }
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
          selectedTextId,
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
      selectedTextId,
      showLines,
      allowEllipses,
      viewport,
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      const pinch = pinchRef.current;
      if (
        pinch.mode === "hold" &&
        pinch.holdId &&
        pinch.currentRadius !== undefined &&
        pinch.currentRadius !== pinch.initialRadius
      ) {
        onResizeHold(pinch.holdId, { markerRadius: pinch.currentRadius });
      } else if (
        pinch.mode === "text" &&
        pinch.textId &&
        pinch.currentFontScale !== undefined &&
        pinch.currentFontScale !== pinch.initialFontScale
      ) {
        onResizeText(pinch.textId, pinch.currentFontScale);
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
    if (textResizeRef.current?.pointerId === event.pointerId) {
      const resize = textResizeRef.current;
      if (event.type === "pointerup") onResizeText(resize.id, resize.currentFontScale);
      else previewTextScale(resize.id, resize.fontScale);
      textResizeRef.current = null;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      const drag = dragRef.current;
      const targetBounds = trashTargetRef.current?.getBoundingClientRect();
      const droppedOnTrash =
        event.type === "pointerup" &&
        drag.pointerType === "touch" &&
        dragPositionRef.current !== null &&
        targetBounds !== undefined &&
        event.clientX >= targetBounds.left &&
        event.clientX <= targetBounds.right &&
        event.clientY >= targetBounds.top &&
        event.clientY <= targetBounds.bottom;
      if (droppedOnTrash) {
        onRemoveHold(drag.holdId);
      } else if (dragPositionRef.current) {
        onMoveHold(drag.holdId, dragPositionRef.current);
      }
      dragRef.current = null;
      dragPositionRef.current = null;
      setTouchDragging(false);
      setDragOverTrash(false);
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    if (textDragRef.current?.pointerId === event.pointerId) {
      const textDrag = textDragRef.current;
      textDragRef.current = null;
      if (event.type === "pointerup" && textDrag.moved) {
        onMoveText(textDrag.id, textDrag.position);
      } else if (event.type !== "pointerup") {
        previewTextPosition(textDrag.id, textDrag.start);
      }
    }
  }

  const canvas = canvasRef.current;
  const editingText = route?.textAnnotations?.find(({ id }) => id === textInputDraft?.id);
  const activeTextScale = editingText?.fontScale ?? 1;
  const textFontSize = canvas
    ? Math.max(
        14,
        24 *
          getImageRect(canvas.clientWidth, canvas.clientHeight, wall.width, wall.height, viewport)
            .scale,
      ) * activeTextScale
    : 24;

  return (
    <div className="canvas-stage">
      <canvas
        ref={canvasRef}
        className={`wall-canvas h-full w-full touch-none${tool === "text" ? (hoveredTextId ? " wall-canvas--text-target" : " wall-canvas--text") : ""}`}
        aria-label={`${wall.name}のホールド編集キャンバス`}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoveredTextId(null)}
      />
      {textInputDraft && (
        <input
          key={textInputDraft.key}
          className="canvas-text-input"
          type="text"
          aria-label="壁面に配置する文字"
          ref={focusTextInput}
          maxLength={100}
          value={textInputDraft.text}
          style={{
            left: textInputDraft.x,
            top: textInputDraft.y,
            color: textColor,
            fontSize: textFontSize,
            fontWeight: editingText?.fontWeight ?? textFontWeight,
            fontFamily: editingText?.fontFamily ?? textFontFamily,
            WebkitTextStroke:
              `${(editingText?.outlineWidth ?? textOutlineWidth) * 2}px ` +
              (editingText?.outlineColor ?? textOutlineColor),
            paintOrder: "stroke fill",
            width: Math.min(
              240,
              Math.max(100, (canvasRef.current?.clientWidth ?? 240) - textInputDraft.x - 16),
            ),
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof HTMLButtonElement &&
              event.relatedTarget.closest(".editor-header")
            ) {
              commitTextInput();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setTextInputDraft((draft) => (draft ? { ...draft, text } : draft));
          }}
          onKeyDown={(event) => {
            if (event.key === "Delete" && textInputDraft.id) {
              event.preventDefault();
              onRemoveText(textInputDraft.id);
              setTextInputDraft(null);
            } else if (event.key === "Enter") {
              event.preventDefault();
              commitTextInput();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setTextInputDraft(null);
            }
          }}
        />
      )}
      {touchDragging && (
        <div
          ref={trashTargetRef}
          className={`canvas-touch-delete-target${dragOverTrash ? " is-active" : ""}`}
          aria-hidden="true"
        >
          <Trash2 size={24} />
        </div>
      )}
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
