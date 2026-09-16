import type { ReactNode } from "react";

export interface ChartSeries {
  label: string;
  color: string;
  points: { date: string; value: number }[];
  dash?: boolean;
}

const W = 1000;
const H = 260;
const PAD = { top: 14, right: 14, bottom: 26, left: 52 };

/**
 * Static SVG chart — no client JS, no chart library.
 *
 * Weekend days are shaded because that is where the story lives: with the
 * underlying market closed, the reference freezes and token prices drift.
 * The shading makes the product's core finding visible at a glance.
 */
export function SignalChart({
  series,
  weekendDates,
  unit = "bps",
  height,
}: {
  series: ChartSeries[];
  weekendDates: string[];
  unit?: "bps" | "pct";
  height?: number;
}) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-dim">
        No history returned for this asset yet.
      </div>
    );
  }

  const dates = Array.from(new Set(allPoints.map((p) => p.date))).sort();
  const first = Date.parse(`${dates[0]}T00:00:00Z`);
  const last = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`);
  const span = Math.max(1, last - first);
  const dayMs = 86_400_000;

  const maxAbs = Math.max(...allPoints.map((p) => Math.abs(p.value)), unit === "bps" ? 20 : 1);
  const yMax = maxAbs * 1.15;

  const x = (date: string) =>
    PAD.left + ((Date.parse(`${date}T00:00:00Z`) - first) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - (value + yMax) / (2 * yMax)) * (H - PAD.top - PAD.bottom);

  const tick = (value: number) =>
    unit === "bps" ? `${Math.round(value)}` : `${value.toFixed(1)}%`;

  const bands = weekendDates
    .map((date) => {
      const start = x(date);
      const width = Math.max(1.2, (dayMs / span) * (W - PAD.left - PAD.right));
      return { start, width };
    })
    .filter((b) => b.start >= PAD.left - 2 && b.start <= W - PAD.right);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        style={height ? { height } : undefined}
        role="img"
        aria-label="Tokenised wrapper dislocation history"
      >
        {bands.map((b, i) => (
          <rect
            key={i}
            x={b.start}
            y={PAD.top}
            width={b.width}
            height={H - PAD.top - PAD.bottom}
            fill="rgba(255,255,255,0.035)"
          />
        ))}

        {[-yMax, -yMax / 2, 0, yMax / 2, yMax].map((value, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke={value === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.07)"}
              strokeDasharray={value === 0 ? undefined : "3 5"}
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 3.5}
              textAnchor="end"
              className="fill-[#6b7280] font-mono"
              fontSize="10"
            >
              {tick(value)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const path = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={s.label}
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeDasharray={s.dash ? "4 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={s.dash ? 0.65 : 1}
            />
          );
        })}

        {series.map((s) => {
          const lastPoint = s.points[s.points.length - 1];
          if (!lastPoint) return null;
          return (
            <circle
              key={`${s.label}-dot`}
              cx={x(lastPoint.date)}
              cy={y(lastPoint.value)}
              r={2.6}
              fill={s.color}
            />
          );
        })}

        {[dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]].map((date, i) => (
          <text
            key={i}
            x={x(date)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            className="fill-[#6b7280] font-mono"
            fontSize="10"
          >
            {date}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-4 rounded"
              style={{ background: s.color, opacity: s.dash ? 0.65 : 1 }}
            />
            <span className="text-muted">{s.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-white/[0.06]" />
          <span className="text-muted">weekend / market closed</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function ChartLegendNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-dim">{children}</p>;
}
