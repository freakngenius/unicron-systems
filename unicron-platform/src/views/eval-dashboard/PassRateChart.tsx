// Inline-SVG line chart for weekly pass rate per agent.
//
// We deliberately avoid pulling in `recharts`: the component subtree is small
// and the dashboard only needs a multi-series line. Chart math is contained
// here so it stays trivially testable; data shaping happens upstream in
// `evalDashboardClient.ts`.

import type { AgentSeries } from '../../lib/evalDashboardClient';

const WIDTH = 720;
const HEIGHT = 220;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

// Atrium category-tag palette (Pass 2 of the rebrand). The seven categories
// are ordered to maximize hue separation when many agents are charted.
// SVG fill/stroke accept var() directly, so no runtime resolution needed.
const SERIES_COLORS = [
  'var(--cat-sales)',        // orange — accent
  'var(--cat-productivity)', // green
  'var(--cat-research)',     // blue
  'var(--cat-discovery)',    // gold
  'var(--cat-marketing)',    // pink
  'var(--cat-memory)',       // purple
  'var(--cat-operations)',   // teal
];

export function PassRateChart({ series }: { series: AgentSeries[] }) {
  const allWeeks = Array.from(
    new Set(series.flatMap((s) => s.bins.map((b) => b.weekStart))),
  ).sort();

  if (allWeeks.length === 0) {
    return (
      <div
        data-testid="eval-dashboard-chart-empty"
        className="border border-border-default border-dashed rounded-md bg-bg-panel/50 p-12 text-center"
      >
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
          no runs in window
        </span>
      </div>
    );
  }

  const xScale = (i: number) =>
    allWeeks.length === 1
      ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2
      : PAD_LEFT + (i * (WIDTH - PAD_LEFT - PAD_RIGHT)) / (allWeeks.length - 1);
  const yScale = (rate: number) =>
    PAD_TOP + (1 - rate) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  return (
    <div
      data-testid="eval-dashboard-chart"
      className="border border-border-default rounded-md bg-bg-panel p-4"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Pass rate over time per agent"
      >
        {/* Y axis grid: 0%, 25%, 50%, 75%, 100% */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="1"
            />
            <text
              x={PAD_LEFT - 8}
              y={yScale(tick) + 4}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.4"
              className="mono"
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* X axis labels (week start) */}
        {allWeeks.map((week, i) => (
          <text
            key={week}
            x={xScale(i)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.4"
            className="mono"
          >
            {week.slice(5)}
          </text>
        ))}

        {/* Lines per agent */}
        {series.map((s, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          const points = s.bins
            .filter((b) => b.passRate !== null)
            .map((b) => {
              const xi = allWeeks.indexOf(b.weekStart);
              return { x: xScale(xi), y: yScale(b.passRate as number), bin: b };
            });
          if (points.length === 0) return null;
          const path = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.agentName} data-testid={`eval-dashboard-chart-series-${s.agentName}`}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p) => (
                <circle
                  key={`${s.agentName}-${p.bin.weekStart}`}
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill={color}
                >
                  <title>
                    {s.agentName} · week of {p.bin.weekStart} ·{' '}
                    {(p.bin.passRate ?? 0).toLocaleString(undefined, {
                      style: 'percent',
                      maximumFractionDigits: 1,
                    })}{' '}
                    ({p.bin.passed}/{p.bin.passed + p.bin.failed})
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <ul
        className="mt-3 flex flex-wrap gap-3"
        data-testid="eval-dashboard-chart-legend"
      >
        {series.map((s, idx) => (
          <li
            key={s.agentName}
            className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/60"
          >
            <span
              aria-hidden
              className="inline-block w-3 h-[2px] rounded"
              style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
            />
            {s.agentName}
          </li>
        ))}
      </ul>
    </div>
  );
}
