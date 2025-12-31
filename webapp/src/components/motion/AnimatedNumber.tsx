import * as React from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { formatCents, getCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

export type AnimatedNumberProps = {
  value: number;
  format: (value: number) => string;
  className?: string;
  durationMs?: number;
  "aria-label"?: string;
};

export function AnimatedNumber({
  value,
  format,
  className,
  durationMs = 520,
  "aria-label": ariaLabel,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const spanRef = React.useRef<HTMLSpanElement | null>(null);
  const mountedRef = React.useRef(false);

  // Keep the DOM text in sync with the motion value without causing React re-renders.
  useMotionValueEvent(mv, "change", (latest) => {
    const el = spanRef.current;
    if (!el) return;
    if (!Number.isFinite(latest)) return;
    el.textContent = format(latest);
  });

  React.useEffect(() => {
    const el = spanRef.current;
    const next = Number.isFinite(value) ? value : 0;

    // First paint: set immediately (no count-up).
    if (!mountedRef.current || reduceMotion) {
      mountedRef.current = true;
      mv.set(next);
      if (el) el.textContent = format(next);
      return;
    }

    const controls = animate(mv, next, {
      duration: durationMs / 1000,
      ease: [0.16, 1, 0.3, 1], // no bounce, fast settle
    });
    return () => controls.stop();
  }, [durationMs, format, mv, reduceMotion, value]);

  return (
    <span
      ref={spanRef}
      className={cn("tabular-nums", className)}
      aria-label={ariaLabel}
    >
      {format(Number.isFinite(value) ? value : 0)}
    </span>
  );
}

export function AnimatedMoneyCents(props: {
  cents: number;
  currency?: string;
  className?: string;
  durationMs?: number;
  "aria-label"?: string;
}) {
  const currency = props.currency ?? getCurrency();
  const format = React.useCallback((v: number) => formatCents(Math.round(v), { currency }), [currency]);
  return (
    <AnimatedNumber
      value={props.cents}
      format={format}
      className={props.className}
      durationMs={props.durationMs}
      aria-label={props["aria-label"]}
    />
  );
}






