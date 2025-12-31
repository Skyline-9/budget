import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, Command, HelpCircle, Lightbulb, Receipt, Settings, Tags } from "lucide-react";
import { LogoMark } from "@/components/common/Logo";
import { SidebarNavItem } from "@/components/layout/SidebarNavItem";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/useMediaQuery";

const STORAGE_KEY = "budget.sidebar.collapsed";

function useLocalStorageBoolean(key: string, defaultValue: boolean) {
  const [v, setV] = React.useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return defaultValue;
      return raw === "true";
    } catch {
      return defaultValue;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, v ? "true" : "false");
    } catch {
      // ignore
    }
  }, [key, v]);

  return [v, setV] as const;
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded-lg border border-border/60 bg-background/40 px-2 py-0.5",
        "text-[11px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex shrink-0 items-center gap-1.5">
        {keys.map((k, idx) => (
          <Kbd key={`${k}:${idx}`}>{k}</Kbd>
        ))}
      </div>
    </div>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Speed up navigation and data entry. Global shortcuts work anywhere unless noted.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
            <div className="text-sm font-semibold tracking-tight">Global</div>
            <div className="mt-3 space-y-2">
              <ShortcutRow label="Focus global search" keys={["⌘K", "Ctrl K"]} />
              <ShortcutRow label="Focus search (when not typing)" keys={["/"]} />
              <ShortcutRow label="Add transaction (when not typing)" keys={["N"]} />
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
            <div className="text-sm font-semibold tracking-tight">Transactions</div>
            <div className="mt-3 space-y-2">
              <ShortcutRow label="Submit Quick Add" keys={["Enter"]} />
              <ShortcutRow label="Clear Quick Add" keys={["Esc"]} />
              <ShortcutRow label="Open focused table row" keys={["Enter", "Space"]} />
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/30 p-3">
            <div className="text-sm font-semibold tracking-tight">Categories</div>
            <div className="mt-3 space-y-2">
              <ShortcutRow label="Move focus between rows" keys={["↑", "↓"]} />
              <ShortcutRow label="Select focused row" keys={["Enter"]} />
              <ShortcutRow label="Toggle selection (focused row)" keys={["Space"]} />
              <ShortcutRow label="Range select" keys={["Shift", "Click"]} />
              <ShortcutRow label="Toggle selection (mouse)" keys={["⌘ Click", "Ctrl Click"]} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Sidebar() {
  const location = useLocation();
  const search = location.search ?? "";

  const mdUp = useMediaQuery("(min-width: 768px)");
  const [collapsedPref, setCollapsedPref] = useLocalStorageBoolean(STORAGE_KEY, false);
  const collapsed = mdUp ? collapsedPref : true; // keep the UI usable on narrow screens

  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-20 h-[100dvh] shrink-0",
          "border-r border-border/70 bg-background/40 backdrop-blur-xl",
          "transition-[width] duration-200",
          collapsed ? "w-[92px]" : "w-[240px]",
        )}
        aria-label="Sidebar"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className={cn(
              "flex h-[60px] items-center justify-between gap-2 border-b border-border/70",
              collapsed ? "px-3" : "px-4",
            )}
          >
            <Link
              to={{ pathname: "/dashboard", search }}
              className={cn(
                "group inline-flex min-w-0 items-center gap-3 rounded-2xl",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              )}
              aria-label="Go to Dashboard"
              title="Dashboard"
            >
              <LogoMark size={36} className="shrink-0" />
              {!collapsed ? (
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-tight">Budget</div>
                  <div className="truncate text-xs text-muted-foreground">Personal finance</div>
                </div>
              ) : null}
            </Link>

            {mdUp ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsedPref((v) => !v)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>

          <nav
            className={cn(
              "min-h-0 flex-1 overflow-auto py-3",
              "flex flex-col gap-1",
              collapsed ? "items-center px-2" : "px-3",
            )}
          >
            <SidebarNavItem
              to="/dashboard"
              label="Dashboard"
              icon={<BarChart3 className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
            <SidebarNavItem
              to="/insights"
              label="Insights"
              icon={<Lightbulb className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
            <SidebarNavItem
              to="/transactions"
              label="Transactions"
              icon={<Receipt className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
            <SidebarNavItem
              to="/categories"
              label="Categories"
              icon={<Tags className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
            <SidebarNavItem
              to="/help"
              label="Help"
              icon={<HelpCircle className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
            <SidebarNavItem
              to="/settings"
              label="Settings"
              icon={<Settings className="h-4 w-4" />}
              collapsed={collapsed}
              search={search}
            />
          </nav>

          <div
            className={cn(
              "shrink-0 border-t border-border/70 py-3",
              collapsed ? "px-2" : "px-3",
            )}
          >
            {collapsed ? (
              <div className="flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShortcutsOpen(true)}
                      aria-label="Keyboard shortcuts"
                      title="Keyboard shortcuts"
                      className="h-11 w-11"
                    >
                      <Command className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Keyboard shortcuts</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-background/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-muted-foreground">Shortcuts</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShortcutsOpen(true)}
                    className="h-7 px-2 text-xs"
                  >
                    View all
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  <ShortcutRow label="Search" keys={["⌘K", "Ctrl K"]} />
                  <ShortcutRow label="Search (quick)" keys={["/"]} />
                  <ShortcutRow label="Add transaction" keys={["N"]} />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}