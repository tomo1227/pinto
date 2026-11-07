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
export type PoseConfidenceThresholds = {
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minTrackingConfidence: number;
};
export const defaultPoseConfidenceThresholds: PoseConfidenceThresholds = {
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
export const poseConnections = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
] as const;

export type Pose3DRotation = { yaw: number; pitch: number };
export const pose3DInitialRotation: Pose3DRotation = {
  yaw: Math.PI / 18,
  pitch: Math.PI / 18,
};
export type ProjectedPoseLandmark3D = { x: number; y: number; depth: number } | null;
export type PosePlotCoordinate3D = { x: number; y: number; z: number };

type Point2D = { x: number; y: number };
type AxisName3D = "X" | "Y" | "Z";
const posePlotCoordinateMargin = 0.4;

export function positivePosePlotCoordinates3D(
  landmarks: Landmark[],
): (PosePlotCoordinate3D | null)[] {
  const coordinates = landmarks.map((landmark) =>
    [landmark.x, landmark.y, landmark.z].every(Number.isFinite)
      ? { x: -landmark.z, y: landmark.x, z: -landmark.y }
      : null,
  );
  const valid = coordinates.filter((point) => point !== null);
  if (valid.length === 0) return coordinates;
  const minimum = valid.reduce(
    (result, point) => ({
      x: Math.min(result.x, point.x),
      y: Math.min(result.y, point.y),
      z: Math.min(result.z, point.z),
    }),
    { x: Infinity, y: Infinity, z: Infinity },
  );
  const offset = {
    x: posePlotCoordinateMargin - minimum.x,
    y: posePlotCoordinateMargin - minimum.y,
    z: posePlotCoordinateMargin - minimum.z,
  };
  return coordinates.map((point) =>
    point ? { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z } : null,
  );
}

export type AxisProjection3D = {
  name: AxisName3D;
  start: Point2D;
  end: Point2D;
  ticks: { value: number; point: Point2D }[];
};

export type PoseSceneProjection3D = {
  landmarks: ProjectedPoseLandmark3D[];
  axes: AxisProjection3D[];
  box: Point2D[];
  axisLimit: number;
};

export function projectPoseScene3D(
  landmarks: Landmark[],
  width: number,
  height: number,
  rotation: Pose3DRotation,
  zoom = 1,
): PoseSceneProjection3D {
  const empty = (): PoseSceneProjection3D => ({
    landmarks: landmarks.map(() => null),
    axes: [],
    box: [],
    axisLimit: 0,
  });
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(rotation.yaw) ||
    !Number.isFinite(rotation.pitch) ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  )
    return empty();

  const cosAzimuth = Math.cos(rotation.yaw);
  const sinAzimuth = Math.sin(rotation.yaw);
  const cosElevation = Math.cos(rotation.pitch);
  const sinElevation = Math.sin(rotation.pitch);
  const rotatePlotPoint = (point: { x: number; y: number; z: number }) => {
    return {
      x: -point.x * sinAzimuth + point.y * cosAzimuth,
      y:
        -point.x * sinElevation * cosAzimuth -
        point.y * sinElevation * sinAzimuth +
        point.z * cosElevation,
      depth:
        point.x * cosElevation * cosAzimuth +
        point.y * cosElevation * sinAzimuth +
        point.z * sinElevation,
    };
  };
  const plotLandmarks = positivePosePlotCoordinates3D(landmarks).map((point, index) => {
    const visibility = landmarks[index].visibility ?? 1;
    if (!Number.isFinite(visibility) || visibility < minimumLandmarkVisibility || !point) {
      return null;
    }
    return point;
  });
  const visiblePlotPoints = plotLandmarks.filter((point) => point !== null);
  if (visiblePlotPoints.length === 0) return empty();
  const visible = visiblePlotPoints.map(rotatePlotPoint);

  const coordinateLimit = Math.max(0.25, ...visiblePlotPoints.flatMap(({ x, y, z }) => [x, y, z]));
  const axisLimit = Math.ceil(coordinateLimit * 1.1 * 4) / 4;
  const axisDefinitions: {
    name: AxisName3D;
    direction: "x" | "y" | "z";
  }[] = [
    { name: "X", direction: "x" },
    { name: "Y", direction: "y" },
    { name: "Z", direction: "z" },
  ];
  const axisCoordinates = [0, axisLimit / 4, axisLimit / 2, (axisLimit * 3) / 4, axisLimit];
  const rawAxes = axisDefinitions.map(({ name, direction }) => {
    const pointAt = (value: number) =>
      rotatePlotPoint({
        x: direction === "x" ? value : 0,
        y: direction === "y" ? value : 0,
        z: direction === "z" ? value : 0,
      });
    return {
      name,
      start: pointAt(0),
      end: pointAt(axisLimit),
      ticks: axisCoordinates.map((value) => ({ value, point: pointAt(value) })),
    };
  });
  const rawBox = Array.from({ length: 8 }, (_, index) =>
    rotatePlotPoint({
      x: index & 1 ? axisLimit : 0,
      y: index & 2 ? axisLimit : 0,
      z: index & 4 ? axisLimit : 0,
    }),
  );
  const fitPoints = [...visible, ...rawBox];
  const bounds = fitPoints.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const scale =
    Math.min(
      (width * 0.72) / Math.max(bounds.maxX - bounds.minX, 0.001),
      (height * 0.72) / Math.max(bounds.maxY - bounds.minY, 0.001),
    ) * zoom;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const project = (point: { x: number; y: number; depth: number }): Point2D => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 - (point.y - centerY) * scale,
  });
  const projectedAxes = rawAxes.map((axis) => ({
    name: axis.name,
    start: project(axis.start),
    end: project(axis.end),
    ticks: axis.ticks.map(({ value, point }) => ({ value, point: project(point) })),
  }));
  return {
    landmarks: plotLandmarks.map((point) => {
      if (!point) return null;
      const transformed = rotatePlotPoint(point);
      return { ...project(transformed), depth: transformed.depth };
    }),
    axes: projectedAxes,
    box: rawBox.map(project),
    axisLimit,
  };
}

export function projectPoseLandmarks3D(
  landmarks: Landmark[],
  width: number,
  height: number,
  rotation: Pose3DRotation,
): ProjectedPoseLandmark3D[] {
  return projectPoseScene3D(landmarks, width, height, rotation).landmarks;
}

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
