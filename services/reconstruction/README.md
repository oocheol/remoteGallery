# Local reconstruction service

The measured-plan adapter and real sparse photogrammetry pipeline implement `docs/RECONSTRUCTION.md`. Both execute locally. Original files are read only; no media is uploaded to a service.

## Setup and run

Requirements: Python 3.11+, `ffmpeg`, `ffprobe`. macOS CPU verified with the pinned wheel versions:

```sh
uv venv services/reconstruction/.venv
uv pip install --python services/reconstruction/.venv/bin/python -r services/reconstruction/requirements.txt
services/reconstruction/.venv/bin/python services/reconstruction/pipeline.py --input input.json --output result.json
services/reconstruction/.venv/bin/python -m unittest discover -s services/reconstruction -v
```

Input is a trusted worker manifest, not a browser-supplied filesystem API:

```json
{
  "jobId": "job-example",
  "galleryId": "gallery-example",
  "mode": "video",
  "assets": [{"path": "/local/capture.mov", "name": "capture.mov", "mimeType": "video/quicktime"}],
  "outputDir": "/local/unique-job-output"
}
```

Output directory must be unique per job. Retrying a video/photo job in a directory with prior native artifacts returns `OUTPUT_NOT_EMPTY` before changing existing progress or diagnostic evidence; create a new job/output directory to retry. CLI returns a JSON manifest `{status,scene?,diagnostics,error?}`. Terminal failures are represented in the manifest; an exit code of zero means the manifest was written, not that the reconstruction succeeded. `progress.json` is atomically replaced at each stage. The worker must check final `status` and read error stage/code/message. Missing dependencies return `DEPENDENCY_MISSING`; insufficient or disconnected views return diagnostic failures.

Successful sparse `scene.visual.url` initially names an absolute `outputDir/sparse.json` file. The worker validates confinement and imports it into its private asset store before replacing the URL. JSON shape is `{positions:number[],colors:number[]}`, packed XYZ and RGB arrays, with colors in `[0,1]`. `diagnostics.previewPath` names a selected frame JPEG for the worker to import as a reference. Diagnostics also preserve frame selection, registration metrics, transforms, and bounded stderr summaries. Captures, frame derivatives, COLMAP database/models and logs stay in the job directory and should not be published in share snapshots.

## Modes and evidence

- `measured-plan`: fixed adapter for **IMG_4711.heic only**, manually transcribed from the supplied drawing. It does not inspect uploaded image pixels or parse arbitrary plans. No assets are required. The polygon uses labeled lengths, exact height 2.74m and partition length 2.40m. Its enclosed area is 50.925m². The 2.55m bottom gap is a non-hanging zone between labeled segments; it is not a measured door width. All walls flag `estimated:true` because their 0.10m thickness is estimated; labeled lengths/height and the uncertain entrance details are distinguished in warnings.
- `video`: FFprobe reads the first video stream and ignores audio/metadata. FFmpeg extracts at most 40 candidates (up to 3fps), including the timeline at regular cadence. OpenCV rejects blur below Laplacian variance 12 at a consistent bounded resolution and perceptual difference-hash distances ≤5 bits. Sequential matching uses an 8-frame overlap. This is real camera/point estimation, not synthetic room generation.
- `photos`: requires at least 3 perspective photos. Up to 40 evenly distributed input views are normalized, EXIF-oriented by OpenCV, quality-filtered and exhaustively matched. JPEG/PNG are supported by the installed OpenCV decoder. Unsupported image encodings produce decode diagnostics. Upload order supplies temporal order for sampling.
- `single-image` and `panorama`: explicit `NEEDS_ADDITIONAL_CAPTURE`. A single optical center does not supply translation baseline. No fictitious independent panorama camera centers are generated.

Native COLMAP stages run in separate bounded subprocesses: 120 seconds for feature extraction, 120 seconds for matching, 180 seconds for mapping (with the mapper itself capped at 150 seconds). CPU uses four threads, 1,280px images and 2,048 SIFT features. No GPU, dense meshing or 3D Gaussian Splat training is performed.

Acceptance requires ≥3 registered cameras, ≥50% registration, ≥100 points, mean reprojection error ≤3px, and ≥100 stable points observed by at least three cameras. The largest connected model is selected. Sparse positions are centered and rotated using average camera-up as an **orientation estimate**, never a detected gravity vector or floor. Absolute scale remains unknown; raw units are carried through until user calibration. Sparse scenes have no wall geometry and an empty floor polygon, because point bounds are not evidence of a room boundary. The renderer applies `calibration.scaleFactor` to the raw cloud.

## Verified API and source-video acceptance

The implementation was checked against installed PyCOLMAP 4.2.0 signatures and option objects, plus the [official PyCOLMAP API](https://colmap.github.io/pycolmap/pycolmap.html) and [COLMAP Python README](https://github.com/colmap/colmap/blob/main/python/README.md). It uses current `FeatureExtractionOptions`, `FeatureMatchingOptions`, `SequentialPairingOptions`, and `IncrementalPipelineOptions` APIs with CPU device selection.

On 2026-09-06, a real run against the supplied 20.435s, 1,225-frame, 1920×1080 `IMG_3415.mov` completed in 30.516 seconds: 40 candidates, 40 accepted, 40 registered cameras, 3,722 points in the best model, mean reprojection error 0.4781px and 3,567 stable exported points. This establishes sparse pipeline operation on this source, not metric accuracy or complete wall coverage. Generated evidence remains in ignored `work/video/`; the machine-readable non-media summary is `acceptance.json`.
