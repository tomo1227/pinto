import type { Landmark, NormalizedLandmark, PoseLandmarkerOptions } from "@mediapipe/tasks-vision";
import type { CruxDisplayOptions, CruxJointVisibilityKey } from "./display-options";

export const poseLandmarkerModelUrl =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";
export const poseLandmarkerOptions = {
  runningMode: "VIDEO",
  numPoses: 1,
  outputSegmentationMasks: false,
} satisfies PoseLandmarkerOptions;
export const minimumLandmarkVisibility = 0.35;

export type PoseJointGroup = "head" | "torso" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
type PoseJointGroupOption =
  | "showHeadJoints"
  | "showTorsoJoints"
  | "showLeftArmJoints"
  | "showRightArmJoints"
  | "showLeftLegJoints"
  | "showRightLegJoints";

export const poseJointGroups: {
  key: PoseJointGroup;
  label: string;
  option: PoseJointGroupOption;
}[] = [
  { key: "head", label: "頭部", option: "showHeadJoints" },
  { key: "torso", label: "胴体", option: "showTorsoJoints" },
  { key: "leftArm", label: "左腕", option: "showLeftArmJoints" },
  { key: "rightArm", label: "右腕", option: "showRightArmJoints" },
  { key: "leftLeg", label: "左脚", option: "showLeftLegJoints" },
  { key: "rightLeg", label: "右脚", option: "showRightLegJoints" },
];

export const poseJointLandmarks: {
  index: number;
  key: CruxJointVisibilityKey;
  label: string;
  group: PoseJointGroup;
}[] = [
  { index: 0, key: "nose", label: "鼻", group: "head" },
  { index: 1, key: "leftEyeInner", label: "左目（内側）", group: "head" },
  { index: 2, key: "leftEye", label: "左目", group: "head" },
  { index: 3, key: "leftEyeOuter", label: "左目（外側）", group: "head" },
  { index: 4, key: "rightEyeInner", label: "右目（内側）", group: "head" },
  { index: 5, key: "rightEye", label: "右目", group: "head" },
  { index: 6, key: "rightEyeOuter", label: "右目（外側）", group: "head" },
  { index: 7, key: "leftEar", label: "左耳", group: "head" },
  { index: 8, key: "rightEar", label: "右耳", group: "head" },
  { index: 9, key: "mouthLeft", label: "口（左）", group: "head" },
  { index: 10, key: "mouthRight", label: "口（右）", group: "head" },
  { index: 11, key: "leftShoulder", label: "左肩", group: "torso" },
  { index: 12, key: "rightShoulder", label: "右肩", group: "torso" },
  { index: 23, key: "leftHip", label: "左股関節", group: "torso" },
  { index: 24, key: "rightHip", label: "右股関節", group: "torso" },
  { index: 13, key: "leftElbow", label: "左肘", group: "leftArm" },
  { index: 15, key: "leftWrist", label: "左手首", group: "leftArm" },
  { index: 17, key: "leftPinky", label: "左小指", group: "leftArm" },
  { index: 19, key: "leftIndex", label: "左人差し指", group: "leftArm" },
  { index: 21, key: "leftThumb", label: "左親指", group: "leftArm" },
  { index: 14, key: "rightElbow", label: "右肘", group: "rightArm" },
  { index: 16, key: "rightWrist", label: "右手首", group: "rightArm" },
  { index: 18, key: "rightPinky", label: "右小指", group: "rightArm" },
  { index: 20, key: "rightIndex", label: "右人差し指", group: "rightArm" },
  { index: 22, key: "rightThumb", label: "右親指", group: "rightArm" },
  { index: 25, key: "leftKnee", label: "左膝", group: "leftLeg" },
  { index: 27, key: "leftAnkle", label: "左足首", group: "leftLeg" },
  { index: 29, key: "leftHeel", label: "左かかと", group: "leftLeg" },
  { index: 31, key: "leftFootIndex", label: "左つま先", group: "leftLeg" },
  { index: 26, key: "rightKnee", label: "右膝", group: "rightLeg" },
  { index: 28, key: "rightAnkle", label: "右足首", group: "rightLeg" },
  { index: 30, key: "rightHeel", label: "右かかと", group: "rightLeg" },
  { index: 32, key: "rightFootIndex", label: "右つま先", group: "rightLeg" },
];

export function isJointPartVisible(index: number, options: CruxDisplayOptions) {
  const landmark = poseJointLandmarks.find((joint) => joint.index === index);
  if (!landmark) return false;
  const group = poseJointGroups.find((jointGroup) => jointGroup.key === landmark.group);
  return Boolean(group && options[group.option] && options.jointVisibility[landmark.key] !== false);
}

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

export function getSynchronizedTime(
  primaryTime: number,
  primaryStartTime: number,
  comparisonStartTime: number,
  comparisonDuration: number,
) {
  const targetTime = Math.max(0, comparisonStartTime + primaryTime - primaryStartTime);
  return Number.isFinite(comparisonDuration) && comparisonDuration > 0
    ? Math.min(targetTime, comparisonDuration)
    : targetTime;
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
