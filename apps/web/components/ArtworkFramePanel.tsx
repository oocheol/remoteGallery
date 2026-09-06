"use client";

import { useId } from "react";
import type { Artwork } from "@gallery/shared";

export type FramePatch = Pick<
  Artwork,
  "frameMaterial" | "frameWidthMm" | "frameDepthMm" | "matWidthMm"
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
  const width = artwork.widthMm + 2 * (frame + mat);
  const height = artwork.heightMm + 2 * (frame + mat);
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
          aria-label={`${artwork.title}, ${frame ? (material === "wood" ? "우드 액자" : "블랙 액자") : "프레임 없음"}, 사방 여백 ${mat}mm`}
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
            x={frame + mat}
            y={frame + mat}
            width={artwork.widthMm}
            height={artwork.heightMm}
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
                frameWidthMm: frame || 20,
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
        max={100}
        onChange={(value) =>
          onChange({
            frameWidthMm: value,
            ...(value > 0 && !artwork.frameDepthMm ? { frameDepthMm: 25 } : {}),
          })
        }
      />
      <FrameDimension
        label="여백 · 사방"
        value={mat}
        max={200}
        onChange={(value) => onChange({ matWidthMm: value })}
      />
      <div className="mat-presets" role="group" aria-label="여백 빠른 선택">
        {[0, 30, 50, 80].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={mat === value}
            onClick={() => onChange({ matWidthMm: value })}
          >
            {value === 0 ? "여백 없음" : `${value} mm`}
          </button>
        ))}
      </div>
      <div className="frame-measurements">
        <span>
          작품 원본{" "}
          <strong>
            {artwork.widthMm} × {artwork.heightMm} mm
          </strong>
        </span>
        <span>
          액자 포함{" "}
          <strong>
            {width} × {height} mm
          </strong>
        </span>
      </div>
      <p className="frame-help">
        여백은 작품 바깥에 더해집니다. 같은 작품의 모든 배치에 적용되며, 상단
        ‘저장’으로 보관합니다.
      </p>
    </section>
  );
}

function FrameDimension({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
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
          max={Math.max(max, value)}
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
          max={1000}
          step={1}
          value={value}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            if (Number.isFinite(next))
              onChange(Math.max(0, Math.min(1000, next)));
          }}
        />
        <span>mm</span>
      </label>
    </div>
  );
}
