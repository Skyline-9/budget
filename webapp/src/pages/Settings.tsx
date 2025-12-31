import React from "react";
import { Download, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE_URL, API_MODE } from "@/api/config";
import { fetchJson } from "@/api/real/fetchJson";
import type { ImportCashewResponse } from "@/api/real/importCashew";
import { importCashewCsv } from "@/api/real/importCashew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/providers/ThemeProvider";
import { getCurrency, setCurrency } from "@/lib/format";

type DriveStatus = {
  connected: boolean;
  mode: string;
  last_sync_at?: string | null;
  folder_id?: string | null;
  files: Array<{
    filename: string;
    file_id?: string | null;
    drive_md5?: string | null;
    drive_modified_time?: string | null;
    local_sha256?: string | null;
  }>;
};

type DriveSyncResponse = {
  mode: string;
  results: Array<{
    filename: string;
    action: string;
    status: "ok" | "skipped" | "conflict" | "error";
    message?: string | null;
    conflict_local_copy?: string | null;
  }>;
  last_sync_at?: string | null;
};

function openDownload(path: string) {
  const url = new URL(path, API_BASE_URL);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [currency, setCurrencyState] = React.useState(() => getCurrency());
  const location = useLocation();
  const qc = useQueryClient();

  const [driveStatus, setDriveStatus] = React.useState<DriveStatus | null>(null);
  const [driveLoading, setDriveLoading] = React.useState(false);
  const [driveWorking, setDriveWorking] = React.useState(false);
  const [driveLastResult, setDriveLastResult] = React.useState<DriveSyncResponse | null>(null);

  const [cashewFile, setCashewFile] = React.useState<File | null>(null);
  const [cashewSkipDuplicates, setCashewSkipDuplicates] = React.useState(true);
  const [cashewPreserveExtras, setCashewPreserveExtras] = React.useState(false);
  const [cashewWorking, setCashewWorking] = React.useState(false);
  const [cashewLastResult, setCashewLastResult] = React.useState<ImportCashewResponse | null>(null);

  const runCashewImport = React.useCallback(
    async (commit: boolean) => {
      if (API_MODE !== "real") {
        toast.message("Import requires real API mode (set VITE_API_MODE=real)");
        return;
      }
      if (!cashewFile) {
        toast.message("Pick a Cashew CSV file first");
        return;
      }

      setCashewWorking(true);
      try {
        const res = await importCashewCsv(cashewFile, {
          commit,
          skipDuplicates: cashewSkipDuplicates,
          preserveExtras: cashewPreserveExtras,
        });
        setCashewLastResult(res);

        const title = commit ? "Import completed" : "Dry run completed";
        toast.success(title, {
          description: `Transactions: ${res.transactions_created} (${res.transactions_skipped} skipped) · Categories: ${res.categories_created}`,
        });

        if (commit) {
          // Ensure the rest of the app reflects imported data.
          await qc.invalidateQueries({ queryKey: ["categories"] });
          await qc.invalidateQueries({ queryKey: ["transactions"] });
          await qc.invalidateQueries({ queryKey: ["dashboardSummary"] });
          await qc.invalidateQueries({ queryKey: ["dashboardCharts"] });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      } finally {
        setCashewWorking(false);
      }
    },
    [cashewFile, cashewPreserveExtras, cashewSkipDuplicates, qc],
  );

  const refreshDriveStatus = React.useCallback(async () => {
    if (API_MODE !== "real") return;
    setDriveLoading(true);
    try {
      const st = await fetchJson<DriveStatus>("/api/drive/status", { method: "GET" });
      setDriveStatus(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Drive status");
    } finally {
      setDriveLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (API_MODE === "real") refreshDriveStatus();
  }, [refreshDriveStatus]);

  React.useEffect(() => {
    const qs = new URLSearchParams(location.search);
    if (qs.get("drive") === "connected") {
      toast.success("Google Drive connected");
      refreshDriveStatus();
    }
  }, [location.search, refreshDriveStatus]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">Preferences & data</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Local-first by default. Switch to real API via env var when ready.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg">
          <div className="text-sm font-semibold tracking-tight">Appearance</div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-background/40">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">Theme</div>
                <div className="text-xs text-muted-foreground">Dark-first, with a clean light mode.</div>
              </div>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={() => toggleTheme()} />
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg">
          <div className="text-sm font-semibold tracking-tight">Currency</div>
          <div className="mt-3 text-xs text-muted-foreground">Scaffold only (formatting uses USD for now).</div>
          <div className="mt-4 space-y-1.5">
            <Label>Display currency</Label>
            <Select
              value={currency}
              onValueChange={(v) => {
                setCurrencyState(v);
                setCurrency(v);
                toast.success("Currency saved");
              }}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg xl:col-span-2">
          <div className="text-sm font-semibold tracking-tight">Data storage</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
              <div className="text-xs text-muted-foreground">API mode</div>
              <div className="mt-1 text-sm font-semibold tracking-tight">{API_MODE}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-3 md:col-span-2">
              <div className="text-xs text-muted-foreground">Connected to local API</div>
              <div className="mt-1 text-sm font-semibold tracking-tight">{API_BASE_URL}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (API_MODE !== "real") {
                  toast.message("Export requires real API mode (set VITE_API_MODE=real)");
                  return;
                }
                openDownload("/api/export/csv");
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (API_MODE !== "real") {
                  toast.message("Export requires real API mode (set VITE_API_MODE=real)");
                  return;
                }
                openDownload("/api/export/xlsx");
              }}
            >
              <Download className="h-4 w-4" />
              Export XLSX
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Import (Cashew CSV)</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Upload your Cashew transactions CSV export. Start with a dry run to preview what will be added.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={API_MODE !== "real" || cashewWorking || !cashewFile}
                onClick={() => runCashewImport(false)}
              >
                Dry run
              </Button>
              <Button
                variant="secondary"
                disabled={API_MODE !== "real" || cashewWorking || !cashewFile}
                onClick={() => runCashewImport(true)}
              >
                Import
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Cashew CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  setCashewFile(f);
                  setCashewLastResult(null);
                }}
              />
              <div className="text-xs text-muted-foreground">
                {API_MODE !== "real" ? "Import is disabled in mock mode." : cashewFile ? cashewFile.name : "No file selected."}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight">Skip duplicates</div>
                  <div className="text-xs text-muted-foreground">Best-effort de-dupe based on date/amount/category/title/note.</div>
                </div>
                <Switch checked={cashewSkipDuplicates} onCheckedChange={(v) => setCashewSkipDuplicates(v)} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight">Preserve extras</div>
                  <div className="text-xs text-muted-foreground">Keeps extra Cashew fields as `cashew_*` columns in transactions.</div>
                </div>
                <Switch checked={cashewPreserveExtras} onCheckedChange={(v) => setCashewPreserveExtras(v)} />
              </div>
            </div>
          </div>

          {cashewLastResult ? (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
              <div className="text-xs text-muted-foreground">
                Last result {cashewLastResult.commit ? "(committed)" : "(dry-run)"} · {cashewLastResult.filename}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-6">
                <div>
                  <div className="text-muted-foreground">Rows</div>
                  <div className="font-semibold">{cashewLastResult.total_rows}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Parsed</div>
                  <div className="font-semibold">{cashewLastResult.parsed_rows}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Invalid</div>
                  <div className="font-semibold">{cashewLastResult.invalid_rows}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Categories</div>
                  <div className="font-semibold">{cashewLastResult.categories_created}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Transactions</div>
                  <div className="font-semibold">{cashewLastResult.transactions_created}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Skipped</div>
                  <div className="font-semibold">{cashewLastResult.transactions_skipped}</div>
                </div>
              </div>

              {cashewLastResult.warnings?.length ? (
                <div className="mt-3 space-y-1 text-xs">
                  {cashewLastResult.warnings.map((w, idx) => (
                    <div key={idx} className="text-muted-foreground">
                      - {w}
                    </div>
                  ))}
                </div>
              ) : null}

              {cashewLastResult.errors?.length ? (
                <div className="mt-3 space-y-1 text-xs">
                  <div className="font-semibold">Row errors (first {cashewLastResult.errors.length})</div>
                  {cashewLastResult.errors.slice(0, 8).map((er) => (
                    <div key={`${er.row}:${er.message}`} className="text-muted-foreground">
                      Row {er.row}: {er.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/50 p-5 shadow-soft-lg xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Google Drive sync</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Connect Drive to sync the local CSV data folder.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={API_MODE !== "real" || driveWorking}
                onClick={async () => {
                  if (API_MODE !== "real") {
                    toast.message("Drive sync requires real API mode (set VITE_API_MODE=real)");
                    return;
                  }
                  setDriveWorking(true);
                  try {
                    const res = await fetchJson<{ url: string }>("/api/drive/auth/url", { method: "GET" });
                    // Prefer opening in a new tab; fall back to same-window navigation.
                    // This improves reliability inside embedded WKWebView (macOS app).
                    const w = window.open(res.url, "_blank", "noopener,noreferrer");
                    if (!w) {
                      window.location.assign(res.url);
                    }
                    toast.message("Opening Google OAuth…");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to start OAuth");
                  } finally {
                    setDriveWorking(false);
                  }
                }}
              >
                Connect Drive
              </Button>
              <Button
                variant="secondary"
                disabled={API_MODE !== "real" || driveWorking}
                onClick={async () => {
                  if (API_MODE !== "real") return;
                  setDriveWorking(true);
                  try {
                    await fetchJson("/api/drive/disconnect", { method: "POST" });
                    toast.success("Disconnected Drive");
                    setDriveLastResult(null);
                    await refreshDriveStatus();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to disconnect");
                  } finally {
                    setDriveWorking(false);
                  }
                }}
              >
                Disconnect
              </Button>
              <Button
                variant="secondary"
                disabled={API_MODE !== "real" || driveWorking}
                onClick={() => refreshDriveStatus()}
              >
                {driveLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
              <div className="text-xs text-muted-foreground">Connected</div>
              <div className="mt-1 text-sm font-semibold tracking-tight">
                {driveStatus ? String(driveStatus.connected) : "—"}
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
              <div className="text-xs text-muted-foreground">Mode</div>
              <div className="mt-1 text-sm font-semibold tracking-tight">{driveStatus?.mode ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/30 px-3 py-3 md:col-span-2">
              <div className="text-xs text-muted-foreground">Last sync</div>
              <div className="mt-1 text-sm font-semibold tracking-tight">
                {driveStatus?.last_sync_at ?? "—"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={API_MODE !== "real" || driveWorking}
              onClick={async () => {
                if (API_MODE !== "real") return;
                setDriveWorking(true);
                try {
                  const res = await fetchJson<DriveSyncResponse>("/api/drive/sync", { method: "POST" });
                  setDriveLastResult(res);
                  const conflicts = res.results.filter((r) => r.status === "conflict").length;
                  toast.success(conflicts ? `Sync completed (${conflicts} conflicts)` : "Sync completed");
                  await refreshDriveStatus();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Sync failed");
                } finally {
                  setDriveWorking(false);
                }
              }}
            >
              Smart sync
            </Button>
            <Button
              variant="secondary"
              disabled={API_MODE !== "real" || driveWorking}
              onClick={async () => {
                if (API_MODE !== "real") return;
                setDriveWorking(true);
                try {
                  const res = await fetchJson<DriveSyncResponse>("/api/drive/sync/push", { method: "POST" });
                  setDriveLastResult(res);
                  toast.success("Pushed to Drive");
                  await refreshDriveStatus();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Push failed");
                } finally {
                  setDriveWorking(false);
                }
              }}
            >
              Push
            </Button>
            <Button
              variant="secondary"
              disabled={API_MODE !== "real" || driveWorking}
              onClick={async () => {
                if (API_MODE !== "real") return;
                setDriveWorking(true);
                try {
                  const res = await fetchJson<DriveSyncResponse>("/api/drive/sync/pull", { method: "POST" });
                  setDriveLastResult(res);
                  toast.success("Pulled from Drive");
                  await refreshDriveStatus();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Pull failed");
                } finally {
                  setDriveWorking(false);
                }
              }}
            >
              Pull
            </Button>
          </div>

          {driveLastResult ? (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/30 px-3 py-3">
              <div className="text-xs text-muted-foreground">Last sync results</div>
              <div className="mt-2 space-y-1 text-xs">
                {driveLastResult.results.map((r) => (
                  <div key={`${r.filename}:${r.action}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.filename}</span>
                    <span className="text-muted-foreground">{r.action}</span>
                    <span
                      className={
                        r.status === "ok"
                          ? "text-income"
                          : r.status === "conflict"
                            ? "text-warning"
                            : r.status === "error"
                              ? "text-danger"
                              : "text-muted-foreground"
                      }
                    >
                      {r.status}
                    </span>
                    {r.conflict_local_copy ? (
                      <span className="text-muted-foreground">({r.conflict_local_copy})</span>
                    ) : null}
                    {r.message ? <span className="text-muted-foreground">- {r.message}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

