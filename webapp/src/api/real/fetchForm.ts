import { API_BASE_URL } from "@/api/config";
import { ApiError } from "@/api/real/fetchJson";

function tryExtractErrorMessage(bodyText?: string): string | undefined {
  if (!bodyText) return undefined;
  try {
    const parsed = JSON.parse(bodyText) as any;
    const msg = parsed?.error?.message;
    return typeof msg === "string" ? msg : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchForm<T>(
  path: string,
  init: RequestInit & {
    query?: Record<string, string | number | boolean | undefined>;
  },
): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  const query = init?.query;
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), init);

  if (!res.ok) {
    const text = await res.text().catch(() => undefined);
    const msg = tryExtractErrorMessage(text) ?? `Request failed: ${res.status}`;
    throw new ApiError(msg, { status: res.status, bodyText: text });
  }

  // 204 no-content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}





