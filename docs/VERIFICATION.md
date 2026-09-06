# Verification record — 2026-09-06

## Completed
- Shared application typecheck passed after final UI and mobile fixes.
- 9 spatial tests: coordinates, concavity/inward normals, rotated frame bounds, SAT overlap, calibration cumulative scaling and mm invariance, edge spacing and locks.
- 6 Python tests: measured plan dimensions/closure, unsupported inputs, atomic result/progress, blur and duplicates, bounded selection, safe retry rejection.
- Full live API flow passed: owner session; gallery creation; real multipart uploads; queued measured-plan worker; 600×900mm artwork; save/reload; concurrent save conflict; existing placement validation; atomic calibration; immutable/scoped guest share and revocation.
- Next production build passed after final UI and mobile fixes. Dynamic filesystem tracing warnings remain for local runtime paths.
- Read-only 3D browser inspection: correct stepped floor/partition/entrance, orbit/top, walk and W movement. Fixed aspect-aware auto-fit camera.
- Browser created new video project, uploaded original IMG_3415.mov and started real job. API worker produced READY: 40/40 accepted frames registered, 3,725 points, 3,568 exported stable points, reprojection error 0.477px, pipeline 10.323s on this run. Floating point/native pipeline differences produce slightly different counts from first CLI run (3,567). No fake proxies added.

## Final browser checks
- Browser artwork upload, 600×900mm dimensions, wall placement, drag, save and reload passed in a separate practice gallery.
- Two-point calibration changed scene scale while preserving artwork millimeter dimensions.
- Artwork textures render after asynchronous loading; sparse scenes render with an empty floor polygon without errors.
- Read-only desktop and mobile visitor views passed. At a 390px viewport, document and canvas widths are 390px; editor controls are absent.
- Image normalization regression passed: EXIF orientation applied, EXIF/XMP removed, dimensions preserved after normalization, spoofed JPEG rejected.
- Original measured gallery and independent video reconstruction remain saved locally. Practice content is kept in a separate gallery.
- Local verification screenshots are retained in docs/ but excluded from the public Git repository with source media and runtime data.

## Relocation verification
- Project, dependencies, runtime database and session artifacts moved to the requested remoteGallery folder.
- Updated all 9 persisted asset paths; all files exist and are served successfully by the restarted application.
- All 3 saved gallery pages and scenes loaded successfully from the new location.
- Typecheck, 9 geometry tests, 6 Python tests, image normalization regression and production build passed again after relocation.
- Public Git staging contains source and documentation only; original media, verification screenshots, database, local tokens, dependencies and build outputs are excluded.

## Known scope limits
Local-only application (loopback); links work on this running local server, not publicly hosted. No GPU/GS training or photorealistic twin claim. Sparse camera-up is estimated; no automatic wall/floor detection. General floorplan OCR/CAD and 360 geometry not implemented. Initial one exhibition per gallery, immutable shares; multiple saved exhibition versions deferred. Video artworks deferred to Phase2 (uploads restricted to images). S3/deployed PostgreSQL/hosted identity remain extension interfaces/design, no production adapter verification. Floorplan wall thickness and entrance details need on-site checking.

## Frame and usability update
- Added wood/black/no-frame preview, adjustable frame width and four-sided white mat, with external dimensions. Three.js and front preview use the same measurements.
- Saved styles share the scene/placement transaction and exhibition revision; new tests cover material/mat defaults, persistence, invalid/foreign inputs, stale revisions, frame/mat collision and boundary rollback, and immutable guest snapshot data.
- Geometry regression covers mat-inclusive collision and boundary behavior. Existing API workflow remains passing.
- Browser confirmed live wood rendering, 50mm mat, undo to 30mm, redo, and keyboard save in a separate test gallery.
- Editor now shows a three-step workflow, selected wall, visible view controls, explicit placement buttons and save state. Wall geometry and recapture controls are collapsed. Save preserves the camera angle when geometry is unchanged.
- Final typecheck, 10 geometry tests, existing live API workflow, dedicated frame API workflow and production build passed. A 390px editor viewport has a 390px document with no horizontal overflow. Wood and black render in both the front preview and the shared Three.js renderer; removed frame self-shadow artifacts.
