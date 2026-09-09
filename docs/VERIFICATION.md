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


## Independent top/bottom mat (2026-09-06)

- Added separate left/right, top and bottom mat inputs and a clearly labelled uniform preset group. Side changes preserve vertical values. Both SVG and 3D move the photo toward the smaller vertical mat while keeping the outer frame fixed. The 3D white mat is also rendered when side margins are zero but top/bottom are positive.
- All 19 geometry tests pass. Asymmetric 700mm frame case verifies a 560×550mm image and +25mm vertical center offset for frame 20, side 50, top 30, bottom 80. Tests cover reversed margins, distinct width/height bounds and legacy symmetric fallback.
- `npx tsx tests/frame-flow.ts` passes asymmetric save/reload, combined inset validation and immutable share checks, alongside the existing fixed-frame cases.
- Browser verified side 40, top 30, bottom 120 on a 600×900mm frame: SVG photo x=60, y=50, width=480, height=710; preview and 3D show the larger bottom mat. Save succeeded without browser errors. Typecheck and build pass (existing storage tracing warnings remain).

## Vercel 배포 검증 (2026-09-07)

- Production: https://remotegallery.vercel.app — Neon Postgres + private Vercel Blob, 관리자 로그인.
- 타입 검사, 단위 테스트 19개, 로컬 및 실제 배포 API의 액자·상하 여백 저장/재조회/충돌 방지/고정 공유 테스트 통과.
- 기존 와이아트갤러리 도면, 작품 4점과 원본 파일 6개 이전. 편집 화면과 이미지 로딩, 비로그인 방문자 공유 화면을 브라우저에서 확인.
- 7.7MB PNG를 브라우저에서 Blob multipart로 직접 업로드하고 서버 정규화 후 작품으로 등록하는 흐름 확인.
- 클라우드 실측 도면 생성은 READY로 완료. Python이 필요한 영상·사진 복원은 명시적으로 지원 불가 응답을 반환.
- Vercel 어댑터에서 빠지는 Next.js 16.3 서버 모듈을 outputFileTracingIncludes로 포함해 런타임 부팅 확인.
- 검증 전용 갤러리는 사용자 갤러리와 분리해 생성하고 완료 후 정리.

## 작품 삭제 및 업로드 피드백 (2026-09-10)

- 작품별 삭제 버튼과 삭제 확인을 제공하며, 저장되지 않은 변경이 있으면 먼저 저장하도록 안내합니다.
- 삭제는 작품, 배치와 연결된 관람자를 함께 정리하고 전시 revision을 증가시킵니다. 기존 공유 스냅샷과 이미지 파일은 유지됩니다.
- `tests/artwork-delete.ts`: 로컬과 실제 배포에서 삭제 후 재조회, 관람자 정리, stale revision 거절, 기존 공유 이미지 접근 확인.
- 업로드 성공/실패를 작품 목록 바로 아래에 표시하고 실패 시 파일·치수 입력을 유지합니다. 손상된 TIFF의 변환 실패 이유를 브라우저에서 확인했습니다.
- 이미지 변환 제한을 8천만에서 2억 픽셀로 조정했습니다. 9천만 픽셀 TIFF 회귀 테스트와 실제 배포 변환/작품 등록을 확인했습니다. 파일당 120MB, 결과 이미지 최대 4096px 제한은 유지합니다.
