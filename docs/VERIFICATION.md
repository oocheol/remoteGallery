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

## Double-click walking and shadow update
- Artwork/frame meshes no longer cast wall shadows; the front preview drop shadow is also removed.
- In orbit mode, double-clicking floor, wall or artwork switches editor/visitor to eye-level walking near the picked point. Wall picks face the wall from the interior; floor picks retain horizontal viewing direction. Wall and polygon clearance are checked, and calibration mode ignores this navigation gesture.
- Browser verified floor double-click, artwork selection followed by double-click, active walking mode and canvas keyboard focus. New geometry tests cover exact floor coordinates, eye height, inward wall offsets, corner clearance and unusable destinations.

## Fixed-size inset mat correction
- Original entered dimensions represent the no-mat image area. Mat now shrinks the visible image inside that fixed area; frame-inclusive external dimensions, placement bounds and spacing remain unchanged.
- A shared layout calculation drives SVG preview, Three.js and collision bounds. UI limits and API validation prevent mat from consuming the image; material/frame width continue to work independently.
- Geometry and live API tests cover fixed outer dimensions, reduced photo size, unchanged placement positions, invalid mat rejection, rollback, persistence and inset share snapshots. Legacy shares retain their earlier outset presentation.
- Browser comparison: a 600×900mm input with a 20mm frame kept its 640×940mm external box at both 0mm and 50mm mat; photo changed from 600×900mm to 500×800mm. Keyboard save succeeded; browser reported no errors. Typecheck, 13 geometry tests, live frame API regression and production build passed.


## Observers and free camera (2026-09-06)

- Added actual-scale humanoids with custom height, approximate eye markers, a selected sight line and a 1m horizontal dimension. Browser checked 170cm creation, custom 180cm input, eye view, overhead free mode and vertical movement without browser errors.
- Geometry tests cover heights 50/170/250cm, both wall directions, frame depth, elevated floors, exact horizontal distance and insufficient floor space. All 15 geometry tests pass.
- `npx tsx tests/observer-flow.ts` passes isolated-gallery save/reload, height limits, duplicate/dangling reference validation, revision conflicts, immutable shares and observer cleanup after placement deletion.
- Free mode replaces walking: preserves the current overview on entry, allows full camera-forward/sideways/vertical movement outside floor and wall boundaries, and offers mouse and on-screen controls. Orbit double-click still enters at the picked eye-level destination.
- Typecheck and production build pass; the build retains the existing two dynamic-storage-path tracing warnings.


## Artwork drag regression fix (2026-09-06)

- Removed the free-mode guard that incorrectly prevented artwork dragging. Camera controls remain disabled during an active artwork drag; blank-space dragging still controls the camera.
- Browser verified free-mode movement from (u=1.2, v=1.5) to (u=2.04, v=1.76), with unchanged room framing and the observer following the artwork. Undo restored the original placement; orbit-mode dragging then moved it to (u=1.66, v=1.86). No browser errors; typecheck passes.


## Keyboard focus and collapsible tools (2026-09-06)

- Camera movement uses physical KeyboardEvent.code, including Korean IME key values, and listens at window scope in free mode. Inputs, editable content and dialogs retain their typing behavior. Keyup, window blur, hidden document and editable focus clear held movement appropriately; pointer release no longer clears held movement keys.
- Browser checks cover all six WASD/E/Q keys with Korean key values and a focused toolbar button, including after an artwork drag. Camera motion is verified by comparing rendered scene pixels; typing into the height field leaves the camera still.
- Left and right editor panels hide independently, expanding the canvas. Rotation/movement controls can be hidden and restored separately. Checked hide/show and retained scene rendering. Typecheck and production build pass (existing storage tracing warnings remain).
- Reproduce keyboard and panel checks: `npx tsx tests/observer-flow.ts`, then `node tests/browser-camera-controls.mjs`. The test uses an isolated fixture and writes screenshots under ignored `work/camera-controls/`.


## Fixed outer frame dimensions (2026-09-06)

- Entered artwork width/height now include the frame. Both frame and mat subtract from the photo while outer dimensions, placement centers, edge clearance and inter-artwork spacing stay fixed. Upload and frame-panel text describe this convention; frame and mat inputs constrain their combined inset.
- All 17 geometry tests pass, including a 700×700mm square with variable frames, exact wall-edge/touching placements, combined frame/mat limits, rotated outer bounds and both legacy share layouts.
- `npx tsx tests/frame-flow.ts` passes save/reload, fixed outer extents at touching positions, combined-inset rejection/rollback, stale revision and immutable new shares.
- Browser verified 700×700mm with frame 20mm + mat 50mm -> photo 560×560mm; frame 60mm + mat 50mm -> photo 480×480mm. SVG outer viewBox remained 700×700; 3D outer size and position stayed fixed, wood material and save worked without browser errors.
- Typecheck and production build pass (existing storage tracing warnings remain).
