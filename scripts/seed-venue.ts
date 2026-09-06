/** Import the user-provided originals through the same API used by the browser. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.GALLERY_BASE_URL || 'http://127.0.0.1:3000';
let cookie = '';
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(base + path, { ...init, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const result = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
await api('/api/session');
const existing = await api('/api/galleries');
const name = '와이아트갤러리';
let detail = existing.find((x: {name:string})=>x.name===name);
if (detail) {
  console.log(`Existing venue: ${base}/gallery/${detail.id}`);
  process.exit(0);
}
detail = await api('/api/galleries', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,address:'서울 중구 퇴계로27길 28 지하1층 3호',sourceUrl:'https://pcmap.place.naver.com/place/1316853068/home'}) });
const galleryId = detail.gallery.id;
async function upload(path:string, mime:string, role:string) {
 const form=new FormData(); form.set('galleryId',galleryId);form.set('role',role);
 form.append('files',new Blob([await readFile(path)],{type:mime}),path.split('/').at(-1)!);
 return api('/api/assets',{method:'POST',body:form});
}
const plan = await upload(process.env.PLAN_PATH || resolve('IMG_4711.heic'),'image/heic','reference');
await upload(process.env.VIDEO_PATH || resolve('IMG_3415.mov'),'video/quicktime','capture');
const job = await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({galleryId,mode:'measured-plan',assetIds:plan.map((a:{id:string})=>a.id)})});
const output={galleryId,jobId:job.id,url:`${base}/gallery/${galleryId}`};
await mkdir(resolve('.gallery-twin'),{recursive:true});
await writeFile(resolve('.gallery-twin/seed.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
