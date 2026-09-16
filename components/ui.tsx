import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIDENCE_LABEL, VERDICT_LABEL, verdictTone } from "@/lib/format";

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-elevated/80 backdrop-blur-[2px] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-lg font-medium tracking-tight text-fg">{title}</h2>
        {hint ? <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function VerdictBadge({
  verdict,
  confidence,
  size = "md",
}: {
  verdict: string;
  confidence?: string;
  size?: "sm" | "md";
}) {
  const tone = verdictTone(verdict);
  const label = VERDICT_LABEL[verdict] ?? verdict;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 ${
        size === "sm" ? "py-0.5 text-[11px]" : "py-1 text-xs"
      } font-medium tracking-wide ${tone.border} ${tone.bg} ${tone.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {label}
      {confidence ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
          {CONFIDENCE_LABEL[confidence] ?? confidence}
        </span>
      ) : null}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  mono = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
  mono?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-under"
      : tone === "negative"
        ? "text-over"
        : tone === "muted"
          ? "text-muted"
          : "text-fg";
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">{label}</div>
      <div
        className={`mt-1 text-lg ${mono ? "font-mono tabular" : ""} tracking-tight ${toneClass}`}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-dim">{hint}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
  title,
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "warn" | "danger" | "ok";
  title?: string;
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/40 bg-accent/10 text-accent"
      : tone === "warn"
        ? "border-dispersion/40 bg-dispersion/10 text-dispersion"
        : tone === "danger"
          ? "border-over/40 bg-over/10 text-over"
          : tone === "ok"
            ? "border-under/40 bg-under/10 text-under"
            : "border-line bg-white/[0.03] text-muted";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-dim">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent"
    >
      {children}
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/[0.01] px-6 py-10 text-center">
      <div className="text-sm font-medium text-fg">{title}</div>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg shimmer" />
      ))}
    </div>
  );
}
