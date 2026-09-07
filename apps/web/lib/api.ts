import { uploadMimeType } from "@/lib/upload-types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (
    process.env.NEXT_PUBLIC_GALLERY_CLOUD === "1" &&
    path === "/api/assets" &&
    init?.body instanceof FormData
  ) {
    const form = init.body,
      galleryId = String(form.get("galleryId")),
      role = String(form.get("role"));
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (
      !files.length ||
      files.length > 20 ||
      files.reduce((total, file) => total + file.size, 0) > 200 * 1024 * 1024
    )
      throw new ApiError(
        "파일은 최대 20개, 합계 200MB까지 올릴 수 있습니다.",
        400,
      );
    const { upload } = await import("@vercel/blob/client");
    const assets = [];
    for (const original of files) {
      const type = uploadMimeType(original);
      const file = original.type === type
        ? original
        : new File([original], original.name, { type });
      const blob = await upload(`incoming/${crypto.randomUUID()}`, file, {
        access: "private",
        contentType: type,
        handleUploadUrl: "/api/assets/upload",
        clientPayload: JSON.stringify({ galleryId, role }),
        multipart: file.size > 5 * 1024 * 1024,
      });
      assets.push(
        await api("/api/assets/import", {
          method: "POST",
          body: JSON.stringify({
            galleryId,
            role,
            pathname: blob.pathname,
            name: file.name,
          }),
        }),
      );
    }
    return assets as T;
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    )
      window.location.assign(
        "/login?next=" + encodeURIComponent(window.location.pathname),
      );
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(
      payload.error || "요청을 완료하지 못했습니다.",
      response.status,
      payload.code,
    );
  }
  return response.json() as Promise<T>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
export function jobLabel(status: string) {
  return (
    (
      {
        UPLOAD: "업로드 준비",
        VALIDATING: "파일 확인",
        EXTRACTING_FRAMES: "프레임 추출",
        ESTIMATING_CAMERAS: "카메라 추정",
        RECONSTRUCTING: "공간 재구성",
        GENERATING_GEOMETRY: "도면 생성",
        OPTIMIZING: "최적화",
        READY: "완료",
        FAILED: "실패",
      } as Record<string, string>
    )[status] ?? status
  );
}
