"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  FileUp,
  FolderPlus,
  MapPinned,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { Gallery, GalleryDetail, Job } from "@gallery/shared";
import { api, ApiError, formatDate, jobLabel } from "@/lib/api";
import { AppBrand } from "./AppBrand";

const cloud = process.env.NEXT_PUBLIC_GALLERY_CLOUD === "1";
type Pending = { id: string; job: Job };
export function Dashboard() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"video" | "photos">("video");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      await api("/api/session");
      setGalleries(await api<Gallery[]>("/api/galleries"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!pending || ["READY", "FAILED"].includes(pending.job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await api<Job>(`/api/jobs/${pending.job.id}`);
        setPending((current) => (current ? { ...current, job } : current));
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "작업 상태를 확인하지 못했습니다.",
        );
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pending]);
  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("프로젝트 이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const detail = await api<GalleryDetail>("/api/galleries", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || undefined,
        }),
      });
      if (cloud) {
        await api("/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            galleryId: detail.gallery.id,
            mode: "measured-plan",
            assetIds: [],
          }),
        });
      } else if (files.length) {
        const form = new FormData();
        form.set("galleryId", detail.gallery.id);
        form.set("role", "capture");
        files.forEach((file) => form.append("files", file));
        const assets = await api<{ id: string }[]>("/api/assets", {
          method: "POST",
          body: form,
        });
        const job = await api<Job>("/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            galleryId: detail.gallery.id,
            mode,
            assetIds: assets.map((a) => a.id),
          }),
        });
        setPending({ id: detail.gallery.id, job });
      }
      setGalleries((items) => [detail.gallery, ...items]);
      setCreating(false);
      setName("");
      setAddress("");
      setFiles([]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "프로젝트를 만들지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  const active =
    pending?.job && !["READY", "FAILED"].includes(pending.job.status)
      ? pending.job
      : null;
  return (
    <main className="shell">
      <nav className="nav">
        <AppBrand />
        <div className="eyebrow hide-small">공간을 전시로 바꾸는 도구</div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <FolderPlus size={16} /> 새 프로젝트
        </button>
      </nav>
      <section
        style={{
          padding: "clamp(46px,9vw,120px) 0 50px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1.1fr) minmax(260px,.55fr)",
          gap: 36,
          alignItems: "end",
        }}
      >
        <div>
          <p className="eyebrow">Exhibition planning · metric by design</p>
          <h1
            className="display"
            style={{
              fontSize: "clamp(48px,7vw,100px)",
              lineHeight: 0.93,
              margin: "14px 0 22px",
            }}
          >
            공간을 읽고,
            <br />
            전시를 그리세요.
          </h1>
          <p
            className="muted"
            style={{ fontSize: 16, lineHeight: 1.65, maxWidth: 510 }}
          >
            도면과 현장 기록을 바탕으로 실제 치수의 전시 공간을 만들고, 작품
            배치부터 방문자 미리보기까지 한 곳에서 준비합니다.
          </p>
        </div>
        <div
          className="card"
          style={{ padding: 22, borderTop: "3px solid var(--blue)" }}
        >
          <p className="eyebrow">작업 흐름</p>
          <p
            className="display"
            style={{ fontSize: 26, lineHeight: 1.1, margin: "12px 0" }}
          >
            기록 → 재구성
            <br />→ 큐레이션 → 공유
          </p>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            자동 재구성은 근거가 있는 결과만 표시합니다. 도면 기반 공간은 별도로
            명확히 표기됩니다.
          </p>
        </div>
      </section>
      {error ? <p className="notice">{error}</p> : null}
      {active ? (
        <section
          className="card"
          style={{
            padding: 18,
            marginBottom: 26,
            display: "flex",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span className="eyebrow">
              처리 중 · {Math.round(active.progress)}%
            </span>
            <p style={{ margin: "5px 0 0", fontWeight: 700 }}>
              {jobLabel(active.status)}{" "}
              <span className="muted" style={{ fontWeight: 400 }}>
                — {active.message}
              </span>
            </p>
          </div>
          <RefreshCw size={18} className="muted" />
        </section>
      ) : pending?.job.status === "FAILED" ? (
        <section className="notice" style={{ marginBottom: 26 }}>
          재구성에 실패했습니다: {pending.job.error || pending.job.message}.
          다른 각도의 사진이나 충분한 이동이 있는 영상을 올려 다시 시도해
          주세요.
        </section>
      ) : null}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 15,
          }}
        >
          <div>
            <p className="eyebrow">Projects</p>
            <h2 className="display" style={{ fontSize: 38, margin: "4px 0 0" }}>
              내 전시 공간
            </h2>
          </div>
          <button className="btn ghost" onClick={() => void load()}>
            <RefreshCw size={15} /> 새로고침
          </button>
        </div>
        {loading ? (
          <p className="muted">프로젝트를 불러오는 중…</p>
        ) : galleries.length === 0 ? (
          <div
            className="card"
            style={{ padding: "54px 28px", textAlign: "center" }}
          >
            <MapPinned size={26} style={{ color: "var(--blue)" }} />
            <h3
              className="display"
              style={{ fontSize: 29, margin: "14px 0 7px" }}
            >
              아직 준비된 공간이 없습니다.
            </h3>
            <p className="muted" style={{ margin: "0 0 20px" }}>
              도면이나 현장 기록으로 첫 번째 전시 공간을 시작하세요.
            </p>
            <button className="btn cobalt" onClick={() => setCreating(true)}>
              <Sparkles size={15} /> 공간 만들기
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))",
              gap: 14,
            }}
          >
            {galleries.map((g) => (
              <Link
                className="card"
                href={`/gallery/${g.id}`}
                key={g.id}
                style={{
                  padding: 20,
                  display: "block",
                  minHeight: 184,
                  position: "relative",
                }}
              >
                <p className="eyebrow">{g.address || "주소 미입력"}</p>
                <h3
                  className="display"
                  style={{ fontSize: 29, margin: "12px 0 28px" }}
                >
                  {g.name}
                </h3>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatDate(g.updatedAt)}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      {creating ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "#11182788",
            display: "grid",
            placeItems: "center",
            padding: 18,
            zIndex: 5,
          }}
        >
          <form
            onSubmit={createProject}
            className="card"
            style={{
              width: "min(600px,100%)",
              maxHeight: "calc(100dvh - 36px)",
              overflowY: "auto",
              padding: 26,
              boxShadow: "0 25px 70px #11182755",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                marginBottom: 24,
              }}
            >
              <div>
                <p className="eyebrow">New space</p>
                <h2
                  className="display"
                  style={{ fontSize: 38, margin: "4px 0 0" }}
                >
                  프로젝트 만들기
                </h2>
              </div>
              <button
                type="button"
                className="btn ghost"
                disabled={submitting}
                onClick={() => setCreating(false)}
              >
                닫기
              </button>
            </div>
            <div style={{ display: "grid", gap: 15 }}>
              <label className="field">
                프로젝트 이름
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 새 전시 공간"
                  autoFocus
                />
              </label>
              <label className="field">
                주소{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  (선택)
                </span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="서울 중구 …"
                />
              </label>
              {cloud ? (
                <p className="notice">
                  와이아트갤러리 실측 도면으로 새 전시를 만듭니다. 작품은 생성
                  후 올릴 수 있습니다. 영상·사진 자동 복원은 로컬 앱에서 사용할
                  수 있습니다.
                </p>
              ) : (
                <>
                  <label className="field">
                    기록 방식
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                    >
                      <option value="video">현장 영상</option>
                      <option value="photos">현장 사진</option>
                    </select>
                  </label>
                  <label className="field">
                    파일{" "}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      (선택 — 공간만 먼저 만들 수 있습니다)
                    </span>
                    <input
                      type="file"
                      multiple
                      accept={mode === "video" ? "video/*" : "image/*,.heic,.tif,.tiff"}
                      onChange={(e) =>
                        setFiles(Array.from(e.target.files || []))
                      }
                    />
                  </label>
                  <p
                    className="muted"
                    style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}
                  >
                    사진은 JPEG, PNG, HEIC, TIFF 형식을 지원합니다. 한 장의 사진이나 360° 이미지는 자동 공간 재구성을 지원하지
                    않습니다. 다양한 각도와 이동이 있는 기록을 사용하세요.
                    제공된 와이아트갤러리 도면은 별도 프로젝트로 준비됩니다.
                  </p>
                </>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 9,
                marginTop: 24,
              }}
            >
              <button
                type="button"
                className="btn ghost"
                disabled={submitting}
                onClick={() => setCreating(false)}
              >
                취소
              </button>
              <button
                className="btn primary"
                type="submit"
                disabled={submitting}
              >
                <FileUp size={15} />
                {submitting ? "만드는 중…" : "프로젝트 만들기"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
