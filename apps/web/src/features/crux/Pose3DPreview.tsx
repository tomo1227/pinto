import type { Landmark } from "@mediapipe/tasks-vision";
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import type { CruxDisplayOptions } from "./display-options";
import {
  isJointPartVisible,
  minimumLandmarkVisibility,
  pose3DInitialRotation,
  poseConnections,
  poseJointLandmarks,
  positivePosePlotCoordinates3D,
  projectPoseScene3D,
} from "./pose-analysis";

type Pose3DPreviewProps = {
  landmarks: Landmark[] | null;
  displayOptions: CruxDisplayOptions;
};

const initialZoom = 1.2;
const minimumZoom = 0.75;
const maximumZoom = 3;
function drawPoseAxes(
  context: CanvasRenderingContext2D,
  scene: ReturnType<typeof projectPoseScene3D>,
  background: "black" | "white",
) {
  if (!scene.axes.length || scene.box.length !== 8) return;
  const axisColor = background === "white" ? "#374139" : "#d4d8d6";
  const boxEdges: [number, number][] = [];
  for (let first = 0; first < scene.box.length; first += 1) {
    for (let second = first + 1; second < scene.box.length; second += 1) {
      const difference = first ^ second;
      if ((difference & (difference - 1)) === 0) boxEdges.push([first, second]);
    }
  }
  context.beginPath();
  for (const [first, second] of boxEdges) {
    context.moveTo(scene.box[first].x, scene.box[first].y);
    context.lineTo(scene.box[second].x, scene.box[second].y);
  }
  context.strokeStyle = background === "white" ? "#a8b0ad" : "#687270";
  context.globalAlpha = 0.38;
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;

  context.font = "12px sans-serif";
  context.textBaseline = "middle";
  for (const axis of scene.axes) {
    context.beginPath();
    context.moveTo(axis.start.x, axis.start.y);
    context.lineTo(axis.end.x, axis.end.y);
    context.strokeStyle = axisColor;
    context.lineWidth = 2;
    context.stroke();
    const axisX = axis.end.x - axis.start.x;
    const axisY = axis.end.y - axis.start.y;
    const axisLength = Math.hypot(axisX, axisY);
    if (axisLength > 0) {
      const normal = { x: -axisY / axisLength, y: axisX / axisLength };
      context.fillStyle = axisColor;
      context.textAlign = "center";
      for (const tick of axis.ticks) {
        context.beginPath();
        context.moveTo(tick.point.x - normal.x * 3, tick.point.y - normal.y * 3);
        context.lineTo(tick.point.x + normal.x * 3, tick.point.y + normal.y * 3);
        context.strokeStyle = axisColor;
        context.lineWidth = 1.5;
        context.stroke();
        if (tick.value !== 0) {
          context.fillText(
            tick.value.toFixed(2),
            tick.point.x + normal.x * 11,
            tick.point.y + normal.y * 11,
          );
        }
      }
    }
    context.fillStyle = axisColor;
    context.textAlign = "left";
    context.font = "bold 14px sans-serif";
    context.fillText(axis.name, axis.end.x + 6, axis.end.y);
  }
}

export function Pose3DPreview({ landmarks, displayOptions }: Pose3DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [rotation, setRotation] = useState(pose3DInitialRotation);
  const [zoom, setZoom] = useState(initialZoom);
  const hasPose = Boolean(
    landmarks?.some(
      (point) =>
        [point.x, point.y, point.z].every(Number.isFinite) &&
        Number.isFinite(point.visibility ?? 1) &&
        (point.visibility ?? 1) >= minimumLandmarkVisibility,
    ),
  );
  const plotCoordinates = positivePosePlotCoordinates3D(landmarks ?? []);
  const coordinates =
    landmarks?.flatMap((point, index) => {
      const joint = poseJointLandmarks.find((candidate) => candidate.index === index);
      const plotPoint = plotCoordinates[index];
      if (
        !joint ||
        !plotPoint ||
        (point.visibility !== undefined && !Number.isFinite(point.visibility))
      ) {
        return [];
      }
      return [{ ...joint, point: plotPoint, visibility: point.visibility }];
    }) ?? [];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = displayOptions.pose3DBackground === "white" ? "#fffefa" : "#101312";
    context.fillRect(0, 0, rect.width, rect.height);

    if (landmarks?.length) {
      const scene = projectPoseScene3D(landmarks, rect.width, rect.height, rotation, zoom);
      const projected = scene.landmarks;
      if (displayOptions.show3DAxes) {
        drawPoseAxes(context, scene, displayOptions.pose3DBackground);
      }
      if (displayOptions.showSkeleton) {
        context.beginPath();
        for (const [start, end] of poseConnections) {
          const first = projected[start];
          const last = projected[end];
          if (!first || !last) continue;
          context.moveTo(first.x, first.y);
          context.lineTo(last.x, last.y);
        }
        context.strokeStyle = displayOptions.skeletonColor;
        context.globalAlpha = displayOptions.skeletonOpacity;
        context.lineWidth = Math.max(2, rect.width * 0.008);
        context.lineCap = "round";
        context.stroke();
        context.globalAlpha = 1;
      }

      if (displayOptions.showJoints) {
        context.fillStyle = displayOptions.jointColor;
        context.strokeStyle = "#2f7a68";
        context.lineWidth = 1.5;
        for (const point of poseJointLandmarks) {
          const projectedPoint = projected[point.index];
          if (!projectedPoint || !isJointPartVisible(point.index, displayOptions)) continue;
          context.beginPath();
          context.arc(
            projectedPoint.x,
            projectedPoint.y,
            Math.max(3, rect.width * 0.012),
            0,
            Math.PI * 2,
          );
          context.fill();
          context.stroke();
        }
      }
    }
  }, [displayOptions, landmarks, rotation, zoom]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function startView(event: PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        zoom,
      };
      dragRef.current = null;
    } else {
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  function moveView(event: PointerEvent<HTMLCanvasElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (pinchRef.current.distance > 0) {
        setZoom(
          Math.max(
            minimumZoom,
            Math.min(maximumZoom, pinchRef.current.zoom * (distance / pinchRef.current.distance)),
          ),
        );
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setRotation((current) => ({
      yaw: current.yaw + deltaX * 0.01,
      pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, current.pitch - deltaY * 0.01)),
    }));
  }

  function endView(event: PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    const remaining = pointersRef.current.entries().next().value;
    dragRef.current = remaining
      ? { pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y }
      : null;
  }

  function zoomWithWheel(event: WheelEvent<HTMLCanvasElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom((current) =>
      Math.max(minimumZoom, Math.min(maximumZoom, current * Math.exp(-event.deltaY * 0.01))),
    );
  }

  return (
    <div className="crux-3d-preview">
      <div className="crux-3d-preview__heading">
        <strong>3D姿勢モデル</strong>
        <button
          className="button button--outline"
          type="button"
          onClick={() => {
            setRotation(pose3DInitialRotation);
            setZoom(initialZoom);
          }}
        >
          初期視点
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="crux-3d-preview__canvas"
        role="img"
        aria-label="MediaPipeの3Dワールドランドマークを表示"
        onPointerDown={startView}
        onPointerMove={moveView}
        onPointerUp={endView}
        onPointerCancel={endView}
        onWheel={zoomWithWheel}
      />
      {hasPose && (
        <details className="crux-3d-preview__coordinates">
          <summary>3D表示座標 X/Y/Z（原点移動・m）</summary>
          <p>
            骨格全体を正の領域へ置くため、フレームごとに表示用の原点を移動しています。実位置ではありません。
          </p>
          <div className="crux-3d-preview__table-scroll">
            <table aria-label="3DワールドランドマークのX・Y・Z座標">
              <thead>
                <tr>
                  <th scope="col">関節</th>
                  <th scope="col">X</th>
                  <th scope="col">Y</th>
                  <th scope="col">Z</th>
                  <th scope="col">信頼度</th>
                </tr>
              </thead>
              <tbody>
                {coordinates.map(({ index, label, point, visibility }) => (
                  <tr
                    key={index}
                    className={
                      visibility !== undefined && visibility < minimumLandmarkVisibility
                        ? "crux-3d-preview__low-confidence"
                        : undefined
                    }
                  >
                    <th scope="row">{label}</th>
                    <td>{point.x.toFixed(3)}</td>
                    <td>{point.y.toFixed(3)}</td>
                    <td>{point.z.toFixed(3)}</td>
                    <td>{visibility === undefined ? "—" : `${Math.round(visibility * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {hasPose ? (
        <p className="crux-3d-preview__hint">
          ドラッグで回転・2本指で拡大縮小 ·{" "}
          {displayOptions.show3DAxes ? "軸目盛りはm · " : ""}
          単眼推定のため実寸・壁距離ではありません
        </p>
      ) : (
        <p className="crux-3d-preview__hint" role="status">
          3D姿勢を検出できません
        </p>
      )}
    </div>
  );
}
