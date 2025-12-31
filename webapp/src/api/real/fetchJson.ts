import { API_BASE_URL } from "@/api/config";

export class ApiError extends Error {
  status: number;
  bodyText?: string;

  constructor(message: string, opts: { status: number; bodyText?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.bodyText = opts.bodyText;
  }
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | boolean | undefined> },
): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  const query = init?.query;
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  // #region agent log
  const logDebug = (location: string, message: string, data: any) => {
    const entry = { timestamp: Date.now(), location, message, data, sessionId: "debug-session", hypothesisId: "H" };
    console.log("[DEBUG]", entry);
    fetch("http://127.0.0.1:7245/ingest/1b69f145-946a-486e-8f53-60b8c23f92e2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).catch(() => {});
  };
  logDebug("fetchJson.ts:32", "API call", { path, baseUrl: API_BASE_URL, fullUrl: url.toString() });
  // #endregion

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // #region agent log
  logDebug("fetchJson.ts:45", "API response", { status: res.ok, statusCode: res.status, url: url.toString() });
  // #endregion

  if (!res.ok) {
    const text = await res.text().catch(() => undefined);
    let message = `Request failed: ${res.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as any;
        // Backend error envelope: { error: { code, message, details? } }
        const serverMsg =
          parsed?.error?.message ??
          // FastAPI default HTTPException shape: { detail: ... }
          (typeof parsed?.detail === "string" ? parsed.detail : undefined);
        if (typeof serverMsg === "string" && serverMsg.trim()) {
          message = serverMsg;
        }
      } catch {
        // ignore parse errors; fall back to status message
      }
    }
    // #region agent log
    logDebug("fetchJson.ts:51", "API error", { status: res.status, text });
    // #endregion
    throw new ApiError(message, { status: res.status, bodyText: text });
  }

  // 204 no-content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}








