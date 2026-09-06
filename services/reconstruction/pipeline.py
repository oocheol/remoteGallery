#!/usr/bin/env python3
"""Local measured-plan adapter and bounded CPU sparse SfM. See README.md."""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

POLYGON = [[0, 0], [3.85, 0], [3.85, 1.70], [5.90, 1.70], [5.90, 3.45], [6.95, 3.45], [6.95, 8.35], [0, 8.35]]
MAX_FRAMES = 40
MAX_SOURCE_BYTES = 1024 * 1024 * 1024
MIN_SHARPNESS = 12.0


class PipelineError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    os.replace(temporary, path)


def progress(out, status, percent, message):
    atomic_json(out / 'progress.json', {'status': status, 'progress': percent, 'message': message})


def scene_base(manifest, kind):
    return {'id': f"scene-{manifest['jobId']}", 'galleryId': manifest.get('galleryId', manifest['jobId']), 'version': 1,
            'name': '와이아트갤러리 · 실측 도면' if kind == 'measured-plan' else '촬영 기반 희소 복원',
            'kind': kind, 'walls': [], 'floor': {'polygon': [], 'y': 0},
            'calibration': {'status': 'uncalibrated', 'source': 'COLMAP arbitrary scale', 'scaleFactor': 1},
            'visual': {'kind': 'none'}, 'warnings': []}


def measured_plan(manifest):
    scene = scene_base(manifest, 'measured-plan')
    scene['floor'] = {'polygon': [p[:] for p in POLYGON], 'y': 0}
    # Bottom edge has a non-hanging entrance zone; its exact door leaf is not specified.
    segments = [(POLYGON[i], POLYGON[i+1], False) for i in range(6)]
    segments += [([6.95, 8.35], [5.35, 8.35], False), ([2.80, 8.35], [0, 8.35], False),
                 ([0, 8.35], [0, 0], False), ([2.80, 8.35], [2.80, 5.95], False)]
    scene['walls'] = [{'id': f'wall-{i+1}', 'name': '파티션 2.40m' if i == 9 else f'벽 {i+1} · {math.dist(a,b):.2f}m',
                       'start': a, 'end': b, 'height': 2.74, 'thickness': 0.10, 'estimated': True}
                      for i, (a,b,_) in enumerate(segments)]
    scene['calibration'] = {'status': 'plan', 'source': 'IMG_4711.heic의 표기 치수 수동 전사 · 제공된 특정 도면 전용', 'scaleFactor': 1}
    scene['warnings'] = ['사진 자동 복원이 아닌 제공 도면의 치수 기반 프록시입니다.',
                         '벽 길이와 높이 2.74m는 도면 표기값입니다. 벽 두께 0.10m는 추정치입니다.',
                         '입구 주변 x=2.80–5.35 구간은 설치 제외 영역입니다. 실제 문 폭·깊이·개폐 공간은 미확인입니다.',
                         '일반 도면 OCR 기능이 아닙니다. 다른 전시장 도면에는 이 어댑터를 사용하지 마세요.']
    return scene


def run_command(args, timeout, log=None):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise PipelineError('DEPENDENCY_MISSING', f'필요한 프로그램을 찾을 수 없습니다: {args[0]}') from exc
    except subprocess.TimeoutExpired as exc:
        if log:
            Path(log).write_bytes((exc.stdout or b'') + (exc.stderr or b''))
        raise PipelineError('STAGE_TIMEOUT', f'{Path(str(args[0])).name} 단계 제한 시간 {timeout}초 초과') from exc
    if log:
        Path(log).write_bytes(result.stdout + result.stderr)
    if result.returncode:
        detail = result.stderr.decode('utf-8', errors='replace')[-1600:]
        raise PipelineError('PROCESS_FAILED', f'프로세스 종료 코드 {result.returncode}: {detail}')
    return result.stdout


def check_assets(manifest):
    assets = manifest.get('assets', [])
    if not isinstance(assets, list) or len(assets) > 120:
        raise PipelineError('INVALID_ASSETS', '촬영 파일은 최대 120개입니다.')
    for asset in assets:
        path = Path(asset['path'])
        if not path.is_file() or path.stat().st_size == 0 or path.stat().st_size > MAX_SOURCE_BYTES:
            raise PipelineError('INVALID_ASSET', f'파일 누락, 비어 있음 또는 1GB 초과: {asset.get("name", path.name)}')
    return assets


def quality(image):
    import cv2
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (min(640, gray.shape[1]), max(1, round(gray.shape[0]*min(640,gray.shape[1])/gray.shape[1]))))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    small = cv2.resize(gray, (17, 16))
    return sharpness, (small[:, 1:] > small[:, :-1]).reshape(-1)


def select_frames(candidates, destination, max_frames=MAX_FRAMES):
    """Bounded chronological sampling, then reject blur and visually identical views."""
    import cv2
    import numpy as np
    destination.mkdir(parents=True, exist_ok=True)
    if len(candidates) > max_frames:
        candidates = [candidates[i] for i in np.linspace(0, len(candidates)-1, max_frames).round().astype(int)]
    records, hashes, accepted = [], [], []
    for index, candidate in enumerate(candidates):
        frame = cv2.imread(str(candidate))  # OpenCV applies EXIF orientation by default.
        record = {'source': Path(candidate).name, 'candidateIndex': index}
        if frame is None:
            record['rejected'] = 'decode_failed'
        else:
            h,w = frame.shape[:2]
            if min(h,w) < 160 or h*w > 100_000_000:
                record['rejected'] = 'invalid_resolution'
            else:
                if max(h,w)>1280:
                    frame=cv2.resize(frame,(round(w*1280/max(h,w)),round(h*1280/max(h,w))))
                score, fingerprint = quality(frame)
                record['sharpness'] = round(score, 3)
                if score < MIN_SHARPNESS:
                    record['rejected'] = 'blur'
                elif any(int(np.count_nonzero(fingerprint != prior)) <= 5 for prior in hashes):
                    record['rejected'] = 'near_duplicate'
                else:
                    target = destination / f'frame_{index:04d}.jpg'
                    if not cv2.imwrite(str(target),frame,[cv2.IMWRITE_JPEG_QUALITY,92]):
                        raise PipelineError('WRITE_FAILED', '프레임 저장 실패')
                    hashes.append(fingerprint)
                    accepted.append(target)
                    record['accepted'] = target.name
        records.append(record)
    return accepted, {'candidates': len(records), 'accepted':len(accepted), 'rejected':len(records)-len(accepted), 'frames':records}


def prepare_capture(manifest, out, diagnostics):
    try:
        import cv2  # noqa: F401
    except ImportError as exc:
        raise PipelineError('DEPENDENCY_MISSING', 'OpenCV가 없습니다. requirements.txt를 설치하세요.') from exc
    assets = check_assets(manifest)
    mode = manifest['mode']
    candidate_dir = out / 'candidates'
    candidate_dir.mkdir()
    if mode == 'video':
        if len(assets) != 1 or not assets[0].get('mimeType','').startswith('video/'):
            raise PipelineError('INVALID_VIDEO', '동영상 파일 한 개가 필요합니다.')
        source = str(Path(assets[0]['path']).resolve())
        probe = json.loads(run_command(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                                      'stream=width,height,nb_frames,r_frame_rate,duration:format=duration','-of','json',source],20))
        streams=probe.get('streams',[])
        if not streams:
            raise PipelineError('INVALID_VIDEO', '디코딩 가능한 비디오 스트림이 없습니다.')
        duration=float(streams[0].get('duration') or probe.get('format',{}).get('duration') or 0)
        if not 0 < duration <= 1800:
            raise PipelineError('INVALID_VIDEO', '동영상 길이는 0초 초과 30분 이하여야 합니다.')
        diagnostics['video'] = probe
        cadence=min(3.0,MAX_FRAMES/duration)
        run_command(['ffmpeg','-v','error','-nostdin','-i',source,'-map','0:v:0','-an',
                     '-vf',f'fps={cadence},scale=1280:1280:force_original_aspect_ratio=decrease',
                     '-frames:v',str(MAX_FRAMES),'-q:v','2',str(candidate_dir/'candidate_%04d.jpg')],90,out/'decode.log')
        candidates=sorted(candidate_dir.glob('*.jpg'))
        diagnostics['sampleCadenceFps']=cadence
    else:
        if len(assets) < 3 or any(not a.get('mimeType','').startswith('image/') for a in assets):
            raise PipelineError('INSUFFICIENT_VIEWS', '이동하며 촬영한 겹치는 사진이 최소 3장 필요합니다.')
        candidates=[Path(a['path']) for a in assets]
    accepted, counts=select_frames(candidates,out/'frames')
    diagnostics['selection']=counts
    atomic_json(out/'selection.json',counts)
    if accepted:
        shutil.copyfile(accepted[len(accepted)//2],out/'preview.jpg')
        diagnostics['previewPath']=str(out/'preview.jpg')
    if len(accepted)<3:
        raise PipelineError('INSUFFICIENT_QUALITY_VIEWS', f'선명하고 중복되지 않는 프레임이 {len(accepted)}개뿐입니다. 최소 3개가 필요합니다.')
    return accepted


def colmap_stage(stage, out, mode):
    """Subprocess boundary bounds native COLMAP execution and preserves diagnostics."""
    import pycolmap as p
    db=out/'database.db'
    if stage == 'features':
        ops=p.FeatureExtractionOptions()
        ops.max_image_size=1280
        ops.num_threads=4
        ops.use_gpu=False
        ops.sift.max_num_features=2048
        p.extract_features(database_path=db,image_path=out/'frames',camera_mode=p.CameraMode.SINGLE if mode=='video' else p.CameraMode.AUTO,
                           extraction_options=ops,device=p.Device.cpu)
    elif stage == 'matching':
        ops=p.FeatureMatchingOptions()
        ops.num_threads=4
        ops.use_gpu=False
        if mode=='video':
            pairs=p.SequentialPairingOptions(); pairs.overlap=8; pairs.loop_detection=False
            p.match_sequential(database_path=db,matching_options=ops,pairing_options=pairs,device=p.Device.cpu)
        else:
            p.match_exhaustive(database_path=db,matching_options=ops,device=p.Device.cpu)
    elif stage == 'mapping':
        ops=p.IncrementalPipelineOptions()
        ops.num_threads=4
        ops.max_num_models=3
        ops.min_model_size=3
        ops.init_num_trials=50
        ops.max_runtime_seconds=150
        ops.random_seed=7
        ops.ba_global_max_num_iterations=30
        ops.ba_local_max_num_iterations=20
        (out/'models').mkdir(exist_ok=True)
        models=p.incremental_mapping(database_path=db,image_path=out/'frames',output_path=out/'models',options=ops)
        atomic_json(out/'model-summary.json', {'pycolmapVersion':p.__version__, 'models':[{'id':int(k),'registeredImages':m.num_reg_images(),'points':m.num_points3D(), 'meanReprojectionError':m.compute_mean_reprojection_error()} for k,m in models.items()]})


def export_sparse(manifest, out, diagnostics, accepted_count):
    import numpy as np
    import pycolmap as p
    summary=json.loads((out/'model-summary.json').read_text())
    diagnostics['reconstruction']=summary
    if not summary['models']:
        raise PipelineError('NO_CONNECTED_RECONSTRUCTION', '연결된 카메라 모델을 복원하지 못했습니다. 벽 질감, 겹침, 이동 시차가 있는 촬영이 필요합니다.')
    best=max(summary['models'],key=lambda m:(m['registeredImages'],m['points']))
    ratio=best['registeredImages']/accepted_count
    diagnostics['registrationRatio']=ratio
    if best['registeredImages']<3 or best['points']<100 or ratio<0.5 or best['meanReprojectionError']>3:
        raise PipelineError('LOW_CONFIDENCE_RECONSTRUCTION', f'복원 품질 부족: 등록 {best["registeredImages"]}/{accepted_count}, 점 {best["points"]}, 재투영 오차 {best["meanReprojectionError"]:.2f}px. 추가 촬영이 필요합니다.')
    model=p.Reconstruction(out/'models'/str(best['id']))
    points=[point for point in model.points3D.values() if point.error<=3 and point.track.length()>=3]
    if len(points)<100:
        raise PipelineError('INSUFFICIENT_STABLE_POINTS','세 뷰 이상에서 관측된 안정적인 점이 100개 미만입니다.')
    # An orthonormal display frame estimated from average camera up; this is not a detected floor or gravity.
    ups=np.array([-im.cam_from_world().rotation.matrix()[1,:] for im in model.images.values() if im.has_pose])
    up=ups.mean(axis=0)
    if np.linalg.norm(up)<1e-6: up=np.array([0.,-1.,0.])
    up/=np.linalg.norm(up)
    axis=np.array([1.,0.,0.]) if abs(up[0])<0.9 else np.array([0.,0.,1.])
    right=axis-up*np.dot(axis,up); right/=np.linalg.norm(right)
    forward=np.cross(right,up)
    rotation=np.vstack([right,up,forward])
    xyz=np.array([pt.xyz for pt in points]); center=np.median(xyz,axis=0)
    xyz=(xyz-center)@rotation.T
    # Trim isolated long-ray outliers only. Never fit wall/floor geometry to point bounds.
    distances=np.linalg.norm(xyz,axis=1)
    keep=distances<=np.percentile(distances,99)
    xyz=xyz[keep]; colors=np.array([pt.color for pt in points])[keep]/255.
    indices=np.linspace(0,len(xyz)-1,min(len(xyz),30000)).round().astype(int)
    xyz=xyz[indices]; colors=colors[indices]
    cloud=out/'sparse.json'
    atomic_json(cloud,{'positions':xyz.round(6).reshape(-1).tolist(),'colors':colors.round(5).reshape(-1).tolist()})
    diagnostics['displayTransform']={'rotation':rotation.tolist(),'center':center.tolist(),'source':'mean camera-up estimate; gravity and floor NOT measured','scale':'COLMAP arbitrary units'}
    diagnostics['exportedPoints']=len(xyz)
    scene=scene_base(manifest,'sfm')
    scene['visual']={'kind':'sparse','url':str(cloud),'pointCount':len(xyz)}
    scene['warnings']=['실제 촬영에서 계산한 희소 포인트 클라우드입니다. 메시·3DGS·실측 공간이 아닙니다.',
                       '절대 크기는 알 수 없습니다. 알려진 두 점 간 길이로 보정하세요.',
                       'Y축은 카메라 상방 평균으로 추정했습니다. 중력·바닥·벽은 검출하지 않았습니다. 설치 전 도면 또는 수동 벽 정의가 필요합니다.']
    if ratio<1:
        scene['warnings'].append(f'전체 {accepted_count}개 중 {best["registeredImages"]}개 카메라만 등록되어 일부 공간이 누락될 수 있습니다.')
    return scene


def execute(manifest, out):
    # Reusing native database/frames can silently mix different captures. Preserve the
    # first attempt's evidence; a retry is a new worker job with a fresh directory.
    if manifest.get('mode') in ('video', 'photos') and any((out/name).exists() for name in ('candidates', 'frames', 'database.db', 'models')):
        return {'status': 'FAILED', 'diagnostics': {'existingOutputPreserved': True},
                'error': {'stage': 'VALIDATING', 'code': 'OUTPUT_NOT_EMPTY',
                          'message': '이미 사용된 복원 출력 폴더입니다. 기존 결과를 보존합니다. 새 작업과 빈 출력 폴더로 다시 실행하세요.'}}
    diagnostics={'engine':'local-cpu-sfm', 'maxFrames':MAX_FRAMES, 'startedAt':time.time()}
    stage='VALIDATING'
    try:
        progress(out,stage,5,'입력 검증 중')
        mode=manifest.get('mode')
        if not manifest.get('jobId'):
            raise PipelineError('INVALID_MANIFEST','jobId가 필요합니다.')
        if mode=='measured-plan':
            stage='GENERATING_GEOMETRY'
            progress(out,stage,60,'제공 도면의 표기 치수로 벽 생성 중')
            scene=measured_plan(manifest)
            diagnostics.update({'engine':'manually-transcribed-plan','source':'IMG_4711.heic','units':'meters','genericPlanImport':False})
        elif mode in ('single-image','panorama'):
            raise PipelineError('NEEDS_ADDITIONAL_CAPTURE', '단일 시점에는 거리 복원을 위한 이동 시차가 없습니다. 서로 겹치는 이동 촬영 사진 3장 이상, 동영상 또는 실측 도면이 필요합니다.')
        elif mode in ('video','photos'):
            stage='EXTRACTING_FRAMES'; progress(out,stage,15,'프레임 추출·선명도·중복 검사 중')
            accepted=prepare_capture(manifest,out,diagnostics)
            try:
                import pycolmap  # noqa: F401
            except ImportError as exc:
                raise PipelineError('DEPENDENCY_MISSING','pycolmap이 없습니다. requirements.txt를 설치하세요.') from exc
            stage='ESTIMATING_CAMERAS'
            for substage, percent, timeout in [('features',35,120),('matching',50,120),('mapping',65,180)]:
                if substage=='mapping':stage='RECONSTRUCTING'
                progress(out,stage,percent,f'CPU SfM: {substage}')
                log=out/f'{substage}.log'
                try:
                    run_command([sys.executable,str(Path(__file__).resolve()),'--stage',substage,'--stage-dir',str(out),'--mode',mode],timeout,log)
                finally:
                    diagnostics.setdefault('stageLogs',{})[substage]=str(log)
                    if log.exists():diagnostics.setdefault('stderrSummary',{})[substage]=log.read_text(errors='replace')[-1800:]
            stage='OPTIMIZING'; progress(out,stage,90,'등록 품질 검증·포인트 클라우드 내보내기')
            scene=export_sparse(manifest,out,diagnostics,len(accepted))
        else:
            raise PipelineError('UNSUPPORTED_MODE',f'지원하지 않는 모드: {mode}')
        diagnostics['elapsedSeconds']=round(time.time()-diagnostics['startedAt'],3)
        result={'status':'READY','scene':scene,'diagnostics':diagnostics}
        progress(out,'READY',100,'완료')
    except Exception as exc:
        diagnostics['elapsedSeconds']=round(time.time()-diagnostics['startedAt'],3)
        result={'status':'FAILED','diagnostics':diagnostics,'error':{'stage':stage,'code':getattr(exc,'code','PIPELINE_ERROR'),'message':str(exc)}}
        progress(out,'FAILED',100,str(exc))
    atomic_json(out/'diagnostics.json',diagnostics)
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input');parser.add_argument('--output')
    parser.add_argument('--stage',choices=['features','matching','mapping']);parser.add_argument('--stage-dir');parser.add_argument('--mode')
    args=parser.parse_args()
    if args.stage:
        colmap_stage(args.stage,Path(args.stage_dir),args.mode);return
    if not args.input or not args.output:parser.error('--input and --output are required')
    try:
        manifest=json.loads(Path(args.input).read_text())
        out=Path(manifest['outputDir']).resolve()
        out.mkdir(parents=True,exist_ok=True)
        result=execute(manifest,out)
    except Exception as exc:
        result={'status':'FAILED','diagnostics':{},'error':{'stage':'VALIDATING','code':'INVALID_MANIFEST','message':str(exc)}}
    atomic_json(Path(args.output),result)
    print(json.dumps({'status':result['status'],'output':str(Path(args.output).resolve())}))


if __name__=='__main__':main()
