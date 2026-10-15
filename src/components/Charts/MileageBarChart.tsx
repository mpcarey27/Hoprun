import React, { useState } from 'react';
import type { WeekWorkload, DistanceUnit } from '../../types/acr';

interface Props {
  weeks: WeekWorkload[];
  unit: DistanceUnit;
}

export const MileageBarChart: React.FC<Props> = ({ weeks, unit }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (weeks.length === 0) return null;

  const svgWidth = 680;
  const svgHeight = 210;
  const padding = { top: 25, right: 25, bottom: 35, left: 45 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const values = weeks.map((w) => (unit === 'mi' ? w.totalMiles : w.totalKm));
  const maxVal = Math.max(20, ...values) * 1.15;

  const getX = (idx: number) => {
    const step = chartWidth / weeks.length;
    return padding.left + idx * step + step / 2;
  };

  const getY = (val: number) => {
    return padding.top + chartHeight - (val / maxVal) * chartHeight;
  };

  const barWidth = Math.max(12, Math.min(36, (chartWidth / weeks.length) * 0.5));

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <div>
          <h4 className="chart-title">Weekly Mileage Volume</h4>
          <span className="text-xs text-muted">Total distance per 7-day training cycle ({unit.toUpperCase()})</span>
        </div>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block select-none"
        >
          {/* Horizontal grid lines */}
          {[0.33, 0.66, 1.0].map((frac, idx) => {
            const val = maxVal * frac;
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeDasharray="2 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--text-muted)"
                  fontFamily="monospace"
                >
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Volume Bars */}
          {weeks.map((w, i) => {
            const val = values[i];
            const x = getX(i) - barWidth / 2;
            const y = getY(val);
            const height = padding.top + chartHeight - y;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, height)}
                  rx="3"
                  fill={isHovered ? 'var(--color-success, #10b981)' : 'var(--color-accent)'}
                  opacity={isHovered ? 1 : 0.85}
                />
                <text
                  x={getX(i)}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-primary)"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  {val.toFixed(1)}
                </text>
                <text
                  x={getX(i)}
                  y={padding.top + chartHeight + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill={isHovered ? 'var(--text-primary)' : 'var(--text-muted)'}
                  fontFamily="monospace"
                >
                  W{w.weekNumber}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
