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
  physicalDimensions?: PhysicalDimensions;
  inclination?: number;
  createdAt: string;
  updatedAt: string;
};

export type Point = { x: number; y: number };

export type Hold = {
  id: string;
  wallId: string;
  position: Point;
  bounds?: { x: number; y: number; width: number; height: number };
  shape?: { type: "point" | "polygon" | "ellipse"; points?: Point[] };
  type?: string;
  color?: string;
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
