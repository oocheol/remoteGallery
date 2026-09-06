# Reconstruction contracts and evidence

## Multiple perspective photos
Validate MIME, limits, EXIF orientation → normalize bounded derivatives → feature extraction/matching → pycolmap incremental SfM → registered-camera/point/error metrics → bounded point cloud visual. Require at least three views with translation and overlap; low-quality or disconnected reconstruction returns FAILED with reason. Unknown absolute scale remains uncalibrated. Floor/wall inference must include confidence and user confirmation; raw point bounds are not a room.

## Video
FFprobe validates → sample at bounded cadence (never all 1,225 source frames) → reject low Laplacian sharpness and near-duplicate visual hashes → preserve temporal coverage → sequential matching / SfM → sparse browser asset. Include candidate, accepted, rejected counts and registration diagnostics. Timeout each stage and preserve stderr summary. Apple extra audio/metadata streams are ignored. Original content stays local.

## Measured plan supplied for this venue
Use labeled metric segments, not pixel scaling. Polygon XZ vertices: (0,0), (3.85,0), (3.85,1.70), (5.90,1.70), (5.90,3.45), (6.95,3.45), (6.95,8.35), (0,8.35). Height 2.74m. Along bottom leave entrance/non-hanging gap between x=2.80 and x=5.35, with right 1.60m segment. Partition from (2.80,8.35) to (2.80,5.95), 2.40m. Plan labels are evidence; exact doorway size and wall thickness are not labeled and remain estimates. Expose plan provenance and editable coordinates. This is a measured proxy, not automatic photogrammetry or GS.

## 360
Detect equirectangular declaration, keep separate camera model. A panorama at a single optical center provides no translational baseline. MVP accepts as reference only or returns explicit unsupported reconstruction; future cubemap/rig-aware SfM must avoid independent fictitious camera centers.

## Single image
Approximate reconstruction only; never measured geometry unless real dimensions/plan are supplied. Current MVP reports need for more overlapping views or a measured plan. Future depth/segmentation/vanishing-point model is a separate adapter with model provenance and confidence.

## Future LiDAR / floorplan
LiDAR meters and sensor transforms retain calibration provenance. General PDF/CAD import is future; this supplied image is manually transcribed into a reviewed metric fixture. No claim of generic OCR/CAD implementation.

## Manifest protocol
Python CLI: python services/reconstruction/pipeline.py --input INPUT_JSON --output OUTPUT_JSON. Input: {jobId, galleryId, mode:'video'|'photos'|'measured-plan'|'single-image'|'panorama', assets:[{path,name,mimeType}], outputDir}. Output: {status:'READY'|'FAILED', scene?:Scene, diagnostics:object, error?:{stage,code,message}}. Intermediate status at outputDir/progress.json written atomically. Worker imports generated local derivatives as authorized asset IDs/URLs. Implementations must reject escaping paths at API boundary and never accept arbitrary paths from browser.

The worker supports CPU reconstruction locally and isolates a future GPU backend. Sparse successful output is labeled sparse/uncalibrated; no random points, synthetic room or timer-only success. If pycolmap is unavailable, return DEPENDENCY_MISSING. Training splats remains a documented extension.
