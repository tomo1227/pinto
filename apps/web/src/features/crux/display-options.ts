export const cruxJointVisibilityKeys = [
  "nose",
  "leftEyeInner",
  "leftEye",
  "leftEyeOuter",
  "rightEyeInner",
  "rightEye",
  "rightEyeOuter",
  "leftEar",
  "rightEar",
  "mouthLeft",
  "mouthRight",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftPinky",
  "rightPinky",
  "leftIndex",
  "rightIndex",
  "leftThumb",
  "rightThumb",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "leftHeel",
  "rightHeel",
  "leftFootIndex",
  "rightFootIndex",
] as const;

export type CruxJointVisibilityKey = (typeof cruxJointVisibilityKeys)[number];

export type CruxDisplayOptions = {
  showVideo: boolean;
  showSkeleton: boolean;
  showJoints: boolean;
  showHeadJoints: boolean;
  showTorsoJoints: boolean;
  showLeftArmJoints: boolean;
  showRightArmJoints: boolean;
  showLeftLegJoints: boolean;
  showRightLegJoints: boolean;
  jointVisibility: Partial<Record<CruxJointVisibilityKey, boolean>>;
  showTorsoCenter: boolean;
  skeletonColor: string;
  skeletonOpacity: number;
  jointColor: string;
  torsoCenterColor: string;
};

export const defaultCruxDisplayOptions: CruxDisplayOptions = {
  showVideo: true,
  showSkeleton: true,
  showJoints: true,
  showHeadJoints: true,
  showTorsoJoints: true,
  showLeftArmJoints: true,
  showRightArmJoints: true,
  showLeftLegJoints: true,
  showRightLegJoints: true,
  jointVisibility: {},
  showTorsoCenter: true,
  skeletonColor: "#ffe15c",
  skeletonOpacity: 1,
  jointColor: "#fffefa",
  torsoCenterColor: "#e96d4d",
};

export function parseCruxDisplayOptions(value: string | null): CruxDisplayOptions {
  if (value === null) return defaultCruxDisplayOptions;

  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("表示設定の保存データが正しくありません。");
  }
  const options = parsed as Record<string, unknown>;
  const booleans = [
    "showVideo",
    "showSkeleton",
    "showJoints",
    "showHeadJoints",
    "showTorsoJoints",
    "showLeftArmJoints",
    "showRightArmJoints",
    "showLeftLegJoints",
    "showRightLegJoints",
    "showTorsoCenter",
  ] as const;
  for (const key of booleans) {
    if (key in options && typeof options[key] !== "boolean") {
      throw new Error("表示設定の保存データが正しくありません。");
    }
  }
  for (const key of ["skeletonColor", "jointColor", "torsoCenterColor"] as const) {
    if (
      key in options &&
      (typeof options[key] !== "string" || !/^#[\da-f]{6}$/i.test(options[key]))
    ) {
      throw new Error("色の設定が正しくありません。");
    }
  }
  if (
    "skeletonOpacity" in options &&
    (typeof options.skeletonOpacity !== "number" ||
      !Number.isFinite(options.skeletonOpacity) ||
      options.skeletonOpacity < 0 ||
      options.skeletonOpacity > 1)
  ) {
    throw new Error("線の透過度設定が正しくありません。");
  }
  const savedVisibility = options.jointVisibility;
  const jointVisibility: Partial<Record<CruxJointVisibilityKey, boolean>> = {};
  if (savedVisibility !== undefined) {
    if (
      typeof savedVisibility !== "object" ||
      savedVisibility === null ||
      Array.isArray(savedVisibility)
    ) {
      throw new Error("関節の表示設定が正しくありません。");
    }
    const savedJointVisibility = savedVisibility as Record<string, unknown>;
    for (const key of cruxJointVisibilityKeys) {
      if (key in savedJointVisibility) {
        if (typeof savedJointVisibility[key] !== "boolean") {
          throw new Error("関節の表示設定が正しくありません。");
        }
        jointVisibility[key] = savedJointVisibility[key];
      }
    }
  }

  return {
    ...defaultCruxDisplayOptions,
    ...options,
    jointVisibility,
  } as CruxDisplayOptions;
}
