import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/auth';
import { ApiError, apiError, requiredString } from '@/lib/server/http';
import { createAsset } from '@/lib/server/store';
import { saveUpload, validateUpload } from '@/lib/server/storage';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    await requireOwner(request); const form = await request.formData(); const galleryId = requiredString(form.get('galleryId'), 'galleryId'); const role = requiredString(form.get('role'), 'role'); const files = form.getAll('files').filter((part): part is File => part instanceof File);
    if (!files.length || files.length > 20) throw new ApiError(400, 'INVALID_UPLOAD', 'Upload between one and twenty files');
    const total = files.reduce((sum, file) => sum + file.size, 0); if (total > 200 * 1024 * 1024) throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'Total upload exceeds 200 MB');
    const saved = [];
    for (const file of files) { await validateUpload(file, role); const record = await saveUpload(galleryId, file, role); saved.push(await createAsset({ id: record.id, gallery_id: galleryId, name: record.name, mime_type: record.mimeType, size_bytes: record.size, role: role as 'capture' | 'artwork' | 'reference', storage_path: record.path, public_derivative: role === 'artwork' })); }
    return NextResponse.json(saved, { status: 201 });
  } catch (error) { return apiError(error); }
}
