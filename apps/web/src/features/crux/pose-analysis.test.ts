import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { defaultCruxDisplayOptions } from "./display-options";
import {
  calculatePoseMetrics,
  createPoseTimestampGenerator,
  defaultPoseConfidenceThresholds,
  getSynchronizedTime,
  isJointPartVisible,
  minimumLandmarkVisibility,
  nextPoseTimestamp,
  pose3DInitialRotation,
  poseLandmarkerModelUrl,
  poseLandmarkerOptions,
  positivePosePlotCoordinates3D,
  projectPoseLandmarks3D,
  projectPoseScene3D,
} from "./pose-analysis";

function landmarks() {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  })) satisfies NormalizedLandmark[];
}

function worldLandmarks() {
  return Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  })) satisfies Landmark[];
}

describe("calculatePoseMetrics", () => {
  it("calculates 3D joint angles and a 2D torso center estimate", () => {
    const points = landmarks();
    const worldPoints = worldLandmarks();
    points[11] = { x: 0.2, y: 0.2, z: 0, visibility: 1 };
    points[12] = { x: 0.8, y: 0.2, z: 0, visibility: 1 };
    points[23] = { x: 0.3, y: 0.8, z: 0, visibility: 1 };
    points[24] = { x: 0.7, y: 0.8, z: 0, visibility: 1 };
    points[11] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
    points[13] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    points[15] = { x: 0.5, y: 0.3, z: 0, visibility: 1 };
    worldPoints[11] = { x: -1, y: 0, z: 1, visibility: 1 };
    worldPoints[13] = { x: 0, y: 0, z: 0, visibility: 1 };
    worldPoints[15] = { x: 0, y: 1, z: 0, visibility: 1 };

    const metrics = calculatePoseMetrics(points, worldPoints);

    expect(metrics.leftElbow).toBe(90);
    expect(metrics.torsoCenter).toEqual({ x: 0.535, y: 0.625 });
  });

  it("omits angles when a required joint is not visible", () => {
    const points = landmarks();
    const worldPoints = worldLandmarks();
    worldPoints[13].visibility = minimumLandmarkVisibility - 0.01;

    expect(calculatePoseMetrics(points, worldPoints).leftElbow).toBeNull();
  });

  it("uses the Heavy model and the VIDEO running mode", () => {
    expect(poseLandmarkerModelUrl).toContain("pose_landmarker_heavy");
    expect(poseLandmarkerOptions).toMatchObject({
      runningMode: "VIDEO",
    });
    expect(defaultPoseConfidenceThresholds).toEqual({
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  });
});

describe("projectPoseScene3D", () => {
  it("starts with the same front-facing X/Y orientation as the video", () => {
    const scene = projectPoseScene3D(worldLandmarks(), 400, 300, pose3DInitialRotation);
    const xAxis = scene.axes.find((axis) => axis.name === "X");
    const yAxis = scene.axes.find((axis) => axis.name === "Y");
    const zAxis = scene.axes.find((axis) => axis.name === "Z");

    expect(xAxis).toBeDefined();
    expect(yAxis).toBeDefined();
    expect(zAxis).toBeDefined();
    if (!xAxis || !yAxis || !zAxis) throw new Error("3D coordinate axes are missing");
    expect(pose3DInitialRotation.yaw).toBeCloseTo(Math.PI / 18);
    expect(pose3DInitialRotation.pitch).toBeCloseTo(Math.PI / 18);
    expect(xAxis.end.x).toBeLessThan(xAxis.start.x);
    expect(yAxis.end.x).toBeGreaterThan(yAxis.start.x);
    expect(zAxis.end.y).toBeLessThan(zAxis.start.y);
    expect(scene.box).toHaveLength(8);
    expect(xAxis.ticks.map((tick) => tick.value)).toEqual([
      0,
      scene.axisLimit / 4,
      scene.axisLimit / 2,
      (scene.axisLimit * 3) / 4,
      scene.axisLimit,
    ]);
  });

  it("moves all displayed skeleton coordinates into the positive octant", () => {
    const points = worldLandmarks();
    points[11] = { x: -0.5, y: -0.4, z: 0.2, visibility: 1 };
    points[12] = { x: 0.5, y: 0.4, z: -0.2, visibility: 1 };
    const plotted = positivePosePlotCoordinates3D(points);

    expect(plotted).toHaveLength(points.length);
    for (const point of plotted) {
      if (point) {
        expect(point.x).toBeGreaterThan(0);
        expect(point.y).toBeGreaterThan(0);
        expect(point.z).toBeGreaterThan(0);
      }
    }
    const first = plotted[11];
    const second = plotted[12];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) throw new Error("Pose plot coordinates are missing");
    const valid = plotted.filter((point) => point !== null);
    expect(Math.min(...valid.map((point) => point.x))).toBeCloseTo(0.4);
    expect(Math.min(...valid.map((point) => point.y))).toBeCloseTo(0.4);
    expect(Math.min(...valid.map((point) => point.z))).toBeCloseTo(0.4);
    expect(Math.abs(first.x - second.x)).toBeCloseTo(0.4);
    expect(points[11]).toEqual({ x: -0.5, y: -0.4, z: 0.2, visibility: 1 });
  });

  it("fits visible world landmarks to the canvas and omits low-confidence points", () => {
    const points = worldLandmarks();
    points[11] = { x: -0.5, y: 0, z: 0, visibility: 1 };
    points[12] = { x: 0.5, y: 0, z: 0, visibility: 1 };
    points[13] = { x: 0, y: 1, z: 0, visibility: 1 };
    points[15].visibility = minimumLandmarkVisibility - 0.01;

    const projected = projectPoseLandmarks3D(points, 400, 300, { yaw: 0, pitch: 0 });

    expect(projected[11]?.x).toBeLessThan(200);
    expect(projected[12]?.x).toBeGreaterThan(200);
    expect(projected[13]?.y).toBeGreaterThan(150);
    expect(projected[15]).toBeNull();
    for (const point of projected) {
      if (point) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(400);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(300);
      }
    }
  });

  it("zooms the pose and coordinate axes together", () => {
    const points = worldLandmarks();
    points[11] = { x: -0.5, y: 0, z: 0, visibility: 1 };
    points[12] = { x: 0.5, y: 0, z: 0, visibility: 1 };
    const normal = projectPoseScene3D(points, 400, 300, pose3DInitialRotation);
    const zoomed = projectPoseScene3D(points, 400, 300, pose3DInitialRotation, 1.5);

    expect(Math.abs((zoomed.landmarks[11]?.x ?? 200) - 200)).toBeGreaterThan(
      Math.abs((normal.landmarks[11]?.x ?? 200) - 200),
    );
    expect(Math.abs(zoomed.axes[0].end.x - zoomed.axes[0].start.x)).toBeGreaterThan(
      Math.abs(normal.axes[0].end.x - normal.axes[0].start.x),
    );
  });

  it("reveals depth by rotating world coordinates and handles invalid canvases", () => {
    const points = worldLandmarks();
    points[0] = { x: 0, y: 0, z: -1, visibility: 1 };
    points[1] = { x: 0, y: 0, z: 1, visibility: 1 };
    const front = projectPoseLandmarks3D(points.slice(0, 2), 300, 200, { yaw: 0, pitch: 0 });
    const rotated = projectPoseLandmarks3D(points.slice(0, 2), 300, 200, {
      yaw: Math.PI / 2,
      pitch: 0,
    });

    expect(front[0]?.x).toBe(front[1]?.x);
    expect(rotated[0]?.x).toBeLessThan(rotated[1]?.x);
    expect(projectPoseLandmarks3D(points, 0, 200, { yaw: 0, pitch: 0 })).toEqual(
      points.map(() => null),
    );
  });
});

describe("nextPoseTimestamp", () => {
  it("starts above zero and stays strictly increasing across pauses and seeks", () => {
    expect(nextPoseTimestamp(-1, 0)).toBe(1);
    expect(nextPoseTimestamp(1, 0)).toBe(2);
    expect(nextPoseTimestamp(2, 1.5)).toBe(1500);
    expect(nextPoseTimestamp(1500, 0.5)).toBe(1501);
  });
});

describe("getSynchronizedTime", () => {
  it("keeps both selected start positions aligned and clamps to the comparison duration", () => {
    expect(getSynchronizedTime(8, 3, 5, 20)).toBe(10);
    expect(getSynchronizedTime(1, 3, 5, 20)).toBe(3);
    expect(getSynchronizedTime(8, 3, 25, 20)).toBe(20);
  });
});

describe("isJointPartVisible", () => {
  it("filters individual landmarks without affecting other joints or parts", () => {
    const options = {
      ...defaultCruxDisplayOptions,
      jointVisibility: { leftElbow: false },
    };

    expect(isJointPartVisible(13, options)).toBe(false);
    expect(isJointPartVisible(11, options)).toBe(true);
    expect(isJointPartVisible(14, options)).toBe(true);
    expect(isJointPartVisible(15, options)).toBe(true);
    expect(isJointPartVisible(33, options)).toBe(false);
  });

  it("lets a whole body region hide all of its landmarks", () => {
    const options = { ...defaultCruxDisplayOptions, showLeftArmJoints: false };

    expect(isJointPartVisible(13, options)).toBe(false);
    expect(isJointPartVisible(15, options)).toBe(false);
    expect(isJointPartVisible(14, options)).toBe(true);
  });
});

describe("createPoseTimestampGenerator", () => {
  it("keeps timestamps independent for separate video streams", () => {
    const first = createPoseTimestampGenerator();
    const second = createPoseTimestampGenerator();

    expect(first(0)).toBe(1);
    expect(second(0)).toBe(1);
    expect(first(0.1)).toBe(100);
    expect(second(0.05)).toBe(50);
  });
});
