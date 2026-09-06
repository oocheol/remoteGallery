# Gallery Twin — Master plan

## Product definition
Capture → Reconstruct → Calibrate → Edit → Curate → Preview → Share → Install. A desktop-first exhibition planning application with a mobile-capable read-only visitor view. Korean-first interface. Initial venue: 와이아트갤러리, 서울 중구 퇴계로27길 28 지하1층 3호 (user supplied).

## Repository investigation, 2026-09-06
The supplied workspace was empty (only work/ and outputs/); no existing repository or AGENTS.md was found in ancestor folders. Deliverable repository lives in outputs/gallery-twin. Node 26.7, npm 11.19, Python, uv, FFmpeg are available. COLMAP executable and CUDA are absent; Docker daemon is stopped. Do not claim GPU execution.

## Source evidence
IMG_3415.mov: 20.435 s, 1920×1080 H.264 ~60 fps, 58 MiB. Shows white gallery walls with photographic works and visible corners. IMG_4711.heic: dimensioned floor plan, not a scene photograph. Its labels specify upper wall 3.85m, step 1.70m, next horizontal 2.05m, next step 1.75m, next horizontal 1.05m, right wall 4.90m, left wall 8.35m, lower left 2.80m, partition 2.40m, lower right 1.60m, H=2.74m. Vertical closure 1.70+1.75+4.90=8.35. Total width 6.95m. Entrance geometry is schematic and must remain marked estimated. Blue highlighting is annotation, not a wall thickness.

## MVP and user flow
Create project → upload local photos/video (or select provided measured venue) → enqueue real background processing → observe persisted stages/errors → load measured proxy or real sparse SfM result → inspect provenance → calibrate two reference points → edit wall endpoints/heights → upload art and enter 600×900mm → drag/snap to wall → move/align/equal spacing with bounds/collision feedback → save revision → reload → visitor mode → immutable read-only share snapshot → print installation list.
A measured floor-plan proxy is a valid geometric reconstruction, explicitly not a photorealistic scan. Generic captures use an honest SfM pipeline; failures do not become a fabricated room. A single image/360 unsupported path reports an actionable limitation.

## Non-MVP
Production hosted identity and billing, arbitrary CAD parsing, automatic monocular room inference, production Gaussian Splat training, WebXR, LiDAR ingestion, collaboration, marketplace, lighting simulation. No external paid jobs or public deployment without configuration.

## Architecture
Next.js App Router + React 19 + TypeScript. R3F 9/Three for editor; pure spatial math package. Next route handlers form the application API. PostgreSQL-compatible persistent local PGlite for zero-service development; standard PostgreSQL adapter for deployment. Asset storage local private filesystem behind authorized routes, adapter contract for S3. Separate long-running Node job worker invokes Python reconstruction CLI; jobs never run inside HTTP requests. No unnecessary separate API service.

## Reconstruction
Measured plan route produces deterministic metric proxy with source labels and uncertainty. Video route selects bounded sharp nonredundant frames using FFmpeg/OpenCV, estimates actual camera poses and sparse points through pycolmap CPU when available. Visual representation and editable wall/floor proxy stay separate; raw SfM without credible planes cannot claim hangable detected walls. Future CUDA worker adapter creates dense mesh/splats.

## Editor
Right-handed Y-up, meters internally. Artwork physical dimensions stored mm; wall local u increases start→end and v is floor height. Wall normal is inward. Geometric coordinates and calibration are persisted; recalibration scales scene geometry and placement coordinates but never physical artwork dimensions. Wall bounds include frame extents. Selection, drag/snapping, numeric position, alignment/spacing, undo/redo, duplicate/delete/lock, orbit/top/visitor viewpoints. Scene visualization loads lazily, bounded thumbnails/points.

## Data/storage/jobs
Gallery owns assets, scene, artworks and exhibitions. Scene geometry version and calibration provenance tracked. Exhibition placements reference artwork and wall IDs. Save uses expected revision to prevent lost updates. Share stores immutable snapshot with random capability token; can be revoked. Jobs persist stages/progress/error/log references, recover interrupted work with bounded retries. Asset cleanup must not remove referenced shared assets.

## Security
Local single-user session via signed/random HttpOnly capability cookie; protect mutations and private assets. Same-origin checks and upload size/type validation; no path-based user filesystem reads. Public share endpoint exposes only snapshot and required derivative assets, never raw gallery captures or owner tokens. URL import adapter disabled unless allowlist/SSRF protections and rights affirmation are configured. Bind local app to loopback. Before internet deployment require TLS, identity, authorization review, limits, object storage and worker isolation.

## Risks
White textureless walls, panning-only camera motion, unknown intrinsic changes and insufficient parallax can prevent SfM. Sparse points are not dense photorealistic reconstruction. Plan entrance dimensions require measurement. GPU unavailable on this host; no fabricated GS success. User media may carry location metadata: keep raw assets private, strip shared derivatives. Upload memory must be bounded. Cross-process DB locking/job leases and revision races require integration tests.

## Milestones and gates
1. Freeze architecture/interfaces and ownership (this document set).
2. Parallel scaffold/types, API/storage/jobs, spatial editor and Python pipeline.
3. Integrate provided measured floor plan and original capture into a first project.
4. Run typecheck/build, spatial and API tests, worker success/failure tests.
5. Browser E2E: create/upload/process/calibrate/art placement/save/reload/share read-only. Report exact verified routes and remaining constraints; code generation alone is not completion.
