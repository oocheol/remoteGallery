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
