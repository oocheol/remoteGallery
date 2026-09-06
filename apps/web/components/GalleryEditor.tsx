"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignVerticalJustifyCenter,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  FileUp,
  Grid2X2,
  ImagePlus,
  Info,
  Layers3,
  Link2,
  LoaderCircle,
  Lock,
  LockKeyhole,
  Maximize2,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Share2,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import type {
  Artwork,
  GalleryDetail,
  Placement,
  Scene,
  Vec3,
  Wall,
} from "@gallery/shared";
import {
  alignPlacements,
  calibrateScene,
  clampPlacement,
  findCollisions,
  scalePlacements,
  wallLength,
} from "@gallery/three";
import { api, ApiError, jobLabel } from "@/lib/api";
import { AppBrand } from "./AppBrand";
import { SceneStage } from "./SceneStage";

type Snapshot = { scene: Scene; placements: Placement[]; revision: number };
const num = (value: string, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const m = (value: number) => `${value.toFixed(2)} m`;

export function GalleryEditor({ galleryId }: { galleryId: string }) {
  const [detail, setDetail] = useState<GalleryDetail | null>(null);
  const [workingScene, setWorkingScene] = useState<Scene | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedWallId, setSelectedWallId] = useState<string | undefined>();
  const [selectedArtworkId, setSelectedArtworkId] = useState<
    string | undefined
  >();
  const [view, setView] = useState<"orbit" | "top" | "walk">("orbit");
  const [showGuides, setShowGuides] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [artOpen, setArtOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(true);
  const [calibration, setCalibration] = useState(false);
  const [points, setPoints] = useState<Vec3[]>([]);
  const [distance, setDistance] = useState("1");
  const [shareUrl, setShareUrl] = useState("");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [saving, setSaving] = useState(false);
  const firstLoad = useRef(true);
  const reload = useCallback(async () => {
    try {
      const data = await api<GalleryDetail>(`/api/galleries/${galleryId}`);
      setDetail(data);
      setWorkingScene(data.scene);
      setPlacements(data.exhibition.placements);
      setSelectedWallId((current) =>
        current && data.scene?.walls.some((w) => w.id === current)
          ? current
          : data.scene?.walls[0]?.id,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "프로젝트를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [galleryId]);
  useEffect(() => {
    void api("/api/session")
      .then(reload)
      .catch((e) => {
        setError(
          e instanceof Error ? e.message : "세션을 시작하지 못했습니다.",
        );
        setLoading(false);
      });
  }, [reload]);
  useEffect(() => {
    const active = detail?.jobs.some(
      (job) => !["READY", "FAILED"].includes(job.status),
    );
    if (!active) return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [detail?.jobs, reload]);
  const snapshot = useCallback(
    () =>
      workingScene && detail
        ? {
            scene: workingScene,
            placements,
            revision: detail.exhibition.revision,
          }
        : null,
    [workingScene, placements, detail],
  );
  const commit = useCallback(
    (nextScene: Scene, nextPlacements: Placement[]) => {
      const current = snapshot();
      if (current) {
        setHistory((items) => [...items.slice(-39), current]);
        setFuture([]);
      }
      setWorkingScene(nextScene);
      setPlacements(nextPlacements);
    },
    [snapshot],
  );
  const selectedWall = workingScene?.walls.find((w) => w.id === selectedWallId);
  const selectedPlacement = placements.find(
    (p) => selectedIds.length === 1 && p.id === selectedIds[0],
  );
  const selectedArt = detail?.artworks.find(
    (a) => a.id === selectedPlacement?.artworkId,
  );
  const collisions = useMemo(
    () =>
      workingScene && detail
        ? findCollisions(placements, detail.artworks, workingScene.walls)
        : [],
    [workingScene, detail, placements],
  );
  function undo() {
    const previous = history.at(-1);
    const current = snapshot();
    if (!previous || !current) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items]);
    setWorkingScene(previous.scene);
    setPlacements(previous.placements);
  }
  function redo() {
    const next = future[0];
    const current = snapshot();
    if (!next || !current) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, current]);
    setWorkingScene(next.scene);
    setPlacements(next.placements);
  }
  function applyPlacement(next: Placement) {
    if (!workingScene || !detail) return;
    const wall = workingScene.walls.find((w) => w.id === next.wallId),
      art = detail.artworks.find((a) => a.id === next.artworkId);
    if (!wall || !art) return;
    commit(
      workingScene,
      placements.map((p) =>
        p.id === next.id ? clampPlacement(next, art, wall) : p,
      ),
    );
  }
  function addArtwork(artworkId: string) {
    if (!workingScene || !detail) return;
    const wall =
      workingScene.walls.find((w) => w.id === selectedWallId) ||
      workingScene.walls[0];
    const art = detail.artworks.find((a) => a.id === artworkId);
    if (!wall || !art) {
      setError("먼저 벽과 작품을 선택해 주세요.");
      return;
    }
    const draft: Placement = {
      id: crypto.randomUUID(),
      artworkId,
      wallId: wall.id,
      u: wallLength(wall) / 2,
      v: wall.height / 2,
      rotation: 0,
      locked: false,
    };
    const next = clampPlacement(draft, art, wall);
    commit(workingScene, [...placements, next]);
    setSelectedIds([next.id]);
    setSelectedArtworkId(artworkId);
    setMessage(
      "작품을 벽 중앙에 추가했습니다. 캔버스에서 드래그하거나 수치를 입력해 배치하세요.",
    );
  }
  function updateWall(patch: Partial<Wall>) {
    if (!workingScene || !selectedWall) return;
    commit(
      {
        ...workingScene,
        walls: workingScene.walls.map((w) =>
          w.id === selectedWall.id ? { ...w, ...patch } : w,
        ),
      },
      placements,
    );
  }
  function addManualWall() {
    if (!workingScene) return;
    const index = workingScene.walls.length + 1;
    const wall: Wall = {
      id: crypto.randomUUID(),
      name: `수동 벽 ${index}`,
      start: [0, 0],
      end: [3, 0],
      height: 2.7,
      thickness: 0.12,
      estimated: true,
    };
    commit(
      {
        ...workingScene,
        walls: [...workingScene.walls, wall],
        warnings: [
          ...workingScene.warnings,
          "수동으로 추가한 벽의 치수를 현장에서 확인하세요.",
        ],
      },
      placements,
    );
    setSelectedWallId(wall.id);
    setMessage(
      "3.00m × 2.70m 수동 벽을 추가했습니다. 시작점, 끝점과 높이를 실제 치수로 입력하세요.",
    );
  }
  function addManualFloor() {
    if (!workingScene) return;
    commit(
      {
        ...workingScene,
        floor: {
          polygon: [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
          ],
          y: 0,
        },
        warnings: [
          ...workingScene.warnings,
          "5 × 5m 수동 바닥을 추가했습니다. 현장 치수로 수정하세요.",
        ],
      },
      placements,
    );
    setMessage(
      "5 × 5m 수동 바닥을 추가했습니다. 수동 벽의 좌표를 실제 도면에 맞게 조정하세요.",
    );
  }
  function startCalibration() {
    setCalibration(true);
    setPoints([]);
    setError("");
    setMessage("공간 뷰에서 기준 거리의 시작점과 끝점을 차례로 선택하세요.");
  }
  function pickPoint(point: Vec3) {
    if (!calibration) return;
    setPoints((current) =>
      current.length >= 2 ? [point] : [...current, point],
    );
  }
  function applyCalibration() {
    if (!workingScene || points.length !== 2) return;
    try {
      const known = num(distance);
      const factor =
        known /
        Math.hypot(
          points[0][0] - points[1][0],
          points[0][1] - points[1][1],
          points[0][2] - points[1][2],
        );
      const scene = calibrateScene(workingScene, known, [points[0], points[1]]);
      commit(scene, scalePlacements(placements, factor));
      setCalibration(false);
      setPoints([]);
      setMessage("치수를 보정했습니다. 작품의 실제 mm 크기는 바뀌지 않습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "보정할 수 없습니다.");
    }
  }
  async function save() {
    if (!workingScene || !detail) return;
    setSaving(true);
    setError("");
    try {
      await api<Scene>(`/api/galleries/${galleryId}`, {
        method: "PATCH",
        body: JSON.stringify({
          scene: workingScene,
          placements,
          expectedRevision: detail.exhibition.revision,
        }),
      });
      await reload();
      setHistory([]);
      setFuture([]);
      setMessage("공간과 전시 배치를 저장했습니다.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          "다른 저장본이 있습니다. 최신 상태를 불러온 뒤 변경 사항을 다시 적용해 주세요.",
        );
      } else setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function createShare() {
    if (!detail) return;
    if (history.length) {
      setMessage("공유 전에는 변경 사항을 먼저 저장해 주세요.");
      return;
    }
    try {
      const share = await api<{ token: string; url: string }>("/api/shares", {
        method: "POST",
        body: JSON.stringify({ exhibitionId: detail.exhibition.id }),
      });
      setShareUrl(share.url);
      setMessage(
        "읽기 전용 스냅샷 링크를 만들었습니다. 이후 편집은 이 링크에 반영되지 않습니다.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "공유 링크를 만들지 못했습니다.",
      );
    }
  }
  async function uploadArt(
    file: File,
    title: string,
    widthMm: number,
    heightMm: number,
  ) {
    if (!detail) return;
    setError("");
    try {
      const form = new FormData();
      form.set("galleryId", detail.gallery.id);
      form.set("role", "artwork");
      form.append("files", file);
      const assets = await api<{ url: string }[]>("/api/assets", {
        method: "POST",
        body: form,
      });
      const art = await api<Artwork>("/api/artworks", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          title,
          type: "image",
          imageUrl: assets[0].url,
          widthMm,
          heightMm,
        }),
      });
      setDetail((current) =>
        current
          ? { ...current, artworks: [...current.artworks, art] }
          : current,
      );
      setSelectedArtworkId(art.id);
      setMessage("작품을 업로드했습니다. 선택한 벽에 추가할 수 있습니다.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "작품을 업로드하지 못했습니다.",
      );
    }
  }
  if (loading)
    return (
      <main className="shell">
        <nav className="nav">
          <AppBrand />
        </nav>
        <p className="muted" style={{ paddingTop: 60 }}>
          프로젝트를 불러오는 중…
        </p>
      </main>
    );
  if (!detail)
    return (
      <main className="shell">
        <nav className="nav">
          <AppBrand />
        </nav>
        <p className="notice" style={{ marginTop: 30 }}>
          {error || "프로젝트를 찾을 수 없습니다."}
        </p>
        <Link className="btn" style={{ marginTop: 14 }} href="/">
          프로젝트 목록
        </Link>
      </main>
    );
  const scene = workingScene;
  return (
    <main
      className="shell"
      style={{ maxWidth: "none", padding: "16px clamp(14px,2.4vw,36px)" }}
    >
      <nav className="nav" style={{ paddingBottom: 14 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/" aria-label="프로젝트 목록">
            <ArrowLeft size={19} />
          </Link>
          <AppBrand />
          <span
            className="muted hide-small"
            style={{
              borderLeft: "1px solid var(--line)",
              paddingLeft: 16,
              fontSize: 13,
            }}
          >
            {detail.gallery.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button
            className="btn ghost hide-small"
            onClick={() => setView("walk")}
          >
            <Eye size={15} /> 미리보기
          </button>
          <button
            className="btn primary"
            disabled={!scene || saving}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle size={15} /> : <Save size={15} />} 저장
          </button>
        </div>
      </nav>
      {error ? (
        <p className="notice" style={{ margin: "12px 0" }}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          style={{
            margin: "12px 0",
            padding: "10px 13px",
            background: "#e8edf9",
            color: "#17387c",
            fontSize: 13,
          }}
        >
          {message}
        </p>
      ) : null}
      {!scene ? (
        <ReconstructionPanel
          detail={detail}
          galleryId={galleryId}
          reload={reload}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px,280px) minmax(420px,1fr) minmax(250px,330px)",
            gap: 12,
            marginTop: 14,
          }}
        >
          <aside
            className="card"
            style={{
              padding: 14,
              alignSelf: "start",
              maxHeight: "calc(100vh - 102px)",
              overflow: "auto",
            }}
          >
            <p className="eyebrow">공간 정보</p>
            <h1
              className="display"
              style={{ fontSize: 29, lineHeight: 1, margin: "7px 0 12px" }}
            >
              {scene.name}
            </h1>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                margin: "0 0 15px",
                color:
                  scene.kind === "measured-plan"
                    ? "var(--terra)"
                    : "var(--muted)",
              }}
            >
              {scene.kind === "measured-plan"
                ? "도면 기반 · 치수 확인 필요"
                : "현장 기록 기반 공간"}
            </p>
            <div style={{ display: "grid", gap: 5, marginBottom: 10 }}>
              {detail.assets
                .filter((a) => a.role === "capture" || a.role === "reference")
                .map((asset) => (
                  <a
                    href={asset.url}
                    target="_blank"
                    className="btn ghost"
                    style={{ justifyContent: "space-between" }}
                    key={asset.id}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {asset.name}
                    </span>
                    <ArrowUpRight size={14} />
                  </a>
                ))}
            </div>
            <details
              style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}
            >
              <summary>공간 정확도와 출처</summary>
              <p>{scene.calibration.source}</p>
              {scene.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </details>
            <CapturePanel galleryName={detail.gallery.name} />
            <button
              className="btn ghost"
              style={{ width: "100%", justifyContent: "space-between" }}
              onClick={() => setWallOpen((x) => !x)}
            >
              <span>
                <Layers3
                  size={15}
                  style={{ verticalAlign: "middle", marginRight: 7 }}
                />
                벽 · {scene.walls.length}
              </span>
              {wallOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {wallOpen ? (
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                {scene.walls.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWallId(w.id)}
                    style={{
                      textAlign: "left",
                      border: 0,
                      padding: "9px 8px",
                      background:
                        selectedWallId === w.id ? "#e6ecfa" : "transparent",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {w.name}
                    <span
                      className="muted"
                      style={{ float: "right", fontWeight: 400 }}
                    >
                      {m(wallLength(w))}
                    </span>
                  </button>
                ))}
                <button
                  className="btn ghost"
                  style={{ marginTop: 5, width: "100%", fontSize: 11 }}
                  onClick={addManualWall}
                >
                  <Plus size={14} /> 수동 벽 추가
                </button>
                {scene.floor.polygon.length === 0 ? (
                  <button
                    className="btn ghost"
                    style={{ marginTop: 3, width: "100%", fontSize: 11 }}
                    onClick={addManualFloor}
                  >
                    <Grid2X2 size={14} /> 5 × 5m 수동 바닥
                  </button>
                ) : null}
              </div>
            ) : null}
            <hr
              style={{
                border: 0,
                borderTop: "1px solid var(--line)",
                margin: "17px 0",
              }}
            />
            <p className="eyebrow">뷰</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 4,
                marginTop: 7,
              }}
            >
              {(["orbit", "top", "walk"] as const).map((v) => (
                <button
                  key={v}
                  className="btn ghost"
                  style={{
                    padding: 0,
                    fontSize: 11,
                    background: view === v ? "var(--ink)" : "transparent",
                    color: view === v ? "white" : "var(--ink)",
                  }}
                  onClick={() => setView(v)}
                >
                  {v === "orbit" ? "둘러보기" : v === "top" ? "평면" : "보행"}
                </button>
              ))}
            </div>
            <button
              className="btn ghost"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setShowGuides((x) => !x)}
            >
              <Grid2X2 size={14} />
              {showGuides ? "가이드 숨기기" : "가이드 보기"}
            </button>
          </aside>
          <section
            className="card"
            style={{
              height: "calc(100vh - 102px)",
              minHeight: 340,
              position: "relative",
              overflow: "hidden",
              background: "#dce2e3",
            }}
          >
            <SceneStage
              scene={scene}
              artworks={detail.artworks}
              placements={placements}
              selectedIds={selectedIds}
              onSelect={(ids) => setSelectedIds(ids)}
              onMove={(id, wallId, u, v) => {
                const p = placements.find((x) => x.id === id);
                if (p) applyPlacement({ ...p, wallId, u, v });
              }}
              onWallSelect={setSelectedWallId}
              selectedWallId={selectedWallId}
              view={view}
              onViewChange={setView}
              showGuides={showGuides}
              calibrating={calibration}
              onPointPick={pickPoint}
            />
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                display: "flex",
                gap: 5,
              }}
            >
              <span
                className="status"
                style={{ background: "#fffdf9e8", padding: "7px 9px" }}
              >
                <span
                  className="dot"
                  style={{
                    color:
                      scene.kind === "measured-plan"
                        ? "var(--terra)"
                        : "var(--blue)",
                  }}
                />
                {scene.kind === "measured-plan" ? "도면 기반" : "기록 기반"}
              </span>
              {collisions.length ? (
                <span
                  className="status"
                  style={{
                    background: "#fff3ef",
                    color: "var(--terra)",
                    padding: "7px 9px",
                  }}
                >
                  겹침 {collisions.length}
                </span>
              ) : null}
            </div>
            {calibration ? (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  right: 12,
                  background: "#111827eF",
                  color: "white",
                  padding: 13,
                  fontSize: 13,
                }}
              >
                기준점 {points.length}/2 선택됨 —{" "}
                {points.length < 2
                  ? "공간에서 두 점을 클릭하세요."
                  : "실측 거리를 입력하고 적용하세요."}
              </div>
            ) : null}
          </section>
          <aside
            style={{
              display: "grid",
              gap: 12,
              alignSelf: "start",
              maxHeight: "calc(100vh - 102px)",
              overflow: "auto",
            }}
          >
            <section className="card" style={{ padding: 14 }}>
              <p className="eyebrow">작품</p>
              <ArtworkShelf
                artworks={detail.artworks}
                selected={selectedArtworkId}
                onSelect={setSelectedArtworkId}
                onAdd={addArtwork}
                onUpload={uploadArt}
              />
            </section>
            {selectedWall ? (
              <section className="card" style={{ padding: 14 }}>
                <p className="eyebrow">선택한 벽</p>
                <p style={{ fontWeight: 700, margin: "6px 0 12px" }}>
                  {selectedWall.name}{" "}
                  <span
                    className="muted"
                    style={{ fontWeight: 400, fontSize: 12 }}
                  >
                    길이 {m(wallLength(selectedWall))}
                  </span>
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 7,
                  }}
                >
                  <NumberField
                    label="시작 X"
                    value={selectedWall.start[0]}
                    onChange={(v) =>
                      updateWall({ start: [v, selectedWall.start[1]] })
                    }
                  />
                  <NumberField
                    label="시작 Z"
                    value={selectedWall.start[1]}
                    onChange={(v) =>
                      updateWall({ start: [selectedWall.start[0], v] })
                    }
                  />
                  <NumberField
                    label="끝 X"
                    value={selectedWall.end[0]}
                    onChange={(v) =>
                      updateWall({ end: [v, selectedWall.end[1]] })
                    }
                  />
                  <NumberField
                    label="끝 Z"
                    value={selectedWall.end[1]}
                    onChange={(v) =>
                      updateWall({ end: [selectedWall.end[0], v] })
                    }
                  />
                  <NumberField
                    label="높이 m"
                    value={selectedWall.height}
                    onChange={(v) => updateWall({ height: Math.max(0.1, v) })}
                  />
                  <NumberField
                    label="두께 m"
                    value={selectedWall.thickness}
                    onChange={(v) =>
                      updateWall({ thickness: Math.max(0.01, v) })
                    }
                  />
                </div>
              </section>
            ) : null}
            <PlacementPanel
              placement={selectedPlacement}
              artwork={selectedArt}
              onUpdate={applyPlacement}
              onDelete={() => {
                if (!selectedPlacement || !scene) return;
                commit(
                  scene,
                  placements.filter((p) => p.id !== selectedPlacement.id),
                );
                setSelectedIds([]);
              }}
              onDuplicate={() => {
                if (!selectedPlacement || !scene) return;
                const art = detail.artworks.find(
                    (a) => a.id === selectedPlacement.artworkId,
                  ),
                  wall = scene.walls.find(
                    (w) => w.id === selectedPlacement.wallId,
                  );
                if (!art || !wall) return;
                const duplicate = clampPlacement(
                  {
                    ...selectedPlacement,
                    id: crypto.randomUUID(),
                    u: selectedPlacement.u + 0.18,
                  },
                  art,
                  wall,
                );
                commit(scene, [...placements, duplicate]);
                setSelectedIds([duplicate.id]);
              }}
            />
            <section className="card" style={{ padding: 14 }}>
              <p className="eyebrow">편집</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <button
                  className="btn ghost"
                  disabled={!history.length}
                  onClick={undo}
                >
                  <Undo2 size={14} /> 되돌리기
                </button>
                <button
                  className="btn ghost"
                  disabled={!future.length}
                  onClick={redo}
                >
                  <Redo2 size={14} /> 다시하기
                </button>
                <button
                  className="btn ghost"
                  disabled={selectedIds.length < 2}
                  onClick={() =>
                    scene &&
                    commit(
                      scene,
                      alignPlacements(
                        placements,
                        selectedIds,
                        "center",
                        undefined,
                        detail.artworks,
                      ),
                    )
                  }
                >
                  <AlignCenterHorizontal size={14} /> 가운데
                </button>
                <button
                  className="btn ghost"
                  disabled={selectedIds.length < 2}
                  onClick={() =>
                    scene &&
                    commit(
                      scene,
                      alignPlacements(
                        placements,
                        selectedIds,
                        "height",
                        undefined,
                        detail.artworks,
                      ),
                    )
                  }
                >
                  <AlignVerticalJustifyCenter size={14} /> 높이
                </button>
                <button
                  className="btn ghost"
                  style={{ gridColumn: "span 2" }}
                  disabled={selectedIds.length < 2}
                  onClick={() =>
                    scene &&
                    commit(
                      scene,
                      alignPlacements(
                        placements,
                        selectedIds,
                        "spacing",
                        undefined,
                        detail.artworks,
                      ),
                    )
                  }
                >
                  <MoveHorizontal size={14} /> 같은 간격
                </button>
              </div>
            </section>
            <section className="card" style={{ padding: 14 }}>
              <p className="eyebrow">치수 보정</p>
              <p
                className="muted"
                style={{ fontSize: 12, lineHeight: 1.45, margin: "7px 0 10px" }}
              >
                공간 좌표와 배치 위치만 비율로 조정됩니다. 작품의 실제 크기는
                유지됩니다.
              </p>
              {calibration && points.length === 2 ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    aria-label="실측 거리 m"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    style={{
                      width: "80px",
                      border: "1px solid var(--line)",
                      padding: "0 8px",
                    }}
                  />
                  <button className="btn primary" onClick={applyCalibration}>
                    <Check size={14} /> 적용
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setCalibration(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button className="btn ghost" onClick={startCalibration}>
                  <MousePointer2 size={14} /> 두 점으로 보정
                </button>
              )}
            </section>
            <section className="card" style={{ padding: 14 }}>
              <p className="eyebrow">공유</p>
              <p
                className="muted"
                style={{ fontSize: 12, lineHeight: 1.45, margin: "7px 0 10px" }}
              >
                현재 저장본을 수정할 수 없는 방문자용 스냅샷으로 만듭니다.
              </p>
              <button
                className="btn primary"
                style={{ width: "100%" }}
                disabled={history.length > 0 || saving}
                title={
                  history.length
                    ? "변경 사항을 저장한 뒤 공유할 수 있습니다."
                    : undefined
                }
                onClick={() => void createShare()}
              >
                <Share2 size={14} />
                {history.length ? "먼저 저장하세요" : "읽기 전용 링크 만들기"}
              </button>
              {history.length ? (
                <button
                  className="btn ghost"
                  style={{ marginTop: 6, width: "100%", fontSize: 11 }}
                  onClick={() => void save()}
                >
                  <Save size={13} /> 변경 사항 저장
                </button>
              ) : null}
              {shareUrl ? (
                <a
                  className="btn ghost"
                  style={{
                    marginTop: 7,
                    width: "100%",
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  href={shareUrl}
                  target="_blank"
                >
                  <Link2 size={13} /> 방문자 보기
                </a>
              ) : null}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field" style={{ fontSize: 10 }}>
      {label}
      <input
        type="number"
        step=".01"
        value={Number(value.toFixed(3))}
        onChange={(e) => onChange(num(e.target.value, value))}
      />
    </label>
  );
}
function PlacementPanel({
  placement,
  artwork,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  placement?: Placement;
  artwork?: Artwork;
  onUpdate: (p: Placement) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  if (!placement || !artwork)
    return (
      <section className="card" style={{ padding: 14 }}>
        <p className="eyebrow">배치</p>
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          캔버스에서 작품을 선택하면 위치와 높이를 조절할 수 있습니다.
        </p>
      </section>
    );
  return (
    <section className="card" style={{ padding: 14 }}>
      <p className="eyebrow">배치 · {artwork.title}</p>
      <p style={{ fontSize: 12, margin: "6px 0 12px" }}>
        {artwork.widthMm} × {artwork.heightMm} mm
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        <NumberField
          label="벽 위치 m"
          value={placement.u}
          onChange={(u) => onUpdate({ ...placement, u })}
        />
        <NumberField
          label="중심 높이 m"
          value={placement.v}
          onChange={(v) => onUpdate({ ...placement, v })}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 5,
          marginTop: 9,
        }}
      >
        <button
          className="btn ghost"
          onClick={() => onUpdate({ ...placement, locked: !placement.locked })}
        >
          {placement.locked ? <Lock size={14} /> : <Unlock size={14} />}{" "}
          {placement.locked ? "고정" : "이동"}
        </button>
        <button className="btn ghost" onClick={onDuplicate}>
          <Copy size={14} /> 복제
        </button>
        <button className="btn ghost" onClick={onDelete}>
          <Trash2 size={14} /> 삭제
        </button>
      </div>
    </section>
  );
}
function ArtworkShelf({
  artworks,
  selected,
  onSelect,
  onAdd,
  onUpload,
}: {
  artworks: Artwork[];
  selected?: string;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  onUpload: (
    file: File,
    title: string,
    width: number,
    height: number,
  ) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState("600");
  const [height, setHeight] = useState("900");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(
        file,
        title.trim() || file.name.replace(/\.[^.]+$/, ""),
        num(width, 600),
        num(height, 900),
      );
      setFile(null);
      setTitle("");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div style={{ display: "grid", gap: 5, margin: "8px 0" }}>
        {artworks.map((art) => (
          <div
            key={art.id}
            style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr auto",
              gap: 7,
              alignItems: "center",
              border:
                selected === art.id
                  ? "1px solid var(--blue)"
                  : "1px solid transparent",
              padding: 3,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                background: "#e5ded1",
                overflow: "hidden",
              }}
            >
              {art.imageUrl ? (
                <img
                  src={art.imageUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </div>
            <button
              onClick={() => onSelect(art.id)}
              style={{
                border: 0,
                background: "none",
                textAlign: "left",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {art.title}
              <span
                className="muted"
                style={{ display: "block", fontSize: 10, fontWeight: 400 }}
              >
                {art.widthMm} × {art.heightMm}mm
              </span>
            </button>
            <button
              className="btn ghost"
              style={{ padding: "0 7px", minHeight: 30 }}
              onClick={() => onAdd(art.id)}
              title="선택한 벽에 추가"
            >
              <Plus size={15} />
            </button>
          </div>
        ))}
      </div>
      <form
        onSubmit={submit}
        style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
      >
        <label className="btn ghost" style={{ width: "100%" }}>
          <ImagePlus size={14} /> 작품 파일 올리기
          <input
            type="file"
            accept="image/png,image/jpeg,image/heic,image/heif,.heic"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        {file ? (
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <label className="field" style={{ fontSize: 10 }}>
              작품명
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file.name}
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              <label className="field" style={{ fontSize: 10 }}>
                가로 mm
                <input
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className="field" style={{ fontSize: 10 }}>
                세로 mm
                <input
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </label>
            </div>
            <button className="btn primary" disabled={uploading}>
              {uploading ? <LoaderCircle size={14} /> : <Upload size={14} />}{" "}
              업로드
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
function CapturePanel({ galleryName }: { galleryName: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const detail = await api<GalleryDetail>("/api/galleries", {
        method: "POST",
        body: JSON.stringify({ name: `${galleryName} · 촬영 비교` }),
      });
      const form = new FormData();
      form.set("galleryId", detail.gallery.id);
      form.set("role", "capture");
      form.append("files", file);
      const assets = await api<{ id: string }[]>("/api/assets", {
        method: "POST",
        body: form,
      });
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          galleryId: detail.gallery.id,
          mode: "video",
          assetIds: assets.map((a) => a.id),
        }),
      });
      window.location.assign(`/gallery/${detail.gallery.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "촬영 비교를 시작하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        borderTop: "1px solid var(--line)",
        paddingTop: 12,
        marginTop: 14,
      }}
    >
      <p className="eyebrow">촬영 비교</p>
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        새 영상은 별도 프로젝트에서 재구성합니다.
      </p>
      <label className="btn ghost" style={{ width: "100%", fontSize: 11 }}>
        <FileUp size={13} />
        {file ? file.name : "새 현장 영상 선택"}
        <input
          hidden
          type="file"
          accept="video/mp4,video/quicktime,.mov"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <button
        className="btn ghost"
        disabled={busy || !file}
        style={{ marginTop: 5, width: "100%", fontSize: 11 }}
        onClick={() => void submit()}
      >
        {busy ? "시작 중…" : "새 촬영 비교 만들기"}
      </button>
    </section>
  );
}
function ReconstructionPanel({
  detail,
  galleryId,
  reload,
}: {
  detail: GalleryDetail;
  galleryId: string;
  reload: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"video" | "photos">("video");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function begin() {
    if (!files.length) {
      setError("현장 영상 또는 여러 장의 사진을 올려 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("galleryId", galleryId);
      form.set("role", "capture");
      files.forEach((f) => form.append("files", f));
      const assets = await api<{ id: string }[]>("/api/assets", {
        method: "POST",
        body: form,
      });
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          mode,
          assetIds: assets.map((a) => a.id),
        }),
      });
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "처리 작업을 시작하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  const last = detail.jobs[0];
  return (
    <section style={{ maxWidth: 720, margin: "clamp(50px,10vw,130px) auto" }}>
      <p className="eyebrow">공간 재구성</p>
      <h1
        className="display"
        style={{
          fontSize: "clamp(42px,6vw,74px)",
          lineHeight: 0.96,
          margin: "12px 0 20px",
        }}
      >
        공간의 근거를
        <br />
        올려 주세요.
      </h1>
      <p className="muted" style={{ lineHeight: 1.6, maxWidth: 580 }}>
        영상과 사진은 실제 카메라 움직임과 충분한 시차가 있어야 재구성할 수
        있습니다. 제공된 와이아트갤러리 도면은 별도 프로젝트에서만 사용합니다.
      </p>
      {last ? (
        <div
          className={last.status === "FAILED" ? "notice" : "card"}
          style={{ padding: 16, margin: "22px 0" }}
        >
          <span className="eyebrow">
            {jobLabel(last.status)} · {Math.round(last.progress)}%
          </span>
          <p style={{ margin: "6px 0 0" }}>{last.error || last.message}</p>
        </div>
      ) : null}
      {error ? <p className="notice">{error}</p> : null}
      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 5,
            marginBottom: 15,
          }}
        >
          {(
            [
              ["video", "현장 영상"],
              ["photos", "현장 사진"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className="btn ghost"
              onClick={() => setMode(value)}
              style={{
                fontSize: 12,
                padding: 5,
                background: mode === value ? "var(--ink)" : "transparent",
                color: mode === value ? "white" : "var(--ink)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label
          className="btn ghost"
          style={{
            width: "100%",
            height: 105,
            flexDirection: "column",
            borderStyle: "dashed",
          }}
        >
          <FileUp size={20} />
          {files.length ? `${files.length}개 파일 선택됨` : "파일 선택"}
          <input
            hidden
            type="file"
            multiple
            accept={mode === "video" ? "video/*" : "image/*,.heic"}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          한 장의 이미지, 파노라마 또는 시차가 부족한 기록은 공간으로 만들 수
          없습니다. 실패 사유와 다음 촬영 방법을 알려드립니다.
        </p>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void begin()}
        >
          {busy ? <LoaderCircle size={15} /> : <Maximize2 size={15} />} 재구성
          시작
        </button>
      </div>
    </section>
  );
}
