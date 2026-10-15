import React, { useState } from 'react';
import type { WeekWorkload } from '../../types/acr';

interface Props {
  weeks: WeekWorkload[];
}

export const WorkloadComparisonChart: React.FC<Props> = ({ weeks }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (weeks.length === 0) return null;

  const svgWidth = 680;
  const svgHeight = 240;
  const padding = { top: 30, right: 30, bottom: 40, left: 45 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const maxVal = Math.max(
    100,
    ...weeks.map((w) => Math.max(w.acuteWorkload, w.chronicWorkload || 0))
  ) * 1.15;

  const getX = (idx: number) => {
    const step = chartWidth / weeks.length;
    return padding.left + idx * step + step / 2;
  };

  const getY = (val: number) => {
    return padding.top + chartHeight - (val / maxVal) * chartHeight;
  };

  // Build Chronic line path (only for weeks where chronic exists)
  const chronicPoints = weeks
    .map((w, i) => (w.chronicWorkload !== null ? `${getX(i)},${getY(w.chronicWorkload)}` : null))
    .filter(Boolean)
    .join(' ');

  const barWidth = Math.max(12, Math.min(32, (chartWidth / weeks.length) * 0.45));

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <div>
          <h4 className="chart-title">Acute vs Chronic</h4>
          <span className="text-xs text-muted">Weekly Load vs 4-Wk Baseline</span>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><span className="legend-box acute-box"></span> Acute Workload</span>
          <span className="legend-item"><span className="legend-line chronic-line"></span> Chronic Baseline</span>
        </div>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block select-none"
        >
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
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

          {/* Acute Workload Bars */}
          {weeks.map((w, i) => {
            const x = getX(i) - barWidth / 2;
            const y = getY(w.acuteWorkload);
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
                  fill={isHovered ? '#60a5fa' : '#3b82f6'}
                  opacity={isHovered ? 0.95 : 0.75}
                />
                <text
                  x={getX(i)}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-primary)"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  {Math.round(w.acuteWorkload)}
                </text>
                <text
                  x={getX(i)}
                  y={padding.top + chartHeight + 18}
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

          {/* Chronic Workload Line */}
          {chronicPoints && (
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2.5"
              strokeDasharray="3 2"
              points={chronicPoints}
            />
          )}

          {/* Chronic dots */}
          {weeks.map((w, i) => {
            if (w.chronicWorkload === null) return null;
            const cx = getX(i);
            const cy = getY(w.chronicWorkload);
            return (
              <circle
                key={`c-${i}`}
                cx={cx}
                cy={cy}
                r={3.5}
                fill="#fbbf24"
                stroke="var(--bg-surface)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>

      {hoveredIdx !== null && weeks[hoveredIdx] && (
        <div className="chart-tooltip-bar">
          <span className="font-mono text-sm font-semibold text-primary">
            Week {weeks[hoveredIdx].weekNumber} ({weeks[hoveredIdx].startDate})
          </span>
          <span className="text-sm">
            Acute: <strong className="text-primary">{weeks[hoveredIdx].acuteWorkload.toFixed(1)}</strong>
          </span>
          <span className="text-sm">
            Chronic: <strong className="text-warning">
              {weeks[hoveredIdx].chronicWorkload !== null ? weeks[hoveredIdx].chronicWorkload?.toFixed(1) : 'Baseline building'}
            </strong>
          </span>
          <span className="text-sm text-secondary">
            Mileage: {weeks[hoveredIdx].totalMiles.toFixed(1)} mi ({weeks[hoveredIdx].totalKm.toFixed(1)} km)
          </span>
        </div>
      )}
    </div>
  );
};
