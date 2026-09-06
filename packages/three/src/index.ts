import type {
  Artwork,
  Placement,
  Scene,
  Vec2,
  Vec3,
  Wall,
} from "@gallery/shared";

const EPS = 1e-7;
export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}
export function wallPoint(wall: Wall, u: number, v: number): Vec3 {
  const length = wallLength(wall);
  if (length < EPS) throw new Error("Wall must have positive length");
  return [
    wall.start[0] + ((wall.end[0] - wall.start[0]) * u) / length,
    v,
    wall.start[1] + ((wall.end[1] - wall.start[1]) * u) / length,
  ];
}
export function wallCoordinates(wall: Wall, point: Vec3): Vec2 {
  const length = wallLength(wall);
  if (length < EPS) throw new Error("Wall must have positive length");
  return [
    ((point[0] - wall.start[0]) * (wall.end[0] - wall.start[0]) +
      (point[2] - wall.start[1]) * (wall.end[1] - wall.start[1])) /
      length,
    point[1],
  ];
}
/** Overall frame dimensions in meters. Artwork millimeters are never scene-scaled. */
export function artworkSize(artwork: Artwork): {
  width: number;
  height: number;
  depth: number;
} {
  return {
    width:
      (artwork.widthMm +
        2 * (artwork.frameWidthMm + (artwork.matWidthMm ?? 0))) /
      1000,
    height:
      (artwork.heightMm +
        2 * (artwork.frameWidthMm + (artwork.matWidthMm ?? 0))) /
      1000,
    depth: Math.max(artwork.depthMm, artwork.frameDepthMm, 1) / 1000,
  };
}
/** rotation is degrees, counterclockwise in wall-local coordinates. */
export function placementExtents(artwork: Artwork, rotation = 0): Vec2 {
  const { width, height } = artworkSize(artwork),
    r = (rotation * Math.PI) / 180;
  return [
    (Math.abs(Math.cos(r)) * width + Math.abs(Math.sin(r)) * height) / 2,
    (Math.abs(Math.sin(r)) * width + Math.abs(Math.cos(r)) * height) / 2,
  ];
}
export function clampPlacement(
  placement: Placement,
  artwork: Artwork,
  wall: Wall,
): Placement {
  const [x, y] = placementExtents(artwork, placement.rotation),
    length = wallLength(wall);
  return {
    ...placement,
    wallId: wall.id,
    u:
      length < x * 2
        ? length / 2
        : Math.max(x, Math.min(length - x, placement.u)),
    v:
      wall.height < y * 2
        ? wall.height / 2
        : Math.max(y, Math.min(wall.height - y, placement.v)),
  };
}
export function validatePlacement(
  p: Placement,
  artwork: Artwork,
  wall: Wall,
): string[] {
  const errors: string[] = [],
    [x, y] = placementExtents(artwork, p.rotation),
    length = wallLength(wall);
  if (p.wallId !== wall.id) errors.push("Placement wall does not match");
  if (![p.u, p.v, p.rotation, length, wall.height, x, y].every(Number.isFinite))
    return [...errors, "Placement contains non-finite dimensions"];
  if (length <= EPS || wall.height <= EPS)
    errors.push("Wall dimensions must be positive");
  if (
    artwork.widthMm <= 0 ||
    artwork.heightMm <= 0 ||
    artwork.frameWidthMm < 0 ||
    (artwork.matWidthMm ?? 0) < 0 ||
    artwork.depthMm < 0 ||
    artwork.frameDepthMm < 0
  )
    errors.push("Artwork dimensions must be positive");
  if (p.u - x < -EPS || p.u + x > length + EPS)
    errors.push("Artwork frame exceeds wall width");
  if (p.v - y < -EPS || p.v + y > wall.height + EPS)
    errors.push("Artwork frame exceeds wall height");
  return errors;
}
function corners(p: Placement, a: Artwork): Vec2[] {
  const { width, height } = artworkSize(a),
    r = (p.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => [
    p.u + ((x * width) / 2) * c - ((y * height) / 2) * s,
    p.v + ((x * width) / 2) * s + ((y * height) / 2) * c,
  ]);
}
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < 2; i++) {
      const p = polygon[i],
        q = polygon[i + 1],
        axis: Vec2 = [q[1] - p[1], p[0] - q[0]];
      const av = a.map((v) => v[0] * axis[0] + v[1] * axis[1]),
        bv = b.map((v) => v[0] * axis[0] + v[1] * axis[1]);
      if (
        Math.max(...av) <= Math.min(...bv) + EPS ||
        Math.max(...bv) <= Math.min(...av) + EPS
      )
        return false;
    }
  return true;
}
export function findCollisions(
  placements: Placement[],
  artworks: Artwork[],
  walls: Wall[],
): string[] {
  const art = new Map(artworks.map((a) => [a.id, a])),
    wallIds = new Set(walls.map((w) => w.id)),
    errors: string[] = [];
  for (let i = 0; i < placements.length; i++)
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i],
        b = placements[j],
        aa = art.get(a.artworkId),
        ba = art.get(b.artworkId);
      if (
        a.wallId === b.wallId &&
        wallIds.has(a.wallId) &&
        aa &&
        ba &&
        overlaps(corners(a, aa), corners(b, ba))
      )
        errors.push(`${a.id} overlaps ${b.id}`);
    }
  return errors;
}
export function calibrateScene(
  scene: Scene,
  knownDistanceM: number,
  points: [Vec3, Vec3],
): Scene {
  const distance = Math.hypot(...points[0].map((v, i) => v - points[1][i]));
  if (
    !Number.isFinite(knownDistanceM) ||
    knownDistanceM <= 0 ||
    !Number.isFinite(distance) ||
    distance < EPS
  )
    throw new Error(
      "Calibration requires two distinct points and a positive distance",
    );
  const factor = knownDistanceM / distance,
    v2 = (p: Vec2): Vec2 => [p[0] * factor, p[1] * factor],
    v3 = (p: Vec3): Vec3 => [p[0] * factor, p[1] * factor, p[2] * factor];
  return {
    ...scene,
    version: scene.version + 1,
    walls: scene.walls.map((w) => ({
      ...w,
      start: v2(w.start),
      end: v2(w.end),
      height: w.height * factor,
      thickness: w.thickness * factor,
    })),
    floor: {
      ...scene.floor,
      polygon: scene.floor.polygon.map(v2),
      y: scene.floor.y * factor,
    },
    calibration: {
      status: "user",
      source: "Two-point user calibration",
      scaleFactor: scene.calibration.scaleFactor * factor,
      referenceDistanceM: knownDistanceM,
      points: [v3(points[0]), v3(points[1])],
    },
  };
}
export function scalePlacements(
  placements: Placement[],
  factor: number,
): Placement[] {
  if (!Number.isFinite(factor) || factor <= 0)
    throw new Error("Scale must be positive");
  return placements.map((p) => ({ ...p, u: p.u * factor, v: p.v * factor }));
}
export function alignPlacements(
  placements: Placement[],
  ids: string[],
  mode: "center" | "height" | "spacing",
  gapM?: number,
  artworks: Artwork[] = [],
): Placement[] {
  const selected = new Set(ids),
    changes = new Map<string, Placement>(),
    art = new Map(artworks.map((a) => [a.id, a]));
  const halfWidth = (p: Placement) => {
    const a = art.get(p.artworkId);
    return a ? placementExtents(a, p.rotation)[0] : 0;
  };
  const groups = new Map<string, Placement[]>();
  for (const p of placements)
    if (selected.has(p.id) && !p.locked)
      groups.set(p.wallId, [...(groups.get(p.wallId) || []), p]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (mode === "height" || mode === "center") {
      const key = mode === "height" ? "v" : "u",
        average = group.reduce((s, p) => s + p[key], 0) / group.length;
      group.forEach((p) => changes.set(p.id, { ...p, [key]: average }));
    } else {
      const sorted = [...group].sort((a, b) => a.u - b.u),
        widths = sorted.map((p) => halfWidth(p) * 2);
      const start = sorted[0].u - widths[0] / 2,
        end = sorted[sorted.length - 1].u + widths[widths.length - 1] / 2;
      const gap =
        gapM ??
        (end - start - widths.reduce((s, w) => s + w, 0)) / (sorted.length - 1);
      if (!Number.isFinite(gap) || gap < 0) continue;
      let left = start;
      sorted.forEach((p, i) => {
        changes.set(p.id, { ...p, u: left + widths[i] / 2 });
        left += widths[i] + gap;
      });
    }
  }
  return placements.map((p) => changes.get(p.id) || { ...p });
}
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function wallInwardNormal(wall: Wall, polygon: Vec2[]): Vec3 {
  const length = wallLength(wall);
  if (length < EPS) return [0, 0, 1];
  const nx = -(wall.end[1] - wall.start[1]) / length,
    nz = (wall.end[0] - wall.start[0]) / length;
  const midpoint: Vec2 = [
    (wall.start[0] + wall.end[0]) / 2,
    (wall.start[1] + wall.end[1]) / 2,
  ];
  const left = pointInPolygon(
      [midpoint[0] + nx * 0.02, midpoint[1] + nz * 0.02],
      polygon,
    ),
    right = pointInPolygon(
      [midpoint[0] - nx * 0.02, midpoint[1] - nz * 0.02],
      polygon,
    );
  return !left && right ? [-nx, 0, -nz] : [nx, 0, nz];
}
