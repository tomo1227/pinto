import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { defaultCruxDisplayOptions } from "./display-options";
import {
  calculatePoseMetrics,
  createPoseTimestampGenerator,
  getSynchronizedTime,
  isJointPartVisible,
  minimumLandmarkVisibility,
  nextPoseTimestamp,
  poseLandmarkerModelUrl,
  poseLandmarkerOptions,
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
