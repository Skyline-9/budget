import React from "react";
import { cn } from "@/lib/cn";
import dotsOverlayUrl from "@/assets/dashboard/dots-overlay.svg";

export type MetricDelta = {
  label: string; // e.g. "vs prior month"
  valueText: string; // e.g. "+$120"
  subText?: string; // e.g. "(+3.2%)"
  intent: "positive" | "negative" | "neutral";
};

function useAutoScaleText({
  minFontSizePx = 14,
  deps = [],
}: {
  minFontSizePx?: number;
  deps?: React.DependencyList;
}) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const maxFontSizePxRef = React.useRef<number | null>(null);
  const appliedFontSizePxRef = React.useRef<number | null>(null);
  const [fontSizePx, setFontSizePx] = React.useState<number | null>(null);

  const setApplied = React.useCallback((next: number | null) => {
    if (appliedFontSizePxRef.current === next) return;
    appliedFontSizePxRef.current = next;
    setFontSizePx(next);
  }, []);

  const recompute = React.useCallback(() => {
    const el = textRef.current;
    const container = el?.parentElement;
    if (!el || !container) return;

    // Avoid divisions by zero and noisy recomputes on hidden elements.
    const availableWidthPx = container.clientWidth;
    if (!availableWidthPx) return;

    // Ensure we have the baseline (unscaled) font size captured.
    const computedFontSizePx = Number.parseFloat(window.getComputedStyle(el).fontSize || "0");
    if (!computedFontSizePx) return;
    if (maxFontSizePxRef.current == null) maxFontSizePxRef.current = computedFontSizePx;

    const maxFontSizePx = maxFontSizePxRef.current;
    const renderedTextWidthPx = el.getBoundingClientRect().width;
    if (!renderedTextWidthPx) return;

    // Predict whether the text would fit at the baseline (max) font size.
    const predictedWidthAtMaxPx = renderedTextWidthPx * (maxFontSizePx / computedFontSizePx);

    // Small buffer to avoid jitter from sub-pixel rounding.
    const jitterBufferPx = 1;

    if (predictedWidthAtMaxPx <= availableWidthPx + jitterBufferPx) {
      // Fits at max size: use the CSS-defined font size (no inline override).
      setApplied(null);
      return;
    }

    // Scale down proportionally to fit.
    const nextFontSizePx = Math.floor((availableWidthPx * computedFontSizePx) / renderedTextWidthPx);
    const clampedPx = Math.max(minFontSizePx, Math.min(maxFontSizePx, nextFontSizePx));
    setApplied(clampedPx);
  }, [minFontSizePx, setApplied]);

  React.useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recompute, ...deps]);

  React.useLayoutEffect(() => {
    const el = textRef.current;
    const container = el?.parentElement;
    if (!container) return;

    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recompute]);

  return {
    ref: textRef,
    style: fontSizePx != null ? ({ fontSize: `${fontSizePx}px` } as const) : undefined,
  };
}

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const width = 108;
  const height = 28;
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      className={cn("h-7 w-[108px]", className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.75" points={points.join(" ")} />
    </svg>
  );
}

export function MetricCard({
  title,
  value,
  valueSubtle,
  delta,
  sparkline,
  tone = "neutral",
  variant = "default",
  emoji,
  icon,
  showDots = false,
  className,
}: {
  title: string;
  value: React.ReactNode;
  valueSubtle?: React.ReactNode;
  delta?: MetricDelta;
  sparkline?: number[];
  tone?: "income" | "expense" | "neutral" | "accent" | "hero" | "warm";
  variant?: "default" | "hero";
  emoji?: string;
  icon?: React.ReactNode;
  showDots?: boolean;
  className?: string;
}) {
  const valueText = useAutoScaleText({ deps: [value] });

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/35",
        variant === "hero" ? "corner-glow-hero" : "corner-glow",
        tone === "income" && "tint-income",
        tone === "expense" && "tint-expense",
        tone === "accent" && "tint-accent",
        tone === "neutral" && "tint-neutral",
        tone === "hero" && "tint-hero",
        tone === "warm" && "tint-warm",
        variant === "hero" ? "p-6 md:p-7 shadow-lift hover:-translate-y-1" : "p-5 hover:-translate-y-0.5",
        "transition-transform duration-150 ease-out",
        "hover:bg-card/45 hover:shadow-lift",
        className,
      )}
    >
      {showDots && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10] dark:opacity-[0.08]">
          <img src={dotsOverlayUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="relative z-10 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div
            className={cn(
              "flex items-center gap-2",
              "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
              variant === "hero" && "text-xs text-foreground/70",
            )}
          >
            {icon ? (
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-xl ring-1",
                  "bg-background/40 ring-border/60",
                  tone === "income" && "bg-income/10 ring-income/30 text-income",
                  tone === "expense" && "bg-expense/10 ring-expense/30 text-expense",
                  tone === "accent" && "bg-primary/10 ring-primary/30 text-primary",
                  tone === "hero" && "bg-hero/10 ring-hero/30 text-hero",
                  tone === "warm" && "bg-warm/10 ring-warm/30 text-warm",
                )}
              >
                {icon}
              </span>
            ) : emoji ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-xl bg-background/40 text-[13px] ring-1 ring-border/60">
                {emoji}
              </span>
            ) : null}
            <span>{title}</span>
          </div>
          <div
            className={cn(
              "mt-2 font-semibold tracking-tight tabular-nums",
              variant === "hero" ? "text-4xl sm:text-5xl" : "text-3xl",
            )}
          >
            <span
              ref={valueText.ref}
              className="inline-block whitespace-nowrap"
              style={valueText.style}
            >
              {value}
            </span>
          </div>
          {valueSubtle ? (
            <div className={cn("mt-1 text-xs text-foreground/60", variant === "hero" && "text-sm text-foreground/70")}>
              {valueSubtle}
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            // Push the sparkline into the right padding a bit so it doesn't crowd the value text
            // on tighter card widths, but keep a small buffer so it doesn't touch the card edge.
            "-mr-3 flex shrink-0 self-center flex-col items-end gap-2",
            tone === "income" && "text-income",
            tone === "expense" && "text-expense",
            tone === "accent" && "text-primary",
            tone === "hero" && "text-hero",
          )}
        >
          {sparkline?.length ? <Sparkline values={sparkline} className="opacity-80" /> : null}
        </div>
      </div>

      {delta ? (
        <div className={cn("mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", variant === "hero" && "text-sm")}>
          <span className="text-foreground/70">{delta.label}</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              delta.intent === "positive" && "text-income",
              delta.intent === "negative" && "text-danger",
              delta.intent === "neutral" && "text-foreground/70",
            )}
          >
            {delta.valueText}
          </span>
          {delta.subText ? (
            <span className="text-foreground/60 tabular-nums">{delta.subText}</span>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 text-xs text-foreground/50">—</div>
      )}
    </div>
  );
}

