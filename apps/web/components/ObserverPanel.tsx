"use client";

import { useState } from "react";
import type { Artwork, Observer, Placement, Scene } from "@gallery/shared";
import { observerPose } from "@gallery/three";

export function ObserverPanel({
  scene,
  placements,
  artworks,
  selectedId,
  onSelect,
  onChange,
  onEyeView,
}: {
  scene: Scene;
  placements: Placement[];
  artworks: Artwork[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onChange: (observers: Observer[]) => void;
  onEyeView: (id: string) => void;
}) {
  const [defaultHeight, setDefaultHeight] = useState(1700);
  const placement =
    placements.find((p) => p.id === selectedId) ?? placements[0];
  const observers = scene.observers ?? [];
  const observer = observers.find((o) => o.placementId === placement?.id);
  const height = observer?.heightMm ?? defaultHeight;
  const artwork = artworks.find((a) => a.id === placement?.artworkId);
  const pose =
    placement && artwork
      ? observerPose(scene, placement, artwork, height)
      : null;
  const changeHeight = (mm: number) => {
    if (!Number.isFinite(mm) || mm < 500 || mm > 2500) return;
    setDefaultHeight(mm);
    if (observer)
      onChange(
        observers.map((o) =>
          o.id === observer.id ? { ...o, heightMm: mm } : o,
        ),
      );
  };
  const add = (all: boolean) => {
    const targets = all ? placements : placement ? [placement] : [];
    onChange([
      ...observers,
      ...targets
        .filter((p) => !observers.some((o) => o.placementId === p.id))
        .slice(0, 100 - observers.length)
        .map((p) => ({
          id: crypto.randomUUID(),
          placementId: p.id,
          heightMm: height,
        })),
    ]);
    if (placement) onSelect(placement.id);
  };
  return (
    <section className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        관람자 · 작품 앞 1m
      </p>
      {!placement ? (
        <p className="muted">
          작품을 벽에 배치하면 사람을 세워 크기와 눈높이를 비교할 수 있습니다.
        </p>
      ) : (
        <>
          <select
            aria-label="관람할 작품"
            value={placement.id}
            onChange={(e) => onSelect(e.target.value)}
            style={{ width: "100%" }}
          >
            {placements.map((p, i) => (
              <option key={p.id} value={p.id}>
                {artworks.find((a) => a.id === p.artworkId)?.title ?? "작품"} ·{" "}
                {i + 1}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12 }}>
            키{" "}
            <input
              aria-label="관람자 키"
              type="number"
              min={50}
              max={250}
              step={1}
              key={`${observer?.id ?? "new"}-${height}`}
              defaultValue={height / 10}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value >= 50 && value <= 250) changeHeight(value * 10);
                else e.target.value = String(height / 10);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              style={{ width: 75, margin: "0 6px" }}
            />
            cm
          </label>
          <div style={{ display: "flex", gap: 5 }}>
            {[150, 170, 190].map((cm) => (
              <button
                key={cm}
                className="btn ghost"
                style={{ flex: 1 }}
                onClick={() => changeHeight(cm * 10)}
              >
                {cm}cm
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, margin: 0 }}>
            눈높이 약 {(height * 0.093).toFixed(1)}cm · 키의 93% 기준
            <br />
            작품 표면에서 눈까지 수평 거리 1m
          </p>
          {pose && !pose.fits && (
            <p
              role="status"
              style={{ color: "#9a622c", fontSize: 11, margin: 0 }}
            >
              이 위치는 관람 공간이 좁아 사람이 벽 또는 바닥 경계와 겹칠 수
              있습니다.
            </p>
          )}
          {observer ? (
            <div style={{ display: "flex", gap: 5 }}>
              <button className="btn" onClick={() => onEyeView(observer.id)}>
                눈높이에서 보기
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  onChange(observers.filter((o) => o.id !== observer.id))
                }
              >
                사람 제거
              </button>
            </div>
          ) : (
            <button
              className="btn"
              disabled={observers.length >= 100}
              onClick={() => add(false)}
            >
              1m 앞에 사람 세우기
            </button>
          )}
          <button
            className="btn ghost"
            disabled={observers.length >= Math.min(placements.length, 100)}
            onClick={() => add(true)}
          >
            전체 작품 앞에 사람 세우기
          </button>
        </>
      )}
    </section>
  );
}
