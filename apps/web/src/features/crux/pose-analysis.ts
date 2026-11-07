import type { Landmark, NormalizedLandmark, PoseLandmarkerOptions } from "@mediapipe/tasks-vision";

export const poseLandmarkerModelUrl =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";
export const poseLandmarkerOptions = {
  runningMode: "VIDEO",
  numPoses: 1,
  outputSegmentationMasks: false,
} satisfies PoseLandmarkerOptions;
export const minimumLandmarkVisibility = 0.35;

export type PoseMetrics = {
  torsoCenter: { x: number; y: number } | null;
  leftElbow: number | null;
  rightElbow: number | null;
  leftKnee: number | null;
  rightKnee: number | null;
};

export function nextPoseTimestamp(previousTimestamp: number, currentTimeSeconds: number) {
  const frameTimestamp = Number.isFinite(currentTimeSeconds)
    ? Math.round(currentTimeSeconds * 1000)
    : 0;
  return Math.max(previousTimestamp + 1, frameTimestamp, 1);
}

export function createPoseTimestampGenerator() {
  let lastTimestamp = -1;
  return (videoTimeSeconds: number) => {
    lastTimestamp = nextPoseTimestamp(lastTimestamp, videoTimeSeconds);
    return lastTimestamp;
  };
}

function visible(landmark: NormalizedLandmark | undefined) {
  return landmark && (landmark.visibility ?? 1) >= minimumLandmarkVisibility ? landmark : null;
}

function midpoint(a: NormalizedLandmark | null, b: NormalizedLandmark | null) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type Point3D = { x: number; y: number; z: number };

function angleAt(first: Point3D | null, joint: Point3D | null, last: Point3D | null) {
  if (!first || !joint || !last) return null;
  const firstVector = {
    x: first.x - joint.x,
    y: first.y - joint.y,
    z: first.z - joint.z,
  };
  const lastVector = {
    x: last.x - joint.x,
    y: last.y - joint.y,
    z: last.z - joint.z,
  };
  const firstLength = Math.hypot(firstVector.x, firstVector.y, firstVector.z);
  const lastLength = Math.hypot(lastVector.x, lastVector.y, lastVector.z);
  if (firstLength === 0 || lastLength === 0) return null;
  const cosine =
    (firstVector.x * lastVector.x + firstVector.y * lastVector.y + firstVector.z * lastVector.z) /
    (firstLength * lastLength);
  return Math.round(((Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI) * 10) / 10;
}

export function calculatePoseMetrics(
  imageLandmarks: NormalizedLandmark[],
  worldLandmarks: Landmark[],
): PoseMetrics {
  const point = (index: number) => visible(imageLandmarks[index]);
  const worldPoint = (index: number) => {
    const landmark = visible(worldLandmarks[index]);
    return landmark ? { x: landmark.x, y: landmark.y, z: landmark.z } : null;
  };
  const shoulders = midpoint(point(11), point(12));
  const hips = midpoint(point(23), point(24));
  const torsoCenter =
    shoulders && hips
      ? { x: shoulders.x * 0.35 + hips.x * 0.65, y: shoulders.y * 0.35 + hips.y * 0.65 }
      : null;

  return {
    torsoCenter,
    leftElbow: angleAt(worldPoint(11), worldPoint(13), worldPoint(15)),
    rightElbow: angleAt(worldPoint(12), worldPoint(14), worldPoint(16)),
    leftKnee: angleAt(worldPoint(23), worldPoint(25), worldPoint(27)),
    rightKnee: angleAt(worldPoint(24), worldPoint(26), worldPoint(28)),
  };
}
