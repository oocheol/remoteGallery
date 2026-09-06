"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Map, Maximize2 } from "lucide-react";
import type { ShareSnapshot } from "@gallery/shared";
import { api, formatDate } from "@/lib/api";
import { AppBrand } from "./AppBrand";
import { SceneStage } from "./SceneStage";

export function ExhibitionVisitor({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"orbit" | "walk">("walk");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    api<ShareSnapshot>(`/api/shares/${token}`)
      .then(setSnapshot)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "이 전시 링크를 열 수 없습니다.",
        ),
      );
  }, [token]);
  if (error)
    return (
      <main className="shell">
        <nav className="nav">
          <AppBrand />
          <span className="eyebrow">Visitor view</span>
        </nav>
        <section style={{ padding: "20vh 0", maxWidth: 520 }}>
          <p className="eyebrow">Link unavailable</p>
          <h1 className="display" style={{ fontSize: 55, margin: "10px 0" }}>
            이 전시는
            <br />열 수 없습니다.
          </h1>
          <p className="notice">{error}</p>
        </section>
      </main>
    );
  if (!snapshot)
    return (
      <main className="shell">
        <nav className="nav">
          <AppBrand />
        </nav>
        <p className="muted" style={{ paddingTop: 60 }}>
          전시를 불러오는 중…
        </p>
      </main>
    );
  const arts = snapshot.artworks;
  const current = arts[index];
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--deep)",
        color: "#f8f2e8",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gridTemplateColumns: "minmax(0,1fr)",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "16px clamp(16px,3vw,42px)",
          borderBottom: "1px solid #ffffff26",
        }}
      >
        <AppBrand />
        <div style={{ textAlign: "center" }}>
          <span className="eyebrow" style={{ color: "#9bb6fa" }}>
            방문자 미리보기
          </span>
          <strong style={{ display: "block", fontSize: 13, marginTop: 2 }}>
            {snapshot.galleryName}
          </strong>
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: "#c8c7c2",
              marginTop: 4,
            }}
          >
            {snapshot.scene.kind === "sfm"
              ? "희소 점군 · 벽과 바닥 미추정"
              : "도면 기반 공간"}
            {snapshot.scene.calibration.status === "uncalibrated"
              ? " · 실제 크기 미보정"
              : " · 입력 치수 기준"}
          </span>
        </div>
        <span className="muted" style={{ color: "#c8c7c2", fontSize: 11 }}>
          {formatDate(snapshot.createdAt)} 스냅샷
        </span>
      </nav>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(260px,350px)",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div
          style={{
            height: "calc(100dvh - 85px)",
            minHeight: 340,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
            background: "#26313c",
          }}
        >
          <SceneStage
            scene={snapshot.scene}
            artworks={snapshot.artworks}
            placements={snapshot.exhibition.placements}
            selectedIds={
              current
                ? [
                    snapshot.exhibition.placements.find(
                      (p) => p.artworkId === current.id,
                    )?.id || "",
                  ]
                : []
            }
            readOnly
            view={view}
            onViewChange={setView}
            showGuides={false}
          />
          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: 18,
              display: "flex",
              gap: 6,
            }}
          >
            <button
              className="btn ghost"
              style={{
                background: "#111827cf",
                borderColor: "#ffffff4d",
                color: "white",
              }}
              onClick={() => setView("walk")}
            >
              <Eye size={14} /> 보행
            </button>
            <button
              className="btn ghost"
              style={{
                background: "#111827cf",
                borderColor: "#ffffff4d",
                color: "white",
              }}
              onClick={() => setView("orbit")}
            >
              <Maximize2 size={14} /> 둘러보기
            </button>
          </div>
        </div>
        <aside
          style={{
            padding: "clamp(22px,4vw,42px)",
            background: "#17212d",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div>
            <p className="eyebrow" style={{ color: "#9bb6fa" }}>
              Exhibition
            </p>
            <h1
              className="display"
              style={{
                fontSize: "clamp(37px,4vw,57px)",
                lineHeight: 0.95,
                margin: "11px 0",
              }}
            >
              {snapshot.exhibition.title}
            </h1>
            <p
              style={{
                color: "#bfc7d1",
                fontSize: 13,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              이 화면은 공유 시점에 고정된 읽기 전용 전시입니다.
            </p>
          </div>
          {current ? (
            <div style={{ marginTop: "auto" }}>
              <div
                style={{
                  aspectRatio: "4/3",
                  background: "#0b1118",
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                }}
              >
                <img
                  src={current.imageUrl}
                  alt={current.title}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              <p
                className="eyebrow"
                style={{ color: "#9bb6fa", marginTop: 16 }}
              >
                Artwork {index + 1} / {arts.length}
              </p>
              <h2 className="display" style={{ fontSize: 31, margin: "6px 0" }}>
                {current.title}
              </h2>
              <p style={{ color: "#bfc7d1", fontSize: 12, margin: 0 }}>
                {current.widthMm} × {current.heightMm} mm
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 18,
                }}
              >
                <button
                  className="btn ghost"
                  disabled={index === 0}
                  style={{ color: "white", borderColor: "#ffffff4d" }}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  <ChevronLeft size={15} /> 이전
                </button>
                <button
                  className="btn ghost"
                  disabled={index === arts.length - 1}
                  style={{ color: "white", borderColor: "#ffffff4d" }}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  다음 <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="muted"
              style={{ color: "#bfc7d1", marginTop: "auto" }}
            >
              배치된 작품이 없습니다.
            </div>
          )}
        </aside>
      </section>
      <style>{`@media(max-width:760px){main>section{grid-template-columns:1fr!important} main>section>div{height:54dvh!important;min-height:340px!important;min-width:0} main>section>aside{min-height:46vh} }`}</style>
    </main>
  );
}
