"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Edges, Html, Line, OrbitControls } from "@react-three/drei";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
} from "lucide-react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Artwork, Placement, Scene, Vec3, Wall } from "@gallery/shared";
import {
  artworkSize,
  clampPlacement,
  pointInPolygon,
  wallCoordinates,
  wallInwardNormal,
  wallLength,
  wallPoint,
} from "@gallery/three";

export interface SceneCanvasProps {
  scene: Scene;
  artworks: Artwork[];
  placements: Placement[];
  selectedIds: string[];
  onSelect?: (ids: string[]) => void;
  onMove?: (id: string, wallId: string, u: number, v: number) => void;
  onWallSelect?: (wallId: string) => void;
  selectedWallId?: string;
  readOnly?: boolean;
  view?: "orbit" | "top" | "walk";
  onViewChange?: (view: "orbit") => void;
  showGuides?: boolean;
  onPointPick?: (point: Vec3) => void;
  calibrating?: boolean;
}

type CameraAction = "left" | "right" | "up" | "down" | "reset";
type CameraCommand = { sequence: number; action: CameraAction };

class SceneBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" style={{ padding: 32, color: "#5c625e" }}>
        3D 보기를 초기화하지 못했습니다. WebGL을 지원하는 브라우저에서 다시 열어
        주세요.
      </div>
    ) : (
      this.props.children
    );
  }
}

function useArtworkTexture(url: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    setTexture(null);
    if (!url) return;
    let active = true;
    let loaded: THREE.Texture | undefined;
    new THREE.TextureLoader().load(
      url,
      (t) => {
        loaded = t;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        if (active) setTexture(t);
        else t.dispose();
      },
      undefined,
      () => {
        if (active) setTexture(null);
      },
    );
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, [url]);
  return texture;
}

function ArtworkMesh({
  artwork,
  placement,
  wall,
  scene,
  selected,
  onDown,
}: {
  artwork: Artwork;
  placement: Placement;
  wall: Wall;
  scene: Scene;
  selected: boolean;
  onDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const texture = useArtworkTexture(artwork.imageUrl);
  const woodTexture = useMemo(() => {
    if (artwork.frameMaterial !== "wood") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#bd8a56";
    context.fillRect(0, 0, 128, 512);
    for (let x = 0; x < 128; x++) {
      context.strokeStyle = `rgba(87,47,20,${0.04 + (Math.sin(x * 13.7) + 1) * 0.09})`;
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + 4, 160, x - 3, 360, x, 512);
      context.stroke();
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [artwork.frameMaterial]);
  useEffect(() => () => woodTexture?.dispose(), [woodTexture]);
  const { width, height, depth } = artworkSize(artwork),
    normal = wallInwardNormal(wall, scene.floor.polygon);
  const point = wallPoint(wall, placement.u, placement.v),
    offset = wall.thickness / 2 + depth / 2 + 0.009;
  const position: Vec3 = [
    point[0] + normal[0] * offset,
    point[1] + scene.floor.y,
    point[2] + normal[2] * offset,
  ];
  const direction =
    (wall.end[0] - wall.start[0]) * normal[2] -
      (wall.end[1] - wall.start[1]) * normal[0] >=
    0
      ? 1
      : -1;
  const inset = Math.min(artwork.frameWidthMm / 1000, width / 2, height / 2);
  return (
    <group
      position={position}
      rotation={[0, Math.atan2(normal[0], normal[2]), 0]}
    >
      <group
        rotation={[0, 0, (placement.rotation * direction * Math.PI) / 180]}
        onPointerDown={onDown}
      >
        <mesh castShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial
            key={inset > 0 ? (woodTexture?.uuid ?? "black-frame") : "no-frame"}
            map={inset > 0 ? woodTexture : null}
            color={
              inset > 0 ? (woodTexture ? "#ffffff" : "#202020") : "#f6f4ee"
            }
            roughness={artwork.frameMaterial === "wood" ? 0.78 : 0.48}
          />
        </mesh>
        {(artwork.matWidthMm ?? 0) > 0 && (
          <mesh position={[0, 0, depth / 2 + 0.001]}>
            <planeGeometry
              args={[
                (artwork.widthMm + 2 * (artwork.matWidthMm ?? 0)) / 1000,
                (artwork.heightMm + 2 * (artwork.matWidthMm ?? 0)) / 1000,
              ]}
            />
            <meshStandardMaterial color="#faf8f2" roughness={0.95} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
        )}
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <planeGeometry
            args={[artwork.widthMm / 1000, artwork.heightMm / 1000]}
          />
          <meshStandardMaterial
            key={texture?.uuid ?? "loading"}
            map={texture}
            color={texture ? "#ffffff" : "#e5e1d8"}
            roughness={0.9}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
        {selected && (
          <Line
            points={[
              [-width / 2 - 0.015, -height / 2 - 0.015, depth / 2 + 0.004],
              [width / 2 + 0.015, -height / 2 - 0.015, depth / 2 + 0.004],
              [width / 2 + 0.015, height / 2 + 0.015, depth / 2 + 0.004],
              [-width / 2 - 0.015, height / 2 + 0.015, depth / 2 + 0.004],
              [-width / 2 - 0.015, -height / 2 - 0.015, depth / 2 + 0.004],
            ]}
            color="#427f6a"
            lineWidth={2}
          />
        )}
      </group>
    </group>
  );
}

type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
};
function getBounds(scene: Scene): Bounds {
  const points = [
    ...scene.floor.polygon,
    ...scene.walls.flatMap((w) => [w.start, w.end]),
  ];
  if (!points.length)
    return { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 0, maxY: 3 };
  return {
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])),
    maxZ: Math.max(...points.map((p) => p[1])),
    minY: scene.floor.y,
    maxY: scene.floor.y + Math.max(1, ...scene.walls.map((w) => w.height)),
  };
}

function CameraRig({
  scene,
  view,
  dragging,
  bounds,
  command,
}: {
  scene: Scene;
  view: "orbit" | "top" | "walk";
  dragging: boolean;
  bounds: Bounds;
  command: CameraCommand | null;
}) {
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const handledCommand = useRef(0);
  const fittedLayout = useRef("");
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const layout = JSON.stringify([
      scene.id,
      view,
      bounds,
      scene.floor.polygon,
      size.width,
      size.height,
    ]);
    // Saving only artwork settings must not move the camera back to its initial angle.
    if (layout === fittedLayout.current) return;
    fittedLayout.current = layout;
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      bounds.minY,
      (bounds.minZ + bounds.maxZ) / 2,
    );
    const span = Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxZ - bounds.minZ,
      bounds.maxY - bounds.minY,
      2,
    );
    const halfFov =
      camera instanceof THREE.PerspectiveCamera
        ? THREE.MathUtils.degToRad(camera.fov / 2)
        : Math.PI / 8;
    const fitAngle = Math.min(
      halfFov,
      Math.atan((Math.tan(halfFov) * size.width) / Math.max(size.height, 1)),
    );
    const radius =
      Math.hypot(
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY,
        bounds.maxZ - bounds.minZ,
      ) / 2;
    const fitDistance = (Math.max(2, radius) / Math.sin(fitAngle)) * 1.08;
    if (view === "walk") {
      let x = center.x,
        z = center.z;
      if (
        scene.floor.polygon.length &&
        !pointInPolygon([x, z], scene.floor.polygon)
      ) {
        outer: for (let a = 0.1; a < 1; a += 0.1)
          for (let b = 0.1; b < 1; b += 0.1) {
            const xx = bounds.minX + (bounds.maxX - bounds.minX) * a,
              zz = bounds.minZ + (bounds.maxZ - bounds.minZ) * b;
            if (pointInPolygon([xx, zz], scene.floor.polygon)) {
              x = xx;
              z = zz;
              break outer;
            }
          }
      }
      camera.position.set(x, bounds.minY + 1.6, z);
      c.target.set(x, bounds.minY + 1.6, z - 0.001);
    } else if (view === "top") {
      camera.position.set(
        center.x,
        bounds.minY + fitDistance,
        center.z + 0.001,
      );
      c.target.copy(center);
    } else {
      c.target.set(center.x, (bounds.minY + bounds.maxY) / 2, center.z);
      camera.position
        .copy(c.target)
        .add(
          new THREE.Vector3(0.9, 0.9, 1.03)
            .normalize()
            .multiplyScalar(fitDistance),
        );
    }
    camera.near = 0.01;
    camera.far = Math.max(500, span * 30);
    camera.updateProjectionMatrix();
    c.update();
    c.saveState();
  }, [
    camera,
    view,
    bounds,
    scene.id,
    scene.floor.polygon,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    const c = controls.current;
    if (!c || !command || handledCommand.current === command.sequence) return;
    handledCommand.current = command.sequence;
    if (dragging) return;
    const step = Math.PI / 12;
    if (command.action === "reset") {
      // Clear any remaining rotation momentum before restoring the saved view.
      const damping = c.enableDamping;
      c.enableDamping = false;
      c.update();
      c.reset();
      c.enableDamping = damping;
    } else if (command.action === "left" || command.action === "right")
      c.setAzimuthalAngle(
        c.getAzimuthalAngle() + (command.action === "left" ? -step : step),
      );
    else
      c.setPolarAngle(
        THREE.MathUtils.clamp(
          c.getPolarAngle() + (command.action === "up" ? -step : step),
          c.minPolarAngle,
          c.maxPolarAngle,
        ),
      );
  }, [command, dragging]);
  useEffect(() => {
    const el = gl.domElement;
    el.tabIndex = 0;
    const down = (e: KeyboardEvent) => {
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(e.key.toLowerCase())
      ) {
        keys.current.add(e.key.toLowerCase());
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    el.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("blur", clear);
    return () => {
      el.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("blur", clear);
    };
  }, [gl]);
  useFrame((_, dt) => {
    if (view !== "walk" || dragging || !controls.current || !keys.current.size)
      return;
    const k = keys.current,
      forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
    const delta = forward
      .multiplyScalar(
        Number(k.has("w") || k.has("arrowup")) -
          Number(k.has("s") || k.has("arrowdown")),
      )
      .add(
        right.multiplyScalar(
          Number(k.has("d") || k.has("arrowright")) -
            Number(k.has("a") || k.has("arrowleft")),
        ),
      );
    if (!delta.lengthSq()) return;
    delta.normalize().multiplyScalar(Math.min(dt, 0.05) * 1.8);
    const next = camera.position.clone().add(delta);
    if (
      scene.floor.polygon.length &&
      !pointInPolygon([next.x, next.z], scene.floor.polygon)
    )
      return;
    for (const wall of scene.walls) {
      const dx = wall.end[0] - wall.start[0],
        dz = wall.end[1] - wall.start[1],
        l2 = dx * dx + dz * dz;
      if (l2 === 0) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((next.x - wall.start[0]) * dx + (next.z - wall.start[1]) * dz) / l2,
        ),
      );
      if (
        Math.hypot(
          next.x - wall.start[0] - t * dx,
          next.z - wall.start[1] - t * dz,
        ) <
        0.15 + wall.thickness / 2
      )
        return;
    }
    camera.position.copy(next);
    controls.current.target.add(delta);
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      enableDamping
      dampingFactor={0.12}
      enableRotate={view !== "top"}
      enablePan={view !== "walk"}
      enableZoom={view !== "walk"}
      minDistance={view === "walk" ? 0.001 : 0.15}
      maxDistance={200}
      minPolarAngle={view === "walk" ? Math.PI * 0.32 : 0.001}
      maxPolarAngle={view === "walk" ? Math.PI * 0.68 : Math.PI * 0.95}
    />
  );
}

function WallMesh({
  wall,
  scene,
  selected,
  view,
  onDown,
  showGuides,
}: {
  wall: Wall;
  scene: Scene;
  selected: boolean;
  view: string;
  onDown: (event: ThreeEvent<PointerEvent>) => void;
  showGuides: boolean;
}) {
  const normal = wallInwardNormal(wall, scene.floor.polygon),
    length = wallLength(wall),
    point = wallPoint(wall, length / 2, wall.height / 2);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ camera }) => {
    if (!material.current) return;
    const outside =
      (camera.position.x - point[0]) * normal[0] +
        (camera.position.z - point[2]) * normal[2] <
      -0.05;
    const opacity = view === "top" ? 0.3 : outside ? 0.12 : 1;
    material.current.opacity = opacity;
    material.current.depthWrite = opacity === 1;
  });
  return (
    <group
      position={[point[0], scene.floor.y, point[2]]}
      rotation={[0, Math.atan2(normal[0], normal[2]), 0]}
    >
      <mesh
        position={[0, wall.height / 2, 0]}
        receiveShadow
        onPointerDown={(e) => {
          if (view !== "top" && (material.current?.opacity ?? 1) < 0.2) return;
          onDown(e);
        }}
      >
        <boxGeometry
          args={[length, wall.height, Math.max(0.015, wall.thickness)]}
        />
        <meshStandardMaterial
          ref={material}
          color={selected ? "#b9cdee" : "#f5f3ed"}
          roughness={0.88}
          transparent
          side={THREE.DoubleSide}
        />
        <Edges
          color={selected ? "#5275a8" : "#96988f"}
          transparent
          opacity={selected ? 0.75 : 0.22}
        />
      </mesh>
      <mesh
        position={[
          0,
          0.025,
          normal[0] === 0 && normal[2] === 0 ? 0 : wall.thickness / 2 + 0.001,
        ]}
      >
        <boxGeometry args={[length, 0.05, 0.018]} />
        <meshStandardMaterial color="#dfdcd3" roughness={0.8} />
      </mesh>
      {showGuides && wall.height >= 1.45 && (
        <Line
          points={[
            [-length / 2, 1.45, wall.thickness / 2 + 0.01],
            [length / 2, 1.45, wall.thickness / 2 + 0.01],
          ]}
          color={selected ? "#577768" : "#b2b3a7"}
          lineWidth={1}
          dashed
          dashSize={0.07}
          gapSize={0.05}
        />
      )}
    </group>
  );
}

function SparseCloud({
  url,
  scale,
  onBounds,
  onPointPick,
}: {
  url: string;
  scale: number;
  onBounds: (bounds: Bounds) => void;
  onPointPick: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const [cloud, setCloud] = useState<{
    positions: Float32Array;
    colors: Float32Array;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    setCloud(null);
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Point cloud unavailable");
        const length = Number(response.headers.get("content-length"));
        if (length > 16 * 1024 * 1024) throw new Error("Point cloud too large");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Point cloud response is empty");
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("Point cloud too large");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (
          !Array.isArray(data.positions) ||
          !data.positions.length ||
          data.positions.length % 3 !== 0
        )
          throw new Error("Invalid point cloud");
        const count = Math.min(100000, data.positions.length / 3),
          positions = new Float32Array(count * 3),
          colors = new Float32Array(count * 3);
        const stride = Math.max(
          1,
          Math.floor(data.positions.length / 3 / count),
        );
        const bounds: Bounds = {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
          minZ: Infinity,
          maxZ: -Infinity,
        };
        for (let i = 0; i < count; i++)
          for (let axis = 0; axis < 3; axis++) {
            const value = Number(data.positions[i * stride * 3 + axis]) * scale;
            if (!Number.isFinite(value))
              throw new Error("Invalid point coordinate");
            positions[i * 3 + axis] = value;
            const color = Number(data.colors?.[i * stride * 3 + axis] ?? 0.6);
            colors[i * 3 + axis] = Number.isFinite(color)
              ? Math.min(1, Math.max(0, color > 1 ? color / 255 : color))
              : 0.6;
            if (axis === 0) {
              bounds.minX = Math.min(bounds.minX, value);
              bounds.maxX = Math.max(bounds.maxX, value);
            }
            if (axis === 1) {
              bounds.minY = Math.min(bounds.minY, value);
              bounds.maxY = Math.max(bounds.maxY, value);
            }
            if (axis === 2) {
              bounds.minZ = Math.min(bounds.minZ, value);
              bounds.maxZ = Math.max(bounds.maxZ, value);
            }
          }
        if (!controller.signal.aborted) {
          setCloud({ positions, colors });
          if (count) onBounds(bounds);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCloud(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [url, scale, onBounds]);
  if (error)
    return (
      <Html center>
        <div
          role="alert"
          style={{
            width: 260,
            padding: 20,
            background: "#fffaf4",
            borderRadius: 12,
            color: "#754b34",
            fontSize: 13,
          }}
        >
          포인트 클라우드 파일을 읽지 못했습니다. 파일 접근 권한과 재구성 결과를
          확인해 주세요.
        </div>
      </Html>
    );
  if (!cloud) return null;
  return (
    <points
      onPointerDown={(event) => {
        if (event.index !== undefined) {
          const index = event.index * 3;
          event.point.set(
            cloud.positions[index],
            cloud.positions[index + 1],
            cloud.positions[index + 2],
          );
        }
        onPointPick(event);
      }}
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[cloud.positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[cloud.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={0.022} sizeAttenuation />
    </points>
  );
}

function GalleryScene(
  props: SceneCanvasProps & { command: CameraCommand | null },
) {
  const {
    scene,
    artworks,
    placements,
    selectedIds,
    view = "orbit",
    showGuides = false,
  } = props;
  const { camera, gl } = useThree();
  const [draft, setDraft] = useState<Placement | null>(null),
    [cloudBounds, setCloudBounds] = useState<Bounds | null>(null);
  const baseBounds = useMemo(() => getBounds(scene), [scene]);
  // Sparse reconstruction deliberately has no inferred floor; an empty Shape cannot close a path.
  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    scene.floor.polygon.forEach((p, i) =>
      i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1]),
    );
    if (scene.floor.polygon.length >= 3) shape.closePath();
    return shape;
  }, [scene.floor.polygon]);
  const drag = useRef<{
    placement: Placement;
    artwork: Artwork;
    wall: Wall;
    plane: THREE.Plane;
    offset: THREE.Vector2;
    pointerId: number;
    startX: number;
    startY: number;
    last: Placement;
    moved: boolean;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  useEffect(() => {
    const raycaster = new THREE.Raycaster(),
      position = new THREE.Vector3();
    const move = (e: PointerEvent) => {
      const active = drag.current;
      if (!active || e.pointerId !== active.pointerId) return;
      if (
        Math.hypot(e.clientX - active.startX, e.clientY - active.startY) < 3 &&
        !active.moved
      )
        return;
      const rect = gl.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      if (!raycaster.ray.intersectPlane(active.plane, position)) return;
      const [u, v] = wallCoordinates(active.wall, [
        position.x,
        position.y - scene.floor.y,
        position.z,
      ]);
      let nextU = u - active.offset.x,
        nextV = v - active.offset.y;
      if (propsRef.current.showGuides && Math.abs(nextV - 1.45) < 0.045)
        nextV = 1.45;
      if (!e.altKey) {
        nextU = Math.round(nextU * 100) / 100;
        nextV = Math.round(nextV * 100) / 100;
      }
      active.last = clampPlacement(
        { ...active.placement, u: nextU, v: nextV },
        active.artwork,
        active.wall,
      );
      active.moved = true;
      setDraft(active.last);
      e.preventDefault();
    };
    const end = (e: PointerEvent) => {
      const active = drag.current;
      if (!active || e.pointerId !== active.pointerId) return;
      drag.current = null;
      setDraft(null);
      if (gl.domElement.hasPointerCapture(e.pointerId))
        gl.domElement.releasePointerCapture(e.pointerId);
      if (active.moved && e.type !== "pointercancel")
        propsRef.current.onMove?.(
          active.last.id,
          active.last.wallId,
          active.last.u,
          active.last.v,
        );
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [camera, gl, scene.floor.y]);
  const pick = (e: ThreeEvent<PointerEvent>) => {
    if (props.calibrating) {
      e.stopPropagation();
      props.onPointPick?.([e.point.x, e.point.y, e.point.z]);
      return true;
    }
    return false;
  };
  const startDrag = (
    e: ThreeEvent<PointerEvent>,
    placement: Placement,
    artwork: Artwork,
    wall: Wall,
  ) => {
    e.stopPropagation();
    if (pick(e)) return;
    if (props.readOnly) return;
    gl.domElement.focus();
    props.onSelect?.(
      e.shiftKey
        ? selectedIds.includes(placement.id)
          ? selectedIds.filter((id) => id !== placement.id)
          : [...selectedIds, placement.id]
        : [placement.id],
    );
    props.onWallSelect?.(wall.id);
    if (placement.locked || e.button !== 0 || e.shiftKey) return;
    const normal = wallInwardNormal(wall, scene.floor.polygon),
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(...normal),
        e.point,
      );
    const [u, v] = wallCoordinates(wall, [
      e.point.x,
      e.point.y - scene.floor.y,
      e.point.z,
    ]);
    drag.current = {
      placement,
      artwork,
      wall,
      plane,
      offset: new THREE.Vector2(u - placement.u, v - placement.v),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      last: placement,
      moved: false,
    };
    setDraft(placement);
    gl.domElement.setPointerCapture(e.pointerId);
  };
  return (
    <>
      <color attach="background" args={["#e9e9e2"]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#fffdf5", "#b8b6ad", 0.8]} />
      <directionalLight
        position={[4, 10, 3]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-14, 14, 14, -14, 0.5, 40]}
        />
      </directionalLight>
      {scene.floor.polygon.length >= 3 && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, scene.floor.y - 0.012, 0]}
          receiveShadow
          onPointerDown={(e) => {
            if (pick(e)) return;
            if (!props.readOnly && !e.shiftKey) props.onSelect?.([]);
          }}
        >
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial
            color="#d9d6ce"
            roughness={0.78}
            metalness={0.03}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {scene.walls
        .filter((w) => wallLength(w) > 0.001)
        .map((wall) => (
          <WallMesh
            key={wall.id}
            wall={wall}
            scene={scene}
            selected={props.selectedWallId === wall.id}
            view={view}
            showGuides={showGuides}
            onDown={(e) => {
              e.stopPropagation();
              if (!pick(e) && !props.readOnly) props.onWallSelect?.(wall.id);
            }}
          />
        ))}
      {placements.map((p) => {
        const wall = scene.walls.find(
            (w) => w.id === (draft?.id === p.id ? draft.wallId : p.wallId),
          ),
          artwork = artworks.find((a) => a.id === p.artworkId);
        if (!wall || !artwork) return null;
        return (
          <ArtworkMesh
            key={p.id}
            artwork={artwork}
            placement={draft?.id === p.id ? draft : p}
            wall={wall}
            scene={scene}
            selected={!props.readOnly && selectedIds.includes(p.id)}
            onDown={(e) => startDrag(e, p, artwork, wall)}
          />
        );
      })}
      {scene.visual.kind === "sparse" && scene.visual.url && (
        <SparseCloud
          url={scene.visual.url}
          scale={scene.calibration.scaleFactor}
          onBounds={setCloudBounds}
          onPointPick={pick}
        />
      )}
      <CameraRig
        scene={scene}
        view={view}
        dragging={!!draft}
        bounds={cloudBounds ?? baseBounds}
        command={props.command}
      />
    </>
  );
}

export default function SceneCanvas(props: SceneCanvasProps) {
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const rotate = (action: CameraAction) => {
    if (props.view === "top" && action !== "reset")
      props.onViewChange?.("orbit");
    setCommand((previous) => ({
      sequence: (previous?.sequence ?? 0) + 1,
      action,
    }));
  };
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        position: "relative",
        touchAction: "none",
      }}
      data-testid="scene-canvas"
    >
      <SceneBoundary>
        <Canvas
          shadows
          raycaster={{
            params: {
              Points: { threshold: 0.09 },
              Line: { threshold: 0.05 },
              Mesh: {},
              LOD: {},
              Sprite: {},
            },
          }}
          dpr={[1, 2]}
          camera={{ fov: 45, position: [10, 12, 14], near: 0.01, far: 500 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <GalleryScene {...props} command={command} />
        </Canvas>
      </SceneBoundary>
      {props.view !== "walk" && !props.calibrating && (
        <div className="scene-rotation" role="group" aria-label="도면 회전">
          <span className="scene-rotation-label">도면 회전</span>
          {(
            [
              ["up", "위로 회전", ArrowUp],
              ["left", "왼쪽으로 회전", ArrowLeft],
              ["reset", "처음 시점으로", RotateCcw],
              ["right", "오른쪽으로 회전", ArrowRight],
              ["down", "아래로 회전", ArrowDown],
            ] as const
          ).map(([action, label, Icon]) => (
            <button
              key={action}
              type="button"
              className={`scene-rotation-button scene-rotation-${action}`}
              aria-label={label}
              title={label}
              onClick={() => rotate(action)}
            >
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 62,
          left: 16,
          color: "#5b625a",
          fontSize: 11,
          pointerEvents: "none",
          background: "rgba(250,250,247,.88)",
          padding: "6px 10px",
          borderRadius: 6,
          maxWidth: "calc(100% - 32px)",
        }}
      >
        {props.calibrating
          ? "기준 거리의 두 지점을 클릭하세요"
          : props.view === "walk"
            ? "화면 클릭 후 WASD / 방향키로 이동 · 드래그로 둘러보기"
            : props.readOnly
              ? "드래그 / 화살표 버튼으로 회전 · 휠로 확대"
              : props.view === "top"
                ? "화살표 버튼으로 3D 회전 · 휠로 확대 · 우클릭 드래그로 이동"
                : "빈 공간 드래그 / 화살표 버튼으로 회전 · 휠로 확대 · 작품 드래그로 배치"}
        {props.scene.visual.kind === "sparse" &&
          " · 희소 포인트 클라우드 — 벽·바닥 미추정"}
      </div>
    </div>
  );
}
