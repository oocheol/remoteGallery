import { z } from "zod";

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type Wall = {
  id: string;
  name: string;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  estimated?: boolean;
};

export type Floor = {
  polygon: Vec2[];
  y: number;
};

export type Calibration = {
  status: "uncalibrated" | "plan" | "user";
  source: string;
  scaleFactor: number;
  referenceDistanceM?: number;
  points?: [Vec3, Vec3];
};

export type Observer = { id: string; placementId: string; heightMm: number };

export type Scene = {
  id: string;
  galleryId: string;
  version: number;
  name: string;
  kind: "measured-plan" | "sfm" | "manual";
  walls: Wall[];
  floor: Floor;
  calibration: Calibration;
  visual: {
    kind: "none" | "reference" | "sparse" | "mesh" | "splat";
    url?: string;
    pointCount?: number;
  };
  observers?: Observer[];
  warnings: string[];
};

export type Artwork = {
  id: string;
  galleryId: string;
  title: string;
  type: "image" | "video" | "sculpture";
  imageUrl: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  frameWidthMm: number;
  frameDepthMm: number;
  frameMaterial?: "wood" | "black";
  /** Entered width/height include the frame unless loading a legacy share. */
  frameSizing?: "inset" | "outset";
  /** Equal left/right mat; also the fallback for legacy top/bottom values. */
  matWidthMm?: number;
  matTopMm?: number;
  matBottomMm?: number;
  /** Outset is retained only for immutable shares created before inset sizing. */
  matSizing?: "inset" | "outset";
};

export type Placement = {
  id: string;
  artworkId: string;
  wallId: string;
  u: number;
  v: number;
  rotation: number;
  locked: boolean;
};

export type Exhibition = {
  id: string;
  galleryId: string;
  title: string;
  revision: number;
  placements: Placement[];
  updatedAt: string;
};

export type Gallery = {
  id: string;
  name: string;
  address: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  galleryId: string;
  name: string;
  mimeType: string;
  url: string;
  size: number;
  role: "capture" | "artwork" | "reference";
};

export type JobStatus =
  | "UPLOAD"
  | "VALIDATING"
  | "EXTRACTING_FRAMES"
  | "ESTIMATING_CAMERAS"
  | "RECONSTRUCTING"
  | "GENERATING_GEOMETRY"
  | "OPTIMIZING"
  | "READY"
  | "FAILED";

export type Job = {
  id: string;
  galleryId: string;
  mode: string;
  status: JobStatus;
  progress: number;
  message: string;
  error?: string;
  sceneId?: string;
  createdAt: string;
  updatedAt: string;
};

export type GalleryDetail = {
  gallery: Gallery;
  scene: Scene | null;
  exhibition: Exhibition;
  artworks: Artwork[];
  assets: Asset[];
  jobs: Job[];
};

export type ShareSnapshot = {
  token: string;
  exhibition: Exhibition;
  scene: Scene;
  artworks: Artwork[];
  galleryName: string;
  createdAt: string;
};

export const vec2Schema = z.tuple([z.number(), z.number()]);
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const wallSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: vec2Schema,
  end: vec2Schema,
  height: z.number(),
  thickness: z.number(),
  estimated: z.boolean().optional(),
});

export const floorSchema = z.object({
  polygon: z.array(vec2Schema),
  y: z.number(),
});

export const calibrationSchema = z.object({
  status: z.enum(["uncalibrated", "plan", "user"]),
  source: z.string(),
  scaleFactor: z.number(),
  referenceDistanceM: z.number().optional(),
  points: z.tuple([vec3Schema, vec3Schema]).optional(),
});

export const sceneSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  version: z.number(),
  name: z.string(),
  kind: z.enum(["measured-plan", "sfm", "manual"]),
  walls: z.array(wallSchema),
  floor: floorSchema,
  calibration: calibrationSchema,
  visual: z.object({
    kind: z.enum(["none", "reference", "sparse", "mesh", "splat"]),
    url: z.string().optional(),
    pointCount: z.number().optional(),
  }),
  observers: z
    .array(
      z.object({
        id: z.string().min(1),
        placementId: z.string().min(1),
        heightMm: z.number().min(500).max(2500),
      }),
    )
    .max(100)
    .optional(),
  warnings: z.array(z.string()),
});

export const artworkSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  title: z.string(),
  type: z.enum(["image", "video", "sculpture"]),
  imageUrl: z.string(),
  widthMm: z.number(),
  heightMm: z.number(),
  depthMm: z.number(),
  frameWidthMm: z.number(),
  frameDepthMm: z.number(),
  frameMaterial: z.enum(["wood", "black"]).default("black"),
  matWidthMm: z.number().min(0).max(1000).default(0),
  matTopMm: z.number().min(0).max(1000).optional(),
  matBottomMm: z.number().min(0).max(1000).optional(),
  matSizing: z.enum(["inset", "outset"]).optional(),
  frameSizing: z.enum(["inset", "outset"]).optional(),
});

export const artworkStyleSchema = z
  .object({
    id: z.string(),
    frameMaterial: z.enum(["wood", "black"]),
    frameWidthMm: z.number().min(0).max(1000),
    frameDepthMm: z.number().min(0).max(1000),
    matWidthMm: z.number().min(0).max(1000),
    matTopMm: z.number().min(0).max(1000).optional(),
    matBottomMm: z.number().min(0).max(1000).optional(),
  })
  .strict();

export const placementSchema = z.object({
  id: z.string(),
  artworkId: z.string(),
  wallId: z.string(),
  u: z.number(),
  v: z.number(),
  rotation: z.number(),
  locked: z.boolean(),
});

export const exhibitionSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  title: z.string(),
  revision: z.number(),
  placements: z.array(placementSchema),
  updatedAt: z.string(),
});

export const gallerySchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  sourceUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const assetSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  url: z.string(),
  size: z.number(),
  role: z.enum(["capture", "artwork", "reference"]),
});

export const jobStatusSchema = z.enum([
  "UPLOAD",
  "VALIDATING",
  "EXTRACTING_FRAMES",
  "ESTIMATING_CAMERAS",
  "RECONSTRUCTING",
  "GENERATING_GEOMETRY",
  "OPTIMIZING",
  "READY",
  "FAILED",
]);

export const jobSchema = z.object({
  id: z.string(),
  galleryId: z.string(),
  mode: z.string(),
  status: jobStatusSchema,
  progress: z.number(),
  message: z.string(),
  error: z.string().optional(),
  sceneId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const galleryDetailSchema = z.object({
  gallery: gallerySchema,
  scene: sceneSchema.nullable(),
  exhibition: exhibitionSchema,
  artworks: z.array(artworkSchema),
  assets: z.array(assetSchema),
  jobs: z.array(jobSchema),
});

export const shareSnapshotSchema = z.object({
  token: z.string(),
  exhibition: exhibitionSchema,
  scene: sceneSchema,
  artworks: z.array(artworkSchema),
  galleryName: z.string(),
  createdAt: z.string(),
});
