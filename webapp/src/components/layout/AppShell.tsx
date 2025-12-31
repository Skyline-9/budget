import React from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { TransactionDialog } from "@/components/transactions/TransactionDialog";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const isDashboard = location.pathname === "/dashboard";
  const isCategories = location.pathname === "/categories";
  const isInsights = location.pathname === "/insights";
  const isHelp = location.pathname === "/help";

  const openAddTransaction = React.useCallback(() => {
    setAddOpen(true);
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable);

      // Cmd/Ctrl+K focuses global search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // / focuses search (if not typing)
      if (!isTypingTarget && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // N opens add transaction, but avoid hijacking typing
      if (!isTypingTarget && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openAddTransaction();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAddTransaction]);

  const onGlobalSearchSubmit = React.useCallback(
    (q: string) => {
      const next = new URLSearchParams(searchParams);
      if (q) next.set("q", q);
      else next.delete("q");

      // Categories search is page-local.
      if (isCategories || isInsights) {
        setSearchParams(next, { replace: true });
        return;
      }

      // Global search is transaction-centric; if user isn't on /transactions, deep-link there.
      if (location.pathname !== "/transactions") {
        navigate({ pathname: "/transactions", search: next.toString() });
        return;
      }
      setSearchParams(next, { replace: true });
    },
    [isCategories, location.pathname, navigate, searchParams, setSearchParams],
  );

  const onChangeDateRange = React.useCallback(
    (range: { from?: string; to?: string }) => {
      const next = new URLSearchParams(searchParams);
      if (range.from) next.set("from", range.from);
      else next.delete("from");
      if (range.to) next.set("to", range.to);
      else next.delete("to");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="min-h-screen bg-background surface-gradient">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {!isHelp && (
            <Topbar
              searchRef={searchRef}
              query={searchParams.get("q") ?? ""}
              from={searchParams.get("from") ?? undefined}
              to={searchParams.get("to") ?? undefined}
              onSubmitSearch={onGlobalSearchSubmit}
              onChangeDateRange={onChangeDateRange}
              onAddTransaction={openAddTransaction}
              searchPlaceholder={isCategories ? "Search categories…" : "Search merchant or notes…"}
              searchAriaLabel={isCategories ? "Search categories (Cmd/Ctrl+K)" : "Global search (Cmd/Ctrl+K)"}
              addButtonVariant={isCategories ? "secondary" : "default"}
              showDateRange={!isDashboard}
              showAddButton={!isDashboard}
            />
          )}
          <main className="min-w-0 flex-1 px-5 pb-8 pt-4">
            <Outlet context={{ openAddTransaction }} />
          </main>
        </div>
      </div>

      <TransactionDialog open={addOpen} onOpenChange={setAddOpen} mode="create" />
    </div>
  );
}

