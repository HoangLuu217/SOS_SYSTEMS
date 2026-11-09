import React, { useState } from 'react';

export interface SeriesPoint {
  label: string;
  total: number;
  completed: number;
}

interface SosActivityChartProps {
  data: SeriesPoint[];
}

export const SosActivityChart: React.FC<SosActivityChartProps> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxVal = Math.max(4, ...data.map((d) => Math.max(d.total, d.completed)));
  const step = Math.ceil(maxVal / 4);
  const topY = step * 4;

  const W = 640;
  const H = 184;
  const padL = 28;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const slotW = n > 0 ? plotW / n : plotW;
  const barW = Math.min(18, Math.max(4, slotW * 0.46));
  const labelEvery = n > 16 ? Math.ceil(n / 8) : n > 10 ? 2 : 1;

  return (
    <div className="rpt-chart">
      <div className="rpt-chart-head">
        <div className="rpt-chart-legend">
          <span>
            <i style={{ background: '#cbd5e1' }} /> Phát sinh
          </span>
          <span>
            <i style={{ background: '#2563eb' }} /> Hoàn thành
          </span>
        </div>
        {hoverIdx !== null && data[hoverIdx] ? (
          <div className="rpt-chart-readout">
            <strong>{data[hoverIdx].label}</strong>
            <span>Phát sinh: <b>{data[hoverIdx].total}</b></span>
            <span>Hoàn thành: <b>{data[hoverIdx].completed}</b></span>
          </div>
        ) : (
          <div className="rpt-chart-readout is-muted">Rê chuột vào cột để xem chi tiết</div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="rpt-chart-svg">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padT + (plotH / 4) * i;
          const val = topY - step * i;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke={i === 4 ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={1}
              />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" className="rpt-chart-axis">
                {val}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padL + slotW * i + slotW / 2;
          const totalH = topY > 0 ? (d.total / topY) * plotH : 0;
          const compH = topY > 0 ? (d.completed / topY) * plotH : 0;
          const yTotal = padT + plotH - totalH;
          const yComp = padT + plotH - compH;
          const isHover = hoverIdx === i;

          return (
            <g
              key={`${d.label}-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {isHover && (
                <rect
                  x={padL + slotW * i + 2}
                  y={padT}
                  width={Math.max(2, slotW - 4)}
                  height={plotH}
                  fill="#f8fafc"
                />
              )}
              {d.total > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={yTotal}
                  width={barW}
                  height={Math.max(2, totalH)}
                  rx={2}
                  fill={isHover ? '#94a3b8' : '#cbd5e1'}
                />
              )}
              {d.completed > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={yComp}
                  width={barW}
                  height={Math.max(2, compH)}
                  rx={2}
                  fill={isHover ? '#1d4ed8' : '#2563eb'}
                />
              )}
              {(i % labelEvery === 0 || i === n - 1) && (
                <text x={cx} y={H - 6} textAnchor="middle" className="rpt-chart-axis">
                  {d.label}
                </text>
              )}
              <rect
                x={padL + slotW * i}
                y={padT}
                width={slotW}
                height={plotH}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export interface RatioSegment {
  label: string;
  value: number;
  color: string;
}

export const ProportionBar: React.FC<{ segments: RatioSegment[] }> = ({ segments }) => {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  return (
    <div className="rpt-prop">
      <div className="rpt-prop-track">
        {total > 0 ? (
          segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                className="rpt-prop-seg"
                style={{
                  width: `${(s.value / total) * 100}%`,
                  background: s.color,
                }}
                title={`${s.label}: ${s.value}`}
              />
            ) : null
          )
        ) : (
          <div className="rpt-prop-empty" />
        )}
      </div>
      <div className="rpt-prop-legend">
        {segments.map((s) => (
          <span key={s.label} className="rpt-prop-item">
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value.toLocaleString('vi-VN')}</b>
          </span>
        ))}
      </div>
    </div>
  );
};
