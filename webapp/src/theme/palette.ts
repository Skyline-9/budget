type CssVarName = `--${string}`;

function canReadDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function readCssVar(name: CssVarName): string | undefined {
  if (!canReadDom()) return undefined;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || undefined;
}

export function readCssList(name: CssVarName): string[] {
  const raw = readCssVar(name);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type GlowKind = "neutral" | "income" | "expense" | "accent" | "hero";

const DEFAULT_GLOW: Record<GlowKind, string> = {
  neutral: "56, 189, 248",
  income: "52, 211, 153",
  expense: "244, 114, 182",
  accent: "246, 40, 50",
  hero: "167, 139, 250",
};

export function getGlowRgbTriplet(kind: GlowKind): string {
  const key = `--glow-${kind}` as const;
  return readCssVar(key) ?? DEFAULT_GLOW[kind];
}

const DEFAULT_CHART_CATEGORICAL = [
  "#60a5fa",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#fbbf24",
  "#22d3ee",
  "#c084fc",
  "#f472b6",
  "#93c5fd",
  "#86efac",
] as const;

export function getChartCategoricalPalette(): string[] {
  const list = readCssList("--palette-chart-categorical");
  return list.length ? list : [...DEFAULT_CHART_CATEGORICAL];
}

const DEFAULT_CHART_TABLEAU = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
] as const;

export function getChartTableauPalette(): string[] {
  const list = readCssList("--palette-chart-tableau");
  return list.length ? list : [...DEFAULT_CHART_TABLEAU];
}

const DEFAULT_CATEGORY_COLORS = [
  "#ef4444",
  "#f97316",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
] as const;

export function getCategoryColorOptions(): string[] {
  const list = readCssList("--palette-category-colors");
  return list.length ? list : [...DEFAULT_CATEGORY_COLORS];
}
