"use client";

import { useId } from "react";
import type { Artwork } from "@gallery/shared";
import { artworkLayout } from "@gallery/three";

export type FramePatch = Pick<
  Artwork,
  | "frameMaterial"
  | "frameWidthMm"
  | "frameDepthMm"
  | "matWidthMm"
  | "matTopMm"
  | "matBottomMm"
>;

export function ArtworkFramePanel({
  artwork,
  onChange,
}: {
  artwork: Artwork;
  onChange: (patch: Partial<FramePatch>) => void;
}) {
  const patternId = useId().replaceAll(":", "");
  const frame = artwork.frameWidthMm;
  const mat = artwork.matWidthMm ?? 0;
  const top = artwork.matTopMm ?? mat;
  const bottom = artwork.matBottomMm ?? mat;
  const limit = (value: number) =>
    Math.max(0, Math.min(1000, Math.floor(value)));
  const frameLimit = limit(
    Math.min(
      (artwork.widthMm - 2 * mat - 1) / 2,
      (artwork.heightMm - top - bottom - 1) / 2,
    ),
  );
  const matLimit = limit((artwork.widthMm - 2 * frame - 1) / 2);
  const topLimit = limit(artwork.heightMm - 2 * frame - bottom - 1);
  const bottomLimit = limit(artwork.heightMm - 2 * frame - top - 1);
  const uniformLimit = limit(
    (Math.min(artwork.widthMm, artwork.heightMm) - 2 * frame - 1) / 2,
  );
  const layout = artworkLayout(artwork);
  const width = layout.widthMm;
  const height = layout.heightMm;
  const material = artwork.frameMaterial ?? "black";
  return (
    <section className="card frame-panel">
      <div className="panel-heading">
        <p className="eyebrow">액자 · 여백</p>
        <span className="muted">실시간 미리보기</span>
      </div>
      <strong className="frame-title">{artwork.title}</strong>
      <div className="frame-preview">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${artwork.title}, ${frame ? (material === "wood" ? "우드 액자" : "블랙 액자") : "프레임 없음"}, 좌우 여백 ${mat}mm, 위 여백 ${top}mm, 아래 여백 ${bottom}mm`}
        >
          <defs>
            <pattern
              id={patternId}
              width="11"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              <rect width="11" height="80" fill="#bd8a56" />
              <path
                d="M2 0 Q6 40 2 80 M8 0 Q5 40 8 80"
                stroke="#966639"
                strokeWidth="0.8"
                opacity="0.55"
                fill="none"
              />
            </pattern>
          </defs>
          <rect
            width={width}
            height={height}
            fill={material === "wood" ? `url(#${patternId})` : "#202020"}
          />
          <rect
            x={frame}
            y={frame}
            width={width - 2 * frame}
            height={height - 2 * frame}
            fill="#faf8f2"
          />
          <image
            href={artwork.imageUrl}
            x={frame + layout.matWidthMm}
            y={frame + layout.matTopMm}
            width={layout.imageWidthMm}
            height={layout.imageHeightMm}
            preserveAspectRatio="none"
          />
        </svg>
      </div>
      <div className="frame-options" role="group" aria-label="프레임 소재">
        {(
          [
            ["wood", "우드"],
            ["black", "블랙"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={frame > 0 && material === value}
            onClick={() =>
              onChange({
                frameMaterial: value,
                frameWidthMm: frame || Math.min(20, frameLimit),
                frameDepthMm: artwork.frameDepthMm || 25,
              })
            }
          >
            <span className={`frame-swatch ${value}`} aria-hidden="true" />
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={frame === 0}
          onClick={() => onChange({ frameWidthMm: 0, frameDepthMm: 0 })}
        >
          없음
        </button>
      </div>
      <FrameDimension
        label="프레임 폭"
        value={frame}
        max={Math.min(100, frameLimit)}
        limit={frameLimit}
        onChange={(value) =>
          onChange({
            frameWidthMm: value,
            ...(value > 0 && !artwork.frameDepthMm ? { frameDepthMm: 25 } : {}),
          })
        }
      />
      <FrameDimension
        label="여백 · 좌우"
        value={mat}
        max={Math.min(200, matLimit)}
        limit={matLimit}
        onChange={(value) =>
          onChange({ matWidthMm: value, matTopMm: top, matBottomMm: bottom })
        }
      />
      <FrameDimension
        label="여백 · 위"
        value={top}
        max={Math.min(200, topLimit)}
        limit={topLimit}
        onChange={(value) => onChange({ matTopMm: value })}
      />
      <FrameDimension
        label="여백 · 아래"
        value={bottom}
        max={Math.min(200, bottomLimit)}
        limit={bottomLimit}
        onChange={(value) => onChange({ matBottomMm: value })}
      />
      <p className="muted" style={{ fontSize: 11, margin: "8px 0 4px" }}>
        전체 여백을 같은 값으로
      </p>
      <div
        className="mat-presets"
        role="group"
        aria-label="전체 여백 빠른 선택"
      >
        {[0, 30, 50, 80].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mat === value && top === value && bottom === value}
            disabled={value > uniformLimit}
            onClick={() =>
              onChange({
                matWidthMm: value,
                matTopMm: value,
                matBottomMm: value,
              })
            }
          >
            {value === 0 ? "여백 없음" : `${value} mm`}
          </button>
        ))}
      </div>
      <div className="frame-measurements">
        <span>
          입력 크기 · 액자 포함{" "}
          <strong>
            {artwork.widthMm} × {artwork.heightMm} mm
          </strong>
        </span>
        <span>
          액자 포함 · 고정{" "}
          <strong>
            {width} × {height} mm
          </strong>
        </span>
        <span>
          사진 표시 크기{" "}
          <strong>
            {layout.imageWidthMm} × {layout.imageHeightMm} mm
          </strong>
        </span>
      </div>
      <p className="frame-help">
        입력 크기는 액자까지 포함한 전체 크기입니다. 프레임과 여백은 그 안에
        들어갑니다. 좌우는 같게, 위·아래는 따로 조절하며 사진 크기와 위치가
        바뀝니다. 상단 ‘저장’으로 보관합니다.
      </p>
    </section>
  );
}

function FrameDimension({
  label,
  value,
  max,
  limit = 1000,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  limit?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="frame-dimension">
      <label>
        {label}
        <input
          type="range"
          aria-label={`${label} 슬라이더`}
          min={0}
          max={Math.min(limit, Math.max(max, value))}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
      <label className="frame-mm">
        <input
          type="number"
          aria-label={`${label} mm`}
          min={0}
          max={limit}
          step={1}
          value={value}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            if (Number.isFinite(next))
              onChange(Math.max(0, Math.min(limit, next)));
          }}
        />
        <span>mm</span>
      </label>
    </div>
  );
}
