export function fmtPrice(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function fmtSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function fmtBps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${Math.round(value)} bps`;
}

export function fmtCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function fmtTimeAgo(iso: string | number | null | undefined): string {
  if (iso == null) return "—";
  const ts = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function fmtClock(iso: string | number | null | undefined): string {
  if (iso == null) return "—";
  const ts = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(ts))
    .concat(" UTC");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(ts)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}

export const VERDICT_LABEL: Record<string, string> = {
  FAIR: "Fair value",
  OVERPRICED: "Overpriced",
  DISCOUNT: "Discount",
  DISPERSION: "Dislocated",
  ILLIQUID: "Illiquid",
  RELATIVE: "Relative only",
  NO_DATA: "No data",
};

export function verdictTone(verdict: string): {
  text: string;
  border: string;
  bg: string;
  dot: string;
} {
  switch (verdict) {
    case "OVERPRICED":
      return {
        text: "text-over",
        border: "border-over/40",
        bg: "bg-over/10",
        dot: "bg-over",
      };
    case "DISCOUNT":
      return {
        text: "text-under",
        border: "border-under/40",
        bg: "bg-under/10",
        dot: "bg-under",
      };
    case "DISPERSION":
      return {
        text: "text-dispersion",
        border: "border-dispersion/40",
        bg: "bg-dispersion/10",
        dot: "bg-dispersion",
      };
    case "ILLIQUID":
      return {
        text: "text-illiquid",
        border: "border-illiquid/40",
        bg: "bg-illiquid/10",
        dot: "bg-illiquid",
      };
    case "RELATIVE":
      return {
        text: "text-relative",
        border: "border-relative/40",
        bg: "bg-relative/10",
        dot: "bg-relative",
      };
    case "NO_DATA":
      return {
        text: "text-dim",
        border: "border-line",
        bg: "bg-white/[0.02]",
        dot: "bg-dim",
      };
    default:
      return {
        text: "text-fair",
        border: "border-line-strong",
        bg: "bg-white/[0.04]",
        dot: "bg-fair",
      };
  }
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};
