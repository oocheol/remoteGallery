# Gallery Twin

Gallery Twin은 전시 공간을 직접 계측하고, 작품을 실제 벽에 배치해 보는 로컬 우선 전시 계획 도구입니다. 현재 MVP의 기준 장면은 제공된 와이아트갤러리 평면도의 치수로 만든 `measured-plan` 장면입니다. 이 장면은 사진처럼 보이는 디지털 트윈이 아니라, 출처와 추정 영역이 표시된 편집 가능한 미터 단위 공간 프록시입니다.

[검증 결과](docs/VERIFICATION.md) · [설계 문서](docs/MASTER_PLAN.md)

## 현재 범위

- 브라우저에서 갤러리, 원본 캡처/작품 파일, 작품 실측 치수와 배치를 관리합니다.
- 별도 Node worker가 큐를 가져가며 HTTP 요청 안에서 재구성 작업을 실행하지 않습니다.
- `measured-plan`은 검토된 평면도 치수를 사용합니다. `video`/`photos`는 로컬 CPU SfM 의존성이 없거나 영상에 충분한 시차가 없으면 `FAILED`와 원인을 남겨야 합니다.
- sparse point cloud는 photorealistic mesh 또는 Gaussian splat이 아닙니다. GPU 실행, 자동 벽 추정, 임의의 단일 이미지 방 추정은 이 저장소에서 주장하지 않습니다.
- 로컬 모드는 PGlite와 로컬 디스크를 사용합니다. Vercel 모드는 Neon Postgres와 비공개 Vercel Blob을 사용하며 관리자 비밀번호로 편집 화면을 보호합니다. 공유 링크는 로그인 없이 읽기 전용으로 열 수 있습니다.

## 작품 배치와 액자 설정

1. 오른쪽 목록에서 작품을 선택합니다. 썸네일을 눌러도 선택됩니다.
2. **액자·여백**에서 우드·블랙·없음을 고르고, 프레임 폭과 좌우·위·아래 여백을 mm로 조절합니다. 좌우는 같은 값이며 위와 아래는 각각 설정합니다. 정면 미리보기와 3D 공간에 즉시 반영됩니다.
3. 도면에서 벽을 선택한 뒤 작품 옆 **배치**를 누릅니다. 작품을 드래그하거나 중심 위치를 입력합니다.
4. 상단 **저장** 또는 Ctrl/Cmd+S로 배치와 액자 설정을 함께 저장합니다. Ctrl/Cmd+Z로 되돌리고 Shift를 더하면 다시 실행합니다.

둘러보기에서는 바닥을 더블클릭해 해당 위치의 눈높이에서 자유 모드로 전환합니다. 벽이나 작품을 더블클릭하면 벽 앞의 이동 가능한 위치에서 해당 방향을 바라봅니다. 작품·액자는 그림자 없이 표시됩니다.

처음 입력한 가로·세로는 **액자까지 포함한 전체 크기**로 고정됩니다. 프레임과 여백 모두 그 안에 들어갑니다. 사진 가로는 `입력 가로 − 2 × 프레임 폭 − 2 × 좌우 여백`, 사진 세로는 `입력 세로 − 2 × 프레임 폭 − 위 여백 − 아래 여백`입니다. 아래 여백을 더 크게 주면 사진이 위로 이동합니다. 예를 들어 700×700mm에 프레임 폭 20mm와 사방 여백 50mm를 주면 사진은 560×560mm이며, 액자 외곽은 계속 700×700mm입니다. 프레임·여백 변경으로 작품 위치나 간격이 바뀌지 않습니다. 사진 영역은 최소 1mm 남아야 합니다. 같은 작품의 모든 배치에 같은 설정이 적용됩니다. 이미 만든 공유 링크는 생성 당시 크기 기준을 유지하므로 변경 후에는 새 링크를 만드세요.

## 로컬 요구 사항

Node 26 및 npm 11을 기준으로 확인합니다. Node 버전 관리자를 쓰는 경우 먼저 해당 버전을 활성화하세요. `video`/`photos` CPU 경로를 시험하려면 Python, FFmpeg, OpenCV와 pycolmap이 추가로 필요할 수 있습니다. pycolmap이나 COLMAP이 없는 호스트에서는 그 경로가 성공한 것처럼 처리되지 않고 명시적인 의존성 오류로 끝나야 합니다.

## 설치

저장소 루트에서 실행합니다.

```bash
npm install
uv venv services/reconstruction/.venv --python 3.11
uv pip install --python services/reconstruction/.venv/bin/python -r services/reconstruction/requirements.txt
```

FFmpeg와 FFprobe는 PATH에서 실행 가능해야 합니다. HEIC는 macOS에서 `sips`, Vercel Linux에서 `heic-convert`로 디코딩합니다. JPEG/PNG 작품은 Sharp에서 EXIF 방향을 적용하고 메타데이터를 제거하며 최대 4096px로 정규화합니다. TIFF(`.tif`·`.tiff`) 이미지는 모든 업로드 역할에서 첫 페이지만 사용하고, 같은 방식으로 최대 4096px JPEG로 정규화합니다.

`dev:local`은 `.env` 없이 사용할 수 있습니다. 웹과 worker에 같은 절대 저장 경로와 자동 생성된 `WORKER_TOKEN`을 전달합니다. 데이터는 `.gallery-twin/`에 저장합니다. 웹만 PGlite를 열고, worker는 내부 인증 HTTP 경로로 접근합니다. 별도 구성이 필요한 경우 `.env.example`의 변수 이름을 참고하세요.

## 실행

권장 개발 실행은 웹과 worker를 함께 띄우는 로컬 launcher입니다.

```bash
# 웹 UI/API와 worker를 함께 실행하고, .gallery-twin/local-config.json에
# 권한이 제한된 로컬 WORKER_TOKEN을 없을 때만 생성합니다.
npm run dev:local
```

웹은 기본적으로 [http://127.0.0.1:3000](http://127.0.0.1:3000)에서 loopback으로만 엽니다. 브라우저가 `/api/session`을 먼저 호출해 HttpOnly owner session을 만들며, 이후 갤러리 생성과 업로드 같은 변경은 동일한 loopback origin에서만 허용됩니다.

제공된 파일로 기본 프로젝트를 만들려면 다음처럼 실행합니다. 경로는 각자 원본 파일 위치에 맞춰 바꿉니다.

```bash
PLAN_PATH=/path/to/IMG_4711.heic \
VIDEO_PATH=/path/to/IMG_3415.mov \
npx tsx scripts/seed-venue.ts
```

seed는 평면도를 `reference`로 업로드하고 measured-plan job을 enqueue합니다. seed가 만든 프로젝트와 job은 `.gallery-twin/seed.json`에 기록됩니다. 원본은 로컬 저장소에 남고 public share 응답에는 포함되지 않습니다.

## 점검 명령

```bash
npm run typecheck
npm test
npx tsx tests/image-normalization.ts
# 실행 중인 로컬 서버에서 액자 저장·공유·충돌 검증 (별도 검증 갤러리 생성)
npx tsx tests/frame-flow.ts
services/reconstruction/.venv/bin/python -m unittest discover -s services/reconstruction -p 'test*.py'
npm run build
```

API flow는 실행 중인 웹과 worker를 실제로 호출합니다. 테스트는 성공을 timer로 가정하지 않고 measured-plan job이 실제로 `READY`가 될 때까지 bounded polling합니다. 기본 timeout은 180초이며 로컬 환경에서 조정할 수 있습니다.

```bash
GALLERY_TEST_BASE_URL=http://127.0.0.1:3000 \
npx tsx tests/api-flow.ts
```

필요하면 `GALLERY_TEST_TIMEOUT_MS=300000`과 `GALLERY_TEST_POLL_MS=1000`을 지정할 수 있습니다. 종료 코드는 성공 시 0, 어떤 단계라도 계약과 다른 응답을 받거나 job이 `FAILED`/timeout이면 1입니다. 출력의 마지막 `PASS:` 문장은 session, gallery, upload, 실제 worker job, placement revision, calibration 불변성, scoped share와 revoke를 모두 통과했다는 뜻입니다. 서버가 시작되지 않았거나 worker가 실행되지 않은 경우는 테스트 실패로 보고되며 fake success로 대체되지 않습니다.

API 테스트는 작은 embedded PNG를 사용하므로 외부 이미지 다운로드가 필요하지 않습니다. 테스트가 만드는 갤러리는 random 이름을 사용하므로 개발용 데이터베이스를 비우지 않고 반복 실행할 수 있습니다. 테스트 레코드는 남습니다. 실제 프로젝트가 있는 `.gallery-twin/` 전체를 테스트 정리 목적으로 삭제하지 마세요.

## API 흐름

정확한 wire shape는 [`docs/INTERFACES.md`](docs/INTERFACES.md)에 고정되어 있습니다. 대표 흐름은 다음과 같습니다.

1. `GET /api/session`으로 owner session을 만들고 cookie를 보관합니다.
2. `POST /api/galleries`로 갤러리를 만듭니다.
3. `POST /api/assets`로 capture/reference/artwork 파일을 업로드합니다.
4. `POST /api/jobs`에 `mode: "measured-plan"`과 asset ID를 보내고 `GET /api/jobs/:id`를 polling합니다.
5. `GET /api/galleries/:id`로 READY scene을 확인하고, 작품을 생성한 뒤 `PUT /api/exhibitions/:id`로 배치를 저장합니다. `expectedRevision`이 오래된 요청은 409여야 합니다.
6. `PATCH /api/galleries/:id`로 사용자 calibration을 저장합니다. calibration은 장면 좌표와 배치 좌표를 바꿀 수 있지만 artwork의 물리 치수(mm)는 바꾸지 않습니다.
7. `POST /api/shares`가 immutable snapshot capability token을 만들고 `GET /api/shares/:token`은 owner cookie 없이 읽을 수 있습니다. snapshot에는 raw capture나 owner asset 목록이 없어야 하며 derivative asset만 token-scoped URL로 접근합니다.
8. `DELETE /api/shares/:token` 이후 같은 token은 공개되지 않습니다.

## 저장소와 보안 경계

소유자 데이터와 private asset은 로컬 파일/DB에 저장되며 원본 capture는 share snapshot으로 복사되지 않습니다. share token은 capability URL이므로 로그나 채팅에 불필요하게 공개하지 마세요. loopback 전용 세션은 단일 사용자 로컬 MVP를 위한 장치이며 인터넷 배포용 인증이 아닙니다. 실제 배포 전에 TLS, 사용자 인증, 권한 모델, 업로드 제한, object storage, worker 격리, Postgres worker lease와 감사 로깅을 별도로 검토해야 합니다.

## 계측과 한계

장면 좌표는 Y-up, 내부 단위는 meter, 작품 치수는 millimeter입니다. 캘리브레이션은 두 점과 알려진 거리를 provenance와 함께 저장합니다. 평면도에 없는 입구 크기와 벽 두께는 추정값으로 표시해야 하며, 사진에서 보이지 않는 공간이나 매달 수 있는 벽을 자동으로 발명하지 않습니다. 흰 벽, 회전만 있는 영상, 낮은 질감과 부족한 overlap은 CPU SfM 실패 사유가 될 수 있습니다. 이런 경우 실패 메시지를 확인하고 더 많은 겹치는 사진, 측정된 평면도 또는 사용자 calibration을 제공하세요.

## 배포 상태

이 저장소는 로컬 개발과 검증을 위한 MVP입니다. 현재 문서와 코드에는 공개 URL 배포, 외부 GPU 사용, 유료 작업 실행, 원본의 제3자 업로드가 포함되어 있지 않습니다.

제공 도면은 `scripts/seed-venue.ts`가 수동 전사한 고정 치수로 준비합니다. 일반 프로젝트 UI는 영상/사진을 지원하며 임의의 도면 자동 OCR은 제공하지 않습니다. 재시도는 새 job/output 폴더를 사용합니다.

## 공개 저장소에 포함하지 않는 로컬 파일

원본 MOV/HEIC, 검증 스크린샷, `.gallery-twin/`의 DB·업로드·토큰, `work/`, 의존성 및 빌드 캐시는 로컬에 보관하며 Git에서 제외합니다. 새로 clone하면 소스 코드만 내려받으므로 의존성 설치 후 자신의 입력 파일로 프로젝트를 만드세요.

### 관람자와 자유 카메라

오른쪽 **관람자 · 작품 앞 1m**에서 배치된 작품을 선택하고 사람을 세울 수 있습니다. 전체 작품에 한 번에 추가하거나 키를 50–250cm로 지정할 수 있습니다. 눈높이는 키의 약 93%로 표시하며, **눈높이에서 보기**로 관람 시점을 확인합니다. 1m는 작품 앞면에서 눈까지의 수평 거리입니다. 관람자는 작품 이동을 따라가며 저장·되돌리기·공유에 포함됩니다.

**자유 모드**는 현재 카메라 위치에서 시작합니다. WASD/방향키로 이동, E 상승, Q 하강, Shift로 빠른 이동, 왼쪽 드래그로 시선 회전, 오른쪽 드래그로 화면 방향 이동, 휠로 전후 이동합니다. 화면의 이동 버튼도 사용할 수 있으며 벽과 바닥 경계에 이동 제한이 없습니다. 자유 모드에서도 작품을 드래그해 배치할 수 있습니다. 작품을 옮기는 동안에는 카메라 이동을 멈춥니다.

자유 모드의 이동 키는 한글 입력 상태에서도 같은 키 위치로 작동합니다. 도구 버튼을 누른 뒤에도 바로 이동할 수 있으며, 입력칸을 편집하는 동안은 이동하지 않습니다. 상단의 **왼쪽/오른쪽 패널 숨기기**로 작업 영역을 넓히고, 3D 화면 오른쪽 위의 **조작 버튼 숨기기**로 방향 버튼을 감출 수 있습니다. 각 버튼으로 다시 펼칠 수 있습니다.

## Vercel 배포

- 프로젝트 루트: `apps/web`, Framework: Next.js, Node.js: 24.x.
- Install Command: `npm install --prefix ../..`, Build Command: `npm run build`.
- Neon Postgres와 **private** Vercel Blob 저장소를 프로젝트에 연결합니다.
- Production/Preview 환경에 `GALLERY_CLOUD=1`, `NEXT_PUBLIC_GALLERY_CLOUD=1`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `GALLERY_ADMIN_PASSWORD_HASH`를 설정합니다. 관리자 비밀번호는 충분히 긴 임의 문자열로 만들고 SHA-256 hex 해시만 환경 변수에 저장합니다.
- 저장소 루트에서 `vercel link` 후 `vercel --prod`로 배포합니다. 로컬 데이터와 원본 영상, 비밀번호는 Git이나 배포 파일에 포함하지 않습니다.
- 클라우드에서 갤러리 생성, 와이아트갤러리 실측 도면 불러오기, 작품 업로드/배치, 액자/여백 설정, 관람자와 카메라 조작, 저장 및 읽기 전용 공유를 지원합니다.
- 대용량 작품은 브라우저에서 비공개 Blob으로 직접 전송한 뒤 서버가 파일 형식을 확인하고 사진을 정규화합니다. Vercel 함수의 요청 본문 크기 제한을 피합니다.
- 영상·사진 자동 복원은 Python 작업 프로세스가 있는 로컬 모드에서만 지원합니다. 클라우드에서는 지원되지 않는 복원 작업을 큐에 남기지 않고 명확히 거절합니다.
- 로컬과 클라우드의 편집 내용은 자동 동기화되지 않습니다. 공유 링크도 생성한 환경에 속합니다.

작품 목록의 **삭제** 버튼으로 업로드한 작품을 삭제할 수 있습니다. 저장하지 않은 편집은 먼저 저장해야 하며, 삭제하면 벽 배치와 연결된 관람자도 정리됩니다. 이미 발급한 공유 링크는 그대로 유지됩니다. 업로드 결과와 실패 이유는 업로드 폼 아래에 표시되며, 실패하면 파일과 입력값을 유지해 다시 시도할 수 있습니다. 작품 이미지는 파일당 120MB, 2억 픽셀까지 지원하며 TIFF는 첫 페이지만 사용합니다.
