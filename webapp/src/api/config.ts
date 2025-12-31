export type ApiMode = "mock" | "real";

// Handle both dev and packaged Mac app scenarios:
// - Dev: VITE_API_BASE_URL="http://127.0.0.1:8123"
// - Packaged Mac app: VITE_API_BASE_URL="" -> use empty string, let fetchJson/fetchForm handle it
function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  // If env is undefined, null, or empty string, use window.location.origin
  if (!env || env.trim() === "") {
    return window.location.origin;
  }
  return env.replace(/\/$/, "");
}

export const API_BASE_URL = getApiBaseUrl();

export const API_MODE: ApiMode =
  (import.meta.env.VITE_API_MODE === "real" ? "real" : "mock") satisfies ApiMode;








