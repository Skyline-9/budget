import React from "react";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

export type LegendItem = {
  name: string;
  valueCents: number;
  percent: number; // 0..1
  color: string;
  categoryId?: string;
  disabled?: boolean;
};

function pct(v: number) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(v);
}

export function ChartLegendList({
  items,
  onSelectCategory,
}: {
  items: LegendItem[];
  onSelectCategory: (categoryId: string) => void;
}) {
  const maxValueCents = React.useMemo(
    () => items.reduce((acc, it) => Math.max(acc, it.valueCents), 0) || 1,
    [items],
  );

  return (
    <div className="space-y-1">
      {items.map((it) => {
        const canClick = Boolean(it.categoryId) && !it.disabled;
        const w = Math.max(0, Math.min(1, it.valueCents / maxValueCents)) * 100;
        return (
          <button
            key={it.name}
            type="button"
            className={cn(
              "w-full rounded-2xl border border-transparent px-3 py-2 text-left",
              "transition-colors",
              canClick ? "hover:bg-accent/40 hover:border-border/50" : "opacity-70 cursor-default",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            disabled={!canClick}
            onClick={() => {
              if (!it.categoryId) return;
              onSelectCategory(it.categoryId);
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-[5px]"
                style={{ backgroundColor: it.color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate text-sm font-semibold tracking-tight">{it.name}</div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCents(it.valueCents)}
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${w}%`,
                        backgroundColor: it.color,
                        opacity: canClick ? 0.85 : 0.55,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {pct(it.percent)}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}


