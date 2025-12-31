import { format, isValid, parseISO } from "date-fns";

const CURRENCY_KEY = "budget.currency";

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string) {
  const cached = currencyFormatterCache.get(currency);
  if (cached) return cached;
  const nf = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  });
  currencyFormatterCache.set(currency, nf);
  return nf;
}

export function getCurrency(): string {
  return localStorage.getItem(CURRENCY_KEY) ?? "USD";
}

export function setCurrency(currency: string) {
  localStorage.setItem(CURRENCY_KEY, currency);
}

export function formatCents(cents: number, opts?: { currency?: string }) {
  const currency = opts?.currency ?? getCurrency();
  return getCurrencyFormatter(currency).format(cents / 100);
}

export function formatMoney(cents: number, opts?: { currency?: string }) {
  return formatCents(cents, opts);
}

export function formatPercent01(v: number) {
  const nf = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
  return nf.format(v);
}

export function formatDateDisplay(ymd: string) {
  if (!ymd) return "";
  const parsed = parseISO(ymd);
  if (!isValid(parsed)) return ymd;
  return format(parsed, "MMM d, yyyy");
}

export function formatRange(from?: string, to?: string) {
  if (!from && !to) return "All time";
  if (from && to) return `${formatDateDisplay(from)} - ${formatDateDisplay(to)}`;
  if (from) return `From ${formatDateDisplay(from)}`;
  return `To ${formatDateDisplay(to!)}`;
}

export function formatYmdToShort(ymd: string) {
  return format(parseISO(ymd), "MMM d");
}

export function formatMonthKey(ym: string) {
  // ym = YYYY-MM
  return format(parseISO(`${ym}-01`), "MMM yyyy");
}
