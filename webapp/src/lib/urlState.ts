export function readString(sp: URLSearchParams, key: string) {
  const v = sp.get(key);
  return v && v.trim().length ? v : undefined;
}

export function readStringList(sp: URLSearchParams, key: string) {
  const raw = sp.get(key);
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

export function readNumber(sp: URLSearchParams, key: string) {
  const raw = sp.get(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function writeOrDelete(sp: URLSearchParams, key: string, value: string | undefined) {
  if (value === undefined || value.trim() === "") sp.delete(key);
  else sp.set(key, value);
}

export function writeListOrDelete(sp: URLSearchParams, key: string, value: string[] | undefined) {
  if (!value || value.length === 0) sp.delete(key);
  else sp.set(key, value.join(","));
}

export function parseMoneyToCents(raw: string | undefined) {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned.length) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}










