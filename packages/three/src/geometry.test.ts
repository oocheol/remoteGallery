import { describe, it, expect } from "vitest";
import type { Artwork, Placement, Scene, Wall } from "@gallery/shared";
import {
  observerPose,
  alignPlacements,
  artworkSize,
  artworkLayout,
  validArtworkMat,
  calibrateScene,
  clampPlacement,
  findCollisions,
  placementExtents,
  pointInPolygon,
  scalePlacements,
  validatePlacement,
  wallCoordinates,
  wallInwardNormal,
  wallLength,
  wallPoint,
  walkPosition,
} from "./index";
const wall: Wall = {
  id: "wall",
  name: "Wall",
  start: [2, 3],
  end: [5, 7],
  height: 2.74,
  thickness: 0.12,
};
const art: Artwork = {
  id: "art",
  galleryId: "gallery",
  title: "Artwork",
  type: "image",
  imageUrl: "/art.jpg",
  widthMm: 600,
  heightMm: 400,
  depthMm: 20,
  frameWidthMm: 25,
  frameDepthMm: 35,
};
const placement: Placement = {
  id: "p",
  artworkId: "art",
  wallId: "wall",
  u: 2,
  v: 1.45,
  rotation: 0,
  locked: false,
};

describe("walking destinations", () => {
  const polygon: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  const room = (): Scene => ({
    ...scene,
    floor: { polygon, y: 0.3 },
    walls: polygon.map((start, i) => ({
      ...wall,
      id: `edge-${i}`,
      start,
      end: polygon[(i + 1) % polygon.length],
    })),
  });
  it("uses the clicked floor position at eye level and stands inward from walls", () => {
    const floor = walkPosition(room(), [2, 0.3, 2])!;
    expect([floor[0], floor[2]]).toEqual([2, 2]);
    expect(floor[1]).toBeCloseTo(1.9);
    const destination = walkPosition(room(), [2, 1.4, 0], "edge-0")!;
    expect(destination[0]).toBe(2);
    expect(destination[1]).toBeCloseTo(1.9);
    expect(destination[2]).toBeCloseTo(1.56);
    expect(pointInPolygon([destination[0], destination[2]], polygon)).toBe(
      true,
    );
  });
  it("adjusts corner picks away from both walls and rejects unusable spaces", () => {
    const corner = walkPosition(room(), [0, 0, 0])!;
    expect(corner[0]).toBeGreaterThanOrEqual(0.26);
    expect(corner[2]).toBeGreaterThanOrEqual(0.26);
    expect(
      walkPosition(
        {
          ...room(),
          floor: {
            polygon: [
              [0, 0],
              [0.1, 0],
              [0.1, 0.1],
              [0, 0.1],
            ],
            y: 0,
          },
        },
        [0, 0, 0],
      ),
    ).toBeNull();
    expect(walkPosition(room(), [NaN, 0, 0])).toBeNull();
  });
});
const scene: Scene = {
  id: "scene",
  galleryId: "gallery",
  version: 1,
  name: "Gallery",
  kind: "manual",
  walls: [wall],
  floor: {
    polygon: [
      [0, 0],
      [6, 0],
      [6, 8],
      [0, 8],
    ],
    y: 0.1,
  },
  calibration: { status: "uncalibrated", source: "test", scaleFactor: 1 },
  visual: { kind: "none" },
  warnings: [],
};
describe("wall coordinates", () => {
  it("converts diagonal walls using meters along the segment and Y above floor", () => {
    expect(wallLength(wall)).toBe(5);
    expect(wallPoint(wall, 2.5, 1.45)).toEqual([3.5, 1.45, 5]);
    expect(wallCoordinates(wall, [3.5, 1.45, 5])).toEqual([2.5, 1.45]);
    expect(() => wallPoint({ ...wall, end: wall.start }, 1, 1)).toThrow();
  });
  it("keeps concave plan recesses outside and computes normals independent of edge direction", () => {
    const polygon: Scene["floor"]["polygon"] = [
      [0, 0],
      [3.85, 0],
      [3.85, 1.7],
      [5.9, 1.7],
      [5.9, 3.45],
      [6.95, 3.45],
      [6.95, 8.35],
      [0, 8.35],
    ];
    expect(pointInPolygon([5, 1], polygon)).toBe(false);
    expect(pointInPolygon([5, 2], polygon)).toBe(true);
    const edge = {
      ...wall,
      start: [0, 0] as [number, number],
      end: [3.85, 0] as [number, number],
    };
    expect(wallInwardNormal(edge, polygon)).toEqual([-0, 0, 1]);
    expect(
      wallInwardNormal({ ...edge, start: edge.end, end: edge.start }, polygon),
    ).toEqual([0, 0, 1]);
  });
});
describe("physical bounds and calibration", () => {
  it("keeps original size and wall spacing fixed while an inset mat shrinks the image", () => {
    const matted = { ...art, matWidthMm: 50, frameMaterial: "wood" as const };
    expect(artworkSize(matted)).toEqual(artworkSize(art));
    expect(artworkLayout(matted)).toMatchObject({
      imageWidthMm: 450,
      imageHeightMm: 250,
      boardWidthMm: 550,
      boardHeightMm: 350,
    });
    expect(validatePlacement({ ...placement, u: 0.34 }, matted, wall)).toEqual(
      [],
    );
    const pair = [placement, { ...placement, id: "p2", u: placement.u + 0.7 }];
    expect(findCollisions(pair, [matted], [wall])).toHaveLength(0);
    expect(clampPlacement(placement, matted, wall)).toEqual(placement);
    expect(validArtworkMat({ ...art, matWidthMm: 200 })).toBe(false);
    expect(validArtworkMat({ ...art, matWidthMm: 174.5 })).toBe(true);
    expect(artworkLayout({ ...art, matWidthMm: 0 }).imageWidthMm).toBe(550);
  });
  it("preserves the old outside-mat layout in immutable legacy shares", () => {
    const legacy = {
      ...art,
      matWidthMm: 50,
      matSizing: "outset" as const,
      frameSizing: "outset" as const,
    };
    expect(artworkSize(legacy)).toEqual({
      width: 0.75,
      height: 0.55,
      depth: 0.035,
    });
    expect(artworkLayout(legacy).imageWidthMm).toBe(600);
  });
  it("includes the full frame, clamps center, and rejects oversized work", () => {
    expect(artworkSize(art)).toEqual({
      width: 0.6,
      height: 0.4,
      depth: 0.035,
    });
    const clamped = clampPlacement({ ...placement, u: -10, v: 100 }, art, wall);
    expect(clamped.u).toBe(0.3);
    expect(clamped.v).toBeCloseTo(2.54);
    expect(validatePlacement(clamped, art, wall)).toEqual([]);
    expect(validatePlacement({ ...placement, u: 0.29 }, art, wall)).toContain(
      "Artwork frame exceeds wall width",
    );
    expect(
      validatePlacement(
        clampPlacement(placement, { ...art, widthMm: 6000 }, wall),
        { ...art, widthMm: 6000 },
        wall,
      ),
    ).toContain("Artwork frame exceeds wall width");
  });
  it("accounts for rotated outer corners at the wall boundary", () => {
    const [x, y] = placementExtents(art, 90);
    expect(x).toBeCloseTo(0.2);
    expect(y).toBeCloseTo(0.3);
    expect(
      validatePlacement({ ...placement, rotation: 90, v: 0.29 }, art, wall),
    ).toContain("Artwork frame exceeds wall height");
  });
  it("scales geometry and positions but preserves physical artwork millimeters", () => {
    const original = JSON.stringify(scene),
      size = artworkSize(art),
      scaled = calibrateScene(scene, 10, [
        [0, 0, 0],
        [3, 4, 0],
      ]);
    expect(wallLength(scaled.walls[0])).toBe(10);
    expect(scaled.floor.y).toBe(0.2);
    expect(scaled.walls[0].thickness).toBe(0.24);
    expect(scaled.calibration.scaleFactor).toBe(2);
    expect(scaled.calibration.points).toEqual([
      [0, 0, 0],
      [6, 8, 0],
    ]);
    expect(scalePlacements([placement], 2)[0]).toMatchObject({ u: 4, v: 2.9 });
    expect(artworkSize(art)).toEqual(size);
    expect(art.widthMm).toBe(600);
    expect(JSON.stringify(scene)).toBe(original);
    expect(
      calibrateScene(scaled, 5, [
        [0, 0, 0],
        [6, 8, 0],
      ]).calibration.scaleFactor,
    ).toBe(1);
    expect(() =>
      calibrateScene(scene, 1, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toThrow();
    expect(() =>
      calibrateScene(scene, -1, [
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toThrow();
  });
});
describe("collisions and layout", () => {
  it("finds actual frame overlaps but allows touching frames and ignores other walls", () => {
    expect(
      findCollisions(
        [placement, { ...placement, id: "p2", u: 2.59 }],
        [art],
        [wall],
      ),
    ).toEqual(["p overlaps p2"]);
    expect(
      findCollisions(
        [placement, { ...placement, id: "p2", u: 2.6 }],
        [art],
        [wall],
      ),
    ).toEqual([]);
    expect(
      findCollisions(
        [placement, { ...placement, id: "p2", wallId: "other" }],
        [art],
        [wall],
      ),
    ).toEqual([]);
  });
  it("uses separating axes for rotated rectangles, not merely bounding boxes", () => {
    const thin = { ...art, widthMm: 1000, heightMm: 20, frameWidthMm: 0 };
    expect(
      findCollisions(
        [
          { ...placement, rotation: 45 },
          { ...placement, id: "p2", rotation: 45, v: 1.65 },
        ],
        [thin],
        [wall],
      ),
    ).toEqual([]);
    expect(
      findCollisions(
        [
          { ...placement, rotation: 45 },
          { ...placement, id: "p2", rotation: -45 },
        ],
        [thin],
        [wall],
      ),
    ).toEqual(["p overlaps p2"]);
  });
  it("distributes equal edge gaps for differently sized frames", () => {
    const a = { ...art, id: "a", widthMm: 1000, frameWidthMm: 0 },
      b = { ...art, id: "b", widthMm: 2000, frameWidthMm: 0 },
      c = { ...art, id: "c", widthMm: 500, frameWidthMm: 0 };
    const ps = [
      { ...placement, id: "a", artworkId: "a", u: 1 },
      { ...placement, id: "b", artworkId: "b", u: 3 },
      { ...placement, id: "c", artworkId: "c", u: 4.75 },
    ];
    const aligned = alignPlacements(ps, ["a", "b", "c"], "spacing", undefined, [
      a,
      b,
      c,
    ]);
    expect(aligned.map((p) => p.u)).toEqual([1, 3, 4.75]);
    const gap1 = aligned[1].u - 1 - (aligned[0].u + 0.5),
      gap2 = aligned[2].u - 0.25 - (aligned[1].u + 1);
    expect(gap1).toBe(0.5);
    expect(gap2).toBe(0.5);
    const explicit = alignPlacements(ps, ["a", "b", "c"], "spacing", 0.2, [
      a,
      b,
      c,
    ]);
    expect(explicit[1].u).toBeCloseTo(2.7);
    expect(explicit[2].u).toBeCloseTo(4.15);
  });
  it("never aligns across walls or changes locked placements", () => {
    const ps = [
      placement,
      { ...placement, id: "p2", v: 2 },
      { ...placement, id: "p3", v: 0.5, locked: true },
      { ...placement, id: "p4", v: 1, wallId: "other" },
    ];
    const result = alignPlacements(
      ps,
      ps.map((p) => p.id),
      "height",
    );
    expect(result[0].v).toBe(1.725);
    expect(result[1].v).toBe(1.725);
    expect(result[2].v).toBe(0.5);
    expect(result[3].v).toBe(1);
  });
});

describe("observer scale and viewing distance", () => {
  it("keeps eyes 1m from the front surface, including frame depth, on either wall direction", () => {
    for (const reverse of [false, true]) {
      const room: Scene = {
        ...scene,
        floor: {
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
          y: 0.3,
        },
        walls: [
          {
            ...wall,
            start: reverse ? [4, 0] : [0, 0],
            end: reverse ? [0, 0] : [4, 0],
          },
        ],
      };
      for (const height of [500, 1700, 2500]) {
        const pose = observerPose(room, placement, art, height)!;
        expect(pose.eye[1]).toBeCloseTo(0.3 + (height / 1000) * 0.93);
        expect(pose.position[1]).toBe(0.3);
        expect(
          Math.hypot(
            pose.eye[0] - pose.target[0],
            pose.eye[2] - pose.target[2],
          ),
        ).toBeCloseTo(1);
        expect(pose.target[2]).toBeCloseTo(
          wall.thickness / 2 + art.frameDepthMm / 1000 + 0.011,
        );
        expect(pose.eye[2]).toBeGreaterThan(pose.target[2]);
        expect(pose.fits).toBe(true);
      }
    }
  });
  it("warns about insufficient room without altering the requested viewing distance", () => {
    const room: Scene = {
      ...scene,
      floor: {
        polygon: [
          [0, 0],
          [4, 0],
          [4, 0.8],
          [0, 0.8],
        ],
        y: 0,
      },
      walls: [{ ...wall, start: [0, 0], end: [4, 0] }],
    };
    const pose = observerPose(room, placement, art, 1700)!;
    expect(pose.fits).toBe(false);
    expect(
      Math.hypot(pose.eye[0] - pose.target[0], pose.eye[2] - pose.target[2]),
    ).toBeCloseTo(1);
  });
});

describe("fixed entered outer dimensions", () => {
  it("keeps a 700mm frame fixed while frame and mat consume the photo, including no frame", () => {
    for (const frameWidthMm of [0, 20, 100]) {
      const square = {
        ...art,
        widthMm: 700,
        heightMm: 700,
        frameWidthMm,
        matWidthMm: 50,
      };
      expect(artworkSize(square)).toMatchObject({ width: 0.7, height: 0.7 });
      expect(artworkLayout(square).imageWidthMm).toBe(600 - 2 * frameWidthMm);
      expect(artworkLayout(square).imageHeightMm).toBe(600 - 2 * frameWidthMm);
      const atEdge = { ...placement, u: 0.35, v: 0.35 };
      expect(clampPlacement(atEdge, square, wall)).toEqual(atEdge);
      expect(
        findCollisions(
          [atEdge, { ...atEdge, id: "next", u: 1.05 }],
          [square],
          [wall],
        ),
      ).toEqual([]);
    }
  });
  it("validates the combined frame and mat and keeps legacy inset-mat shares unchanged", () => {
    expect(validArtworkMat({ ...art, frameWidthMm: 175, matWidthMm: 25 })).toBe(
      false,
    );
    expect(
      validArtworkMat({ ...art, frameWidthMm: 175, matWidthMm: 24.5 }),
    ).toBe(true);
    const legacy = {
      ...art,
      frameSizing: "outset" as const,
      matSizing: "inset" as const,
      matWidthMm: 50,
    };
    expect(artworkLayout(legacy)).toMatchObject({
      widthMm: 650,
      heightMm: 450,
      imageWidthMm: 500,
      imageHeightMm: 300,
    });
  });
});
