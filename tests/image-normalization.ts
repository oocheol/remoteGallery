import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { saveUpload, validateUpload } from '../apps/web/lib/server/storage';
const directory=await mkdtemp(join(tmpdir(),'gallery-image-test-'));
process.env.GALLERY_STORAGE_DIR=directory;
try {
  const input=await sharp({create:{width:200,height:300,channels:3,background:'#202030'}}).withMetadata({exif:{IFD0:{ImageDescription:'private test metadata'}}}).jpeg().toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const file=new File([input],'original.jpg',{type:'image/jpeg'});
  await validateUpload(file,'artwork');
  const result=await saveUpload('fixture-gallery',file,'artwork');
  const metadata=await sharp(await readFile(result.path)).metadata();
  assert.equal(metadata.width,200);assert.equal(metadata.height,300);assert.equal(metadata.exif,undefined);assert.equal(metadata.xmp,undefined);
  await assert.rejects(()=>validateUpload(new File(['not an image'],'fake.jpg',{type:'image/jpeg'}),'artwork'));
  console.log('PASS: JPEG normalization preserves dimensions, strips private EXIF/XMP, rejects spoofed signature');
} finally {await rm(directory,{recursive:true,force:true});}
