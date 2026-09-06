"""Run: .venv/bin/python -m unittest discover -s services/reconstruction -v"""
import json
from pathlib import Path
import tempfile
import unittest

from pipeline import POLYGON, atomic_json, execute, measured_plan, select_frames


class PlanTests(unittest.TestCase):
    def test_metric_plan_closes_and_retains_non_hanging_gap(self):
        scene=measured_plan({'jobId':'j1','galleryId':'g1'})
        polygon=scene['floor']['polygon']
        area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(polygon,polygon[1:]+polygon[:1])))/2
        self.assertAlmostEqual(area,50.925)
        self.assertEqual(scene['galleryId'],'g1')
        self.assertEqual(scene['calibration']['status'],'plan')
        self.assertEqual(scene['visual']['kind'],'none')
        self.assertEqual(len(scene['walls']),10)
        self.assertTrue(all(w['height']==2.74 for w in scene['walls']))
        # No installable wall spans the entrance center; partition is 2.40m.
        for wall in scene['walls']:
            if wall['start'][1]==wall['end'][1]==8.35:
                self.assertFalse(min(wall['start'][0],wall['end'][0])<4<max(wall['start'][0],wall['end'][0]))
        partition=scene['walls'][-1]
        self.assertAlmostEqual(abs(partition['start'][1]-partition['end'][1]),2.40)
        # All perimeter lengths sum to the closed perimeter minus the entrance gap.
        import math
        perimeter=sum(math.dist(a,b) for a,b in zip(polygon,polygon[1:]+polygon[:1]))
        installed=sum(math.dist(w['start'],w['end']) for w in scene['walls'][:-1])
        self.assertAlmostEqual(perimeter-installed,2.55)

    def test_unsupported_single_view_is_honest_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            for mode in ['single-image','panorama']:
                result=execute({'jobId':'test','mode':mode},Path(temp))
                self.assertEqual(result['status'],'FAILED')
                self.assertEqual(result['error']['code'],'NEEDS_ADDITIONAL_CAPTURE')
                self.assertNotIn('scene',result)
                self.assertEqual(json.loads((Path(temp)/'progress.json').read_text())['status'],'FAILED')

    def test_retry_requires_fresh_directory_and_preserves_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)
            first=execute({'jobId':'test','mode':'photos','assets':[]},output)
            self.assertEqual(first['error']['code'],'INSUFFICIENT_VIEWS')
            evidence=(output/'diagnostics.json').read_bytes()
            progress=(output/'progress.json').read_bytes()
            second=execute({'jobId':'test','mode':'photos','assets':[]},output)
            self.assertEqual(second['error']['code'],'OUTPUT_NOT_EMPTY')
            self.assertEqual((output/'diagnostics.json').read_bytes(),evidence)
            self.assertEqual((output/'progress.json').read_bytes(),progress)

    def test_atomic_json_has_no_partial_or_temp_output(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'result.json'
            atomic_json(target,{'step':1})
            atomic_json(target,{'step':2})
            self.assertEqual(json.loads(target.read_text()),{'step':2})
            self.assertEqual(list(Path(temp).iterdir()),[target])


class FrameTests(unittest.TestCase):
    def test_quality_and_duplicates_rejected(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)
            rng=np.random.default_rng(18)
            image=rng.integers(0,256,(480,640,3),dtype=np.uint8)
            images=[image,image.copy(),np.full_like(image,128),rng.integers(0,256,image.shape,dtype=np.uint8)]
            candidates=[]
            for i,img in enumerate(images):
                path=base/f'{i}.png';cv2.imwrite(str(path),img);candidates.append(path)
            accepted,stats=select_frames(candidates,base/'accepted')
            self.assertEqual(len(accepted),2)
            self.assertEqual(stats['frames'][1]['rejected'],'near_duplicate')
            self.assertEqual(stats['frames'][2]['rejected'],'blur')
            self.assertEqual([x.name for x in accepted],['frame_0000.jpg','frame_0003.jpg'])

    def test_sampling_retains_first_and_last_views(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);candidates=[];rng=np.random.default_rng(2)
            for i in range(10):
                path=base/f'{i:02d}.png';cv2.imwrite(str(path),rng.integers(0,256,(180,240,3),dtype=np.uint8));candidates.append(path)
            _,stats=select_frames(candidates,base/'accepted',max_frames=4)
            self.assertEqual(stats['candidates'],4)
            self.assertEqual(stats['frames'][0]['source'],'00.png')
            self.assertEqual(stats['frames'][-1]['source'],'09.png')


if __name__=='__main__':unittest.main()
