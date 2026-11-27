import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/* ==========================================================================
   Chronicle Chart Kit (Zero-dependency SVG ports matching shadcn-ref/kit/charts)
   - PillBars: fully rounded vertical pill columns with lead bar drop-shadow glow
   - HourBars: slim gradient bars + dashed comparison curve
   - StepLines: stepped area chart with soft downward gradient fade
   - Heatmap: weekday x 2-hour block matrix using oklch color-mix
   ========================================================================== */

export interface PillDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
  title?: string;
}

export function PillBars({
  data,
  color = 'var(--chart-lead)',
  highlight = 'last',
  format = (v) => v.toLocaleString('vi-VN'),
  valueLabel = 'Số lượng',
  showLabels = true,
  className,
  barWidth = 22,
}: {
  data: PillDatum[];
  color?: string;
  highlight?: 'max' | 'last' | number;
  format?: (value: number) => string;
  valueLabel?: string;
  showLabels?: boolean;
  className?: string;
  barWidth?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) return null;

  const target =
    typeof highlight === 'number'
      ? highlight
      : highlight === 'last'
        ? data.length - 1
        : data.reduce((best, item, idx) => (item.value > data[best].value ? idx : best), 0);

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const W = Math.max(320, data.length * 46);
  const H = showLabels ? 220 : 140;
  const padX = 12;
  const padTop = 14;
  const padBottom = showLabels ? 28 : 10;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const slotW = plotW / data.length;
  const actualBarW = Math.min(barWidth, Math.max(8, slotW * 0.5));
  const labelEvery = data.length > 16 ? Math.ceil(data.length / 8) : data.length > 12 ? 2 : 1;

  const activeDatum = hoverIdx !== null ? data[hoverIdx] : null;
  const tooltipLeftPct =
    hoverIdx !== null ? Math.min(84, Math.max(16, ((hoverIdx + 0.5) / data.length) * 100)) : 50;

  return (
    <div className={cn('relative w-full select-none', className)}>
      {activeDatum && (
        <div
          className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="mb-1 font-medium text-foreground">
            {activeDatum.title ?? activeDatum.label}
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{valueLabel}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {format(activeDatum.value)}
            </span>
          </div>
          {activeDatum.secondaryValue !== undefined && (
            <div className="mt-0.5 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {activeDatum.secondaryLabel || 'Hoàn thành'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-primary">
                {format(activeDatum.secondaryValue)}
              </span>
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={valueLabel}
      >
        <defs>
          <filter id={`pill-glow-${uid}`} filterUnits="userSpaceOnUse" x="-15%" y="-20%" width="130%" height="155%">
            <feDropShadow
              dx="0"
              dy="8"
              stdDeviation="6"
              style={{ floodColor: color, floodOpacity: 0.4 }}
            />
          </filter>
        </defs>

        {data.map((datum, idx) => {
          const cx = padX + slotW * idx + slotW / 2;
          const isHighlight = idx === target;
          const isHover = idx === hoverIdx;
          const ratio = datum.value / maxVal;
          // Draw a subtle pill baseline when value === 0 so empty periods still read cleanly
          const barH = datum.value > 0 ? Math.max(actualBarW, ratio * plotH) : Math.min(10, actualBarW * 0.55);
          const y = padTop + plotH - barH;
          const rx = actualBarW / 2;

          return (
            <g
              key={`${datum.label}-${idx}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={padX + slotW * idx}
                y={padTop}
                width={slotW}
                height={plotH + padBottom}
                fill="transparent"
              />
              <rect
                x={cx - actualBarW / 2}
                y={y}
                width={actualBarW}
                height={barH}
                rx={rx}
                ry={rx}
                fill={color}
                fillOpacity={
                  datum.value === 0
                    ? isHover
                      ? 0.25
                      : 0.12
                    : isHighlight || isHover
                      ? 1
                      : 0.28
                }
                filter={isHighlight && datum.value > 0 ? `url(#pill-glow-${uid})` : undefined}
                style={{ transition: 'fill-opacity 150ms ease, height 220ms ease, y 220ms ease' }}
              />
              {showLabels && (idx % labelEvery === 0 || idx === data.length - 1) && (
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono"
                  style={{ fontSize: 11 }}
                >
                  {datum.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface HourDatum {
  label: string;
  current: number;
  previous: number;
}

export function HourBars({
  data,
  color = 'var(--chart-lead)',
  format = (v) => v.toLocaleString('vi-VN'),
  currentLabel = '24 giờ qua',
  previousLabel = 'Ngày hôm trước',
  className,
}: {
  data: HourDatum[];
  color?: string;
  format?: (value: number) => string;
  currentLabel?: string;
  previousLabel?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxVal = Math.max(1, ...data.flatMap((d) => [d.current, d.previous]));
  const W = 360;
  const H = 88;
  const padX = 4;
  const padTop = 8;
  const padBottom = 4;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const slotW = plotW / data.length;
  const barW = Math.min(8, Math.max(3, slotW * 0.56));
  const last = data.length - 1;

  // Smooth quadratic path for previous period dashed curve
  const pts = data.map((d, i) => ({
    x: padX + slotW * i + slotW / 2,
    y: padTop + plotH - (d.previous / maxVal) * plotH,
  }));
  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = pts[i - 1];
    const midX = (prev.x + pt.x) / 2;
    return `${acc} Q ${prev.x} ${prev.y}, ${midX} ${(prev.y + pt.y) / 2} T ${pt.x} ${pt.y}`;
  }, '');

  const activeDatum = hoverIdx !== null ? data[hoverIdx] : null;
  const tooltipLeftPct =
    hoverIdx !== null ? Math.min(82, Math.max(18, ((hoverIdx + 0.5) / data.length) * 100)) : 50;

  return (
    <div className={cn('relative w-full select-none', className)}>
      {activeDatum && (
        <div
          className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="mb-1 font-medium text-foreground">{activeDatum.label}</div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{currentLabel}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {format(activeDatum.current)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{previousLabel}</span>
            <span className="font-mono font-semibold tabular-nums text-muted-foreground">
              {format(activeDatum.previous)}
            </span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={currentLabel}
      >
        <defs>
          <linearGradient id={`hour-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.62} />
            <stop offset="100%" stopColor={color} stopOpacity={0.12} />
          </linearGradient>
          <filter id={`hour-glow-${uid}`} x="-120%" y="-30%" width="340%" height="160%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="3"
              style={{ floodColor: color, floodOpacity: 0.45 }}
            />
          </filter>
        </defs>

        {data.map((d, i) => {
          const cx = padX + slotW * i + slotW / 2;
          const h = d.current > 0 ? Math.max(5, (d.current / maxVal) * plotH) : 3;
          const y = padTop + plotH - h;
          const isLast = i === last;
          const isHover = i === hoverIdx;
          return (
            <g
              key={`${d.label}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect x={padX + slotW * i} y={0} width={slotW} height={H} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={h}
                rx={barW / 2}
                ry={barW / 2}
                fill={isLast || isHover ? color : `url(#hour-grad-${uid})`}
                fillOpacity={d.current === 0 && !isHover ? 0.35 : 1}
                filter={isLast && d.current > 0 ? `url(#hour-glow-${uid})` : undefined}
              />
            </g>
          );
        })}

        <path
          d={linePath}
          fill="none"
          stroke="var(--chart-line)"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          className="pointer-events-none"
        />
      </svg>
    </div>
  );
}

export interface StepPoint {
  label: string;
  value: number;
}

export function StepLines({
  data,
  color = 'var(--chart-lead)',
  seriesLabel = 'Giá trị',
  format = (v) => v.toLocaleString('vi-VN'),
  className,
}: {
  data: StepPoint[];
  color?: string;
  seriesLabel?: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const W = 320;
  const H = 112;
  const padL = 8;
  const padR = 8;
  const padTop = 10;
  const padBottom = 22;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW;

  const coords = data.map((d, i) => ({
    x: padL + i * stepX,
    y: padTop + plotH - (d.value / maxVal) * plotH,
  }));

  let lineD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    lineD += ` H ${coords[i].x} V ${coords[i].y}`;
  }
  const areaD = `${lineD} V ${padTop + plotH} H ${coords[0].x} Z`;
  const activeDatum = hoverIdx !== null ? data[hoverIdx] : null;
  const labelEvery = data.length > 8 ? Math.ceil(data.length / 4) : Math.max(1, Math.floor(data.length / 4));

  return (
    <div className={cn('relative w-full select-none', className)}>
      {activeDatum && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
          style={{
            left: `${Math.min(82, Math.max(18, (coords[hoverIdx].x / W) * 100))}%`,
          }}
        >
          <div className="font-medium text-foreground">{activeDatum.label}</div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{seriesLabel}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {format(activeDatum.value)}
            </span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={seriesLabel}
      >
        <defs>
          <linearGradient id={`step-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((frac) => {
          const y = padTop + plotH * frac;
          return (
            <line
              key={frac}
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          );
        })}

        <path d={areaD} fill={`url(#step-fill-${uid})`} />
        <path d={lineD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {coords.map((pt, i) => (
          <g
            key={`${data[i].label}-${i}`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            className="cursor-pointer"
          >
            <rect
              x={Math.max(0, pt.x - stepX / 2)}
              y={0}
              width={stepX}
              height={H}
              fill="transparent"
            />
            {hoverIdx === i && (
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill={color}
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
            {(i % labelEvery === 0 || i === data.length - 1) && (
              <text
                x={pt.x}
                y={H - 4}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground font-mono"
                style={{ fontSize: 10 }}
              >
                {data[i].label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Weekday x 2-hour block heatmap (exact mirror of shadcn-ref/components/chronicle/heatmap.tsx)
 */
export function Heatmap({
  rows,
  columns,
  values,
  format = (v) => v.toLocaleString('vi-VN'),
  label,
  className,
}: {
  rows: readonly string[];
  columns: readonly string[];
  values: readonly (readonly number[])[];
  format?: (value: number) => string;
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...values.flat());
  const n = columns.length;
  const wide = Math.max(1, Math.ceil(n / 4));
  const mid = Math.max(1, Math.ceil(n / 8));
  const all = n <= 12 ? 1 : 2;
  const cells = values.flatMap((row, y) => row.map((value, x) => ({ value, x, y })));
  if (cells.length === 0) return null;

  return (
    <figure className={cn('@container relative w-full', className)}>
      <figcaption className="sr-only">{label}</figcaption>
      <div
        className="grid items-center gap-[3px]"
        style={{ gridTemplateColumns: `2.1rem repeat(${n}, minmax(0, 1fr))` }}
      >
        {values.map((row, y) => (
          <div key={rows[y]} className="contents">
            <span className="pe-2 font-mono text-[11px] text-muted-foreground">{rows[y]}</span>
            {row.map((value, x) => (
              <span
                key={x}
                className="flex justify-center"
                title={`${rows[y]} ${columns[x]}: ${format(value)}`}
              >
                <span
                  className="aspect-square w-full max-w-8 rounded-[4px] transition-colors"
                  style={{
                    backgroundColor:
                      value === 0
                        ? 'var(--muted)'
                        : `color-mix(in oklch, var(--chart-lead) ${Math.round(16 + (value / max) * 84)}%, var(--muted))`,
                  }}
                />
              </span>
            ))}
          </div>
        ))}
        <span />
        {columns.map((column, x) => (
          <span
            key={column}
            className={cn(
              'mt-1.5 overflow-visible text-center font-mono text-[10px] whitespace-nowrap text-muted-foreground',
              x % wide !== 0 && 'invisible',
              x % wide !== 0 && x % mid === 0 && '@sm:visible',
              x % wide !== 0 && x % mid !== 0 && x % all === 0 && '@xl:visible'
            )}
          >
            {column}
          </span>
        ))}
      </div>
      <div
        className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground"
        aria-hidden
      >
        Ít
        {[0.15, 0.4, 0.65, 0.9].map((share) => (
          <span
            key={share}
            className="size-2.5 rounded-[3px]"
            style={{
              backgroundColor: `color-mix(in oklch, var(--chart-lead) ${Math.round(16 + share * 84)}%, var(--muted))`,
            }}
          />
        ))}
        Nhiều
      </div>
    </figure>
  );
}
