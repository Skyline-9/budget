import React from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import type { DashboardFilterState } from "@/components/dashboard/ActiveFilterChips";

function presetThisMonth() {
  const now = new Date();
  return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
}

function presetLastMonth() {
  const d = subMonths(new Date(), 1);
  return { from: format(startOfMonth(d), "yyyy-MM-dd"), to: format(endOfMonth(d), "yyyy-MM-dd") };
}

function presetYtd() {
  const now = new Date();
  return { from: format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
}

function labelForRange(from?: string, to?: string) {
  if (!from && !to) return "All time";
  const tm = presetThisMonth();
  const lm = presetLastMonth();
  const ytd = presetYtd();
  if (from === tm.from && to === tm.to) return "This month";
  if (from === lm.from && to === lm.to) return "Last month";
  if (from === ytd.from && to === ytd.to) return "YTD";
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  return `To ${to}`;
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: DashboardFilterState;
  onChange: (patch: Partial<DashboardFilterState>) => void;
}) {
  const baseline = presetThisMonth();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/15 p-2",
        "backdrop-blur-sm",
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <CalendarRange className="h-4 w-4" />
            <span>{labelForRange(filters.from, filters.to)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px]" align="start">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">Quick ranges</div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" size="sm" onClick={() => onChange(presetThisMonth())}>
                This month
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onChange(presetLastMonth())}>
                Last month
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onChange(presetYtd())}>
                YTD
              </Button>
            </div>

            <div className="pt-1">
              <div className="text-xs font-semibold text-muted-foreground">Custom</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) => onChange({ from: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) => onChange({ to: e.target.value || undefined })}
                  />
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => onChange({ from: undefined, to: undefined })}>
                  Clear dates
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

