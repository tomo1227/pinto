export type PhysicalDimensions = {
  width?: number;
  height?: number;
  unit: "cm" | "m";
};

export type Wall = {
  id: string;
  name: string;
  imageId: string;
  width: number;
  height: number;
  japaneseGrade?: string;
  vGrade?: string;
  gymName?: string;
  tags?: WallPostTags;
  physicalDimensions?: PhysicalDimensions;
  inclination?: number;
  createdAt: string;
  updatedAt: string;
};

export type Point = { x: number; y: number };

export type RouteText = {
  id: string;
  text: string;
  position: Point;
  color?: string;
  fontScale?: number;
  fontWeight?: number;
  fontFamily?: "sans-serif" | "serif" | "monospace";
  outlineColor?: string;
  outlineWidth?: number;
};

export type Hold = {
  id: string;
  wallId: string;
  position: Point;
  bounds?: { x: number; y: number; width: number; height: number };
  shape?: { type: "point" | "polygon" | "ellipse"; points?: Point[] };
  type?: string;
  color?: string;
  markerRadius?: number;
  markerWidth?: number;
  outlineColor?: string;
  outlineWidth?: number;
  markerScaleX?: number;
  markerScaleY?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
  detectionSource: "manual" | "ai";
  createdAt: string;
  updatedAt: string;
};

export type Route = {
  id: string;
  wallId: string;
  name: string;
  description?: string;
  holdIds: string[];
  startHoldIds: string[];
  finishHoldIds: string[];
  textAnnotations?: RouteText[];
  lineColor?: string;
  lineWidth?: number;
  lineOutlineColor?: string;
  lineOutlineWidth?: number;
  japaneseGrade?: string;
  vGrade?: string;
  grade?: string;
  style?: string[];
  author?: string;
  gymName?: string;
  source: "manual" | "ai";
  generationMetadata?: {
    model?: string;
    parameters?: Record<string, unknown>;
    generatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export function formatRouteGrade(route: Pick<Route, "japaneseGrade" | "vGrade" | "grade">) {
  const grades = [route.japaneseGrade, route.vGrade].filter((grade) => Boolean(grade));
  return grades.length > 0 ? grades.join(" · ") : (route.grade ?? "");
}

export const WALL_POST_TAG_CATEGORIES = ["hold", "move", "type"] as const;

export const WALL_POST_TAG_LABELS = {
  hold: "ホールド",
  move: "ムーブ",
  type: "タイプ",
} as const;

export const WALL_POST_TAGS = {
  hold: ["カチ", "ガバ", "スローパー", "ハリボテ"],
  move: [
    "ダイアゴナル",
    "キョン",
    "ヒールフック",
    "トゥフック",
    "フラッギング",
    "ステミング",
    "ランジ",
    "レイバック",
    "ハイステップ",
    "クロス",
    "デッドポイント",
    "手に足",
    "ニーバ",
    "マントル",
    "サイファー",
    "スメアリング",
    "マッチ",
    "フィギュア4",
    "ガストン",
    "おくり",
  ],
  type: ["スラブ", "オーバーハング", "垂壁", "ルーフ"],
} as const;

export type WallPostTagCategory = (typeof WALL_POST_TAG_CATEGORIES)[number];
export type WallPostTags = {
  [Category in WallPostTagCategory]: Array<(typeof WALL_POST_TAGS)[Category][number]>;
};

export const JAPANESE_CLIMBING_LEVELS = [
  "10級",
  "9級",
  "8級",
  "7級",
  "6級",
  "5級",
  "4級",
  "3級",
  "2級",
  "1級",
  "初段",
  "二段",
  "三段",
  "四段",
  "五段",
  "六段",
] as const;

export const V_CLIMBING_LEVELS = [
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
  "V12",
  "V13",
  "V14",
  "V15",
  "V16",
  "V17",
] as const;

export type ImageAsset = {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
};

export type DiscordSettings = {
  webhookUrl: string;
  notifyOnCreate: boolean;
  notifyOnUpdate: boolean;
};

export type JapanRegion =
  | "北海道"
  | "東北"
  | "関東"
  | "甲信越"
  | "北陸"
  | "東海"
  | "関西"
  | "中国"
  | "四国"
  | "九州・沖縄";

export type JapanPrefecture = {
  code: string;
  name: string;
  region: JapanRegion;
  center: [number, number];
};

export const JAPAN_REGIONS: JapanRegion[] = [
  "北海道",
  "東北",
  "関東",
  "甲信越",
  "北陸",
  "東海",
  "関西",
  "中国",
  "四国",
  "九州・沖縄",
];

export const JAPAN_PREFECTURES: JapanPrefecture[] = [
  { code: "JP-01", name: "北海道", region: "北海道", center: [43.06, 141.35] },
  { code: "JP-02", name: "青森県", region: "東北", center: [40.82, 140.74] },
  { code: "JP-03", name: "岩手県", region: "東北", center: [39.7, 141.15] },
  { code: "JP-04", name: "宮城県", region: "東北", center: [38.27, 140.87] },
  { code: "JP-05", name: "秋田県", region: "東北", center: [39.72, 140.1] },
  { code: "JP-06", name: "山形県", region: "東北", center: [38.24, 140.36] },
  { code: "JP-07", name: "福島県", region: "東北", center: [37.75, 140.47] },
  { code: "JP-08", name: "茨城県", region: "関東", center: [36.34, 140.45] },
  { code: "JP-09", name: "栃木県", region: "関東", center: [36.57, 139.88] },
  { code: "JP-10", name: "群馬県", region: "関東", center: [36.39, 139.06] },
  { code: "JP-11", name: "埼玉県", region: "関東", center: [35.86, 139.65] },
  { code: "JP-12", name: "千葉県", region: "関東", center: [35.61, 140.12] },
  { code: "JP-13", name: "東京都", region: "関東", center: [35.68, 139.69] },
  { code: "JP-14", name: "神奈川県", region: "関東", center: [35.45, 139.64] },
  { code: "JP-15", name: "新潟県", region: "甲信越", center: [37.9, 139.02] },
  { code: "JP-16", name: "富山県", region: "北陸", center: [36.7, 137.21] },
  { code: "JP-17", name: "石川県", region: "北陸", center: [36.59, 136.63] },
  { code: "JP-18", name: "福井県", region: "北陸", center: [36.07, 136.22] },
  { code: "JP-19", name: "山梨県", region: "甲信越", center: [35.66, 138.57] },
  { code: "JP-20", name: "長野県", region: "甲信越", center: [36.65, 138.18] },
  { code: "JP-21", name: "岐阜県", region: "東海", center: [35.42, 136.76] },
  { code: "JP-22", name: "静岡県", region: "東海", center: [34.98, 138.38] },
  { code: "JP-23", name: "愛知県", region: "東海", center: [35.18, 136.91] },
  { code: "JP-24", name: "三重県", region: "東海", center: [34.73, 136.51] },
  { code: "JP-25", name: "滋賀県", region: "関西", center: [35.0, 135.87] },
  { code: "JP-26", name: "京都府", region: "関西", center: [35.02, 135.76] },
  { code: "JP-27", name: "大阪府", region: "関西", center: [34.69, 135.5] },
  { code: "JP-28", name: "兵庫県", region: "関西", center: [34.69, 135.18] },
  { code: "JP-29", name: "奈良県", region: "関西", center: [34.69, 135.83] },
  { code: "JP-30", name: "和歌山県", region: "関西", center: [34.23, 135.17] },
  { code: "JP-31", name: "鳥取県", region: "中国", center: [35.5, 134.24] },
  { code: "JP-32", name: "島根県", region: "中国", center: [35.47, 133.05] },
  { code: "JP-33", name: "岡山県", region: "中国", center: [34.66, 133.93] },
  { code: "JP-34", name: "広島県", region: "中国", center: [34.4, 132.46] },
  { code: "JP-35", name: "山口県", region: "中国", center: [34.19, 131.47] },
  { code: "JP-36", name: "徳島県", region: "四国", center: [34.07, 134.56] },
  { code: "JP-37", name: "香川県", region: "四国", center: [34.34, 134.04] },
  { code: "JP-38", name: "愛媛県", region: "四国", center: [33.84, 132.77] },
  { code: "JP-39", name: "高知県", region: "四国", center: [33.56, 133.53] },
  { code: "JP-40", name: "福岡県", region: "九州・沖縄", center: [33.59, 130.4] },
  { code: "JP-41", name: "佐賀県", region: "九州・沖縄", center: [33.25, 130.3] },
  { code: "JP-42", name: "長崎県", region: "九州・沖縄", center: [32.74, 129.87] },
  { code: "JP-43", name: "熊本県", region: "九州・沖縄", center: [32.79, 130.74] },
  { code: "JP-44", name: "大分県", region: "九州・沖縄", center: [33.24, 131.61] },
  { code: "JP-45", name: "宮崎県", region: "九州・沖縄", center: [31.91, 131.42] },
  { code: "JP-46", name: "鹿児島県", region: "九州・沖縄", center: [31.56, 130.56] },
  { code: "JP-47", name: "沖縄県", region: "九州・沖縄", center: [26.21, 127.68] },
];
