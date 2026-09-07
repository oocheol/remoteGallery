/**
 * Returns the MIME type used by every upload path.  Some browsers omit the
 * type for TIFF and HEIC files, while others report TIFF as image/x-tiff.
 */
export function uploadMimeType(file: { type: string; name: string }): string {
  const type = file.type.trim().toLowerCase();
  if (type === "image/tiff" || type === "image/x-tiff") return "image/tiff";
  if (!type || type === "application/octet-stream") {
    if (/\.hei[cf]$/i.test(file.name)) return "image/heic";
    if (/\.tiff?$/i.test(file.name)) return "image/tiff";
  }
  return type || "application/octet-stream";
}
