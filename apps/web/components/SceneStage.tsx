"use client";
import dynamic from "next/dynamic";
import type { Artwork, Placement, Scene, Vec3 } from "@gallery/shared";

const SceneCanvas = dynamic(() => import("./SceneCanvas"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "#68707a",
      }}
    >
      공간 뷰를 준비하고 있습니다…
    </div>
  ),
});

export function SceneStage(props: {
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
  onViewChange?: (view: "orbit" | "walk") => void;
  showGuides?: boolean;
  onPointPick?: (point: Vec3) => void;
  calibrating?: boolean;
}) {
  return <SceneCanvas {...props} />;
}
