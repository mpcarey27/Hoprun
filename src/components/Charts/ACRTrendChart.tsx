import React, { useState } from 'react';
import type { WeekWorkload } from '../../types/acr';

interface Props {
  weeks: WeekWorkload[];
  warningThreshold?: number;
}

export const ACRTrendChart: React.FC<Props> = ({
  weeks,
  warningThreshold = 1.2,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Filter weeks that have ACR calculated or projected
  const data = weeks
    .map((w, idx) => ({
      weekNum: w.weekNumber,
      label: `W${w.weekNumber}`,
      startDate: w.startDate,
      acr: w.acr,
      projectedAcr: w.projectedAcr,
      acute: w.acuteWorkload,
      chronic: w.chronicWorkload,
      isProjected: false,
      status: w.status,
      originalIndex: idx,
    }))
    .filter((d) => d.acr !== null);

  if (data.length === 0) {
    return (
      <div className="chart-empty-state">
        <p className="text-secondary text-sm">
          ACR trend line will appear after 4 weeks of training workload are logged.
        </p>
      </div>
    );
  }

  // Dimensions
  const svgWidth = 680;
  const svgHeight = 260;
  const padding = { top: 30, right: 30, bottom: 40, left: 45 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Scales
  const maxAcr = Math.max(1.6, ...data.map((d) => d.acr || 0)) * 1.1;
  const minAcr = 0;

  const getX = (index: number) => {
    if (data.length === 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const clamped = Math.max(minAcr, Math.min(maxAcr, val));
    return padding.top + chartHeight - ((clamped - minAcr) / (maxAcr - minAcr)) * chartHeight;
  };

  // Warning threshold Y
  const warningY = getY(warningThreshold);
  const safeZoneBottomY = getY(0.8);

  // Build SVG path for line
  const points = data.map((d, i) => `${getX(i)},${getY(d.acr!)}`).join(' ');

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <div>
          <h4 className="chart-title">Acute:Chronic Workload Ratio (ACR)</h4>
          <span className="text-xs text-muted">Sweet spot: 0.80 – 1.20 · Injury hazard threshold: &gt; 1.20</span>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><span className="legend-dot safe-dot"></span> 0.8 - 1.2 Optimal</span>
          <span className="legend-item"><span className="legend-dot warn-dot"></span> &gt; 1.2 Warning</span>
        </div>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block select-none"
        >
          {/* Background grid */}
          <line
            x1={padding.left}
            y1={getY(0.5)}
            x2={svgWidth - padding.right}
            y2={getY(0.5)}
            stroke="#21262d"
            strokeDasharray="3 3"
          />
          <line
            x1={padding.left}
            y1={getY(1.0)}
            x2={svgWidth - padding.right}
            y2={getY(1.0)}
            stroke="#30363d"
            strokeDasharray="4 4"
          />
          <line
            x1={padding.left}
            y1={getY(1.5)}
            x2={svgWidth - padding.right}
            y2={getY(1.5)}
            stroke="#21262d"
            strokeDasharray="3 3"
          />

          {/* Optimal zone shaded area (0.80 to 1.20) */}
          <rect
            x={padding.left}
            y={warningY}
            width={chartWidth}
            height={safeZoneBottomY - warningY}
            fill="#10b981"
            fillOpacity="0.07"
          />

          {/* Danger zone line at 1.20 */}
          <line
            x1={padding.left}
            y1={warningY}
            x2={svgWidth - padding.right}
            y2={warningY}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={svgWidth - padding.right}
            y={warningY - 6}
            textAnchor="end"
            fontSize="10"
            fill="#ef4444"
            fontFamily="monospace"
            fontWeight="bold"
          >
            1.20 LIMIT
          </text>

          {/* Safe zone line at 0.80 */}
          <line
            x1={padding.left}
            y1={safeZoneBottomY}
            x2={svgWidth - padding.right}
            y2={safeZoneBottomY}
            stroke="#10b981"
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeOpacity="0.4"
          />
          <text
            x={svgWidth - padding.right}
            y={safeZoneBottomY + 12}
            textAnchor="end"
            fontSize="9"
            fill="#10b981"
            fontFamily="monospace"
            opacity="0.7"
          >
            0.80 MIN
          </text>

          {/* Trend line */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Area fill under curve */}
          {data.length > 1 && (
            <polygon
              points={`${getX(0)},${padding.top + chartHeight} ${points} ${getX(data.length - 1)},${padding.top + chartHeight}`}
              fill="url(#acrGradient)"
              opacity="0.25"
            />
          )}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="acrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Data Points */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.acr!);
            const isExceeded = d.acr! > warningThreshold;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer halo if exceeded */}
                {isExceeded && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 9 : 7}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}
                {/* Core dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4.5}
                  fill={isExceeded ? '#ef4444' : '#38bdf8'}
                  stroke="#0e1117"
                  strokeWidth="2"
                />
                {/* Value text above dot */}
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="monospace"
                  fill={isExceeded ? '#ef4444' : '#e6edf3'}
                  fontWeight={isExceeded || isHovered ? 'bold' : 'normal'}
                >
                  {d.acr!.toFixed(2)}
                </text>
                {/* X-axis label */}
                <text
                  x={cx}
                  y={padding.top + chartHeight + 20}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isHovered ? '#f0f6fc' : '#8b949e'}
                  fontFamily="monospace"
                >
                  {d.label}
                </text>
              </g>
            );
          })}

          {/* Y Axis markings */}
          <text x={padding.left - 8} y={getY(0.0) + 4} textAnchor="end" fontSize="10" fill="#6e7681" fontFamily="monospace">0.0</text>
          <text x={padding.left - 8} y={getY(0.8) + 4} textAnchor="end" fontSize="10" fill="#10b981" fontFamily="monospace">0.8</text>
          <text x={padding.left - 8} y={getY(1.2) + 4} textAnchor="end" fontSize="10" fill="#ef4444" fontFamily="monospace">1.2</text>
          <text x={padding.left - 8} y={getY(1.6) + 4} textAnchor="end" fontSize="10" fill="#6e7681" fontFamily="monospace">1.6</text>
        </svg>
      </div>

      {/* Tooltip info panel */}
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="chart-tooltip-bar">
          <span className="font-mono text-sm font-semibold text-primary">
            Week {data[hoveredIdx].weekNum} ({data[hoveredIdx].startDate})
          </span>
          <span className="text-sm">
            ACR: <strong className={data[hoveredIdx].acr! > warningThreshold ? 'text-danger' : 'text-success'}>
              {data[hoveredIdx].acr!.toFixed(4)}
            </strong>
          </span>
          <span className="text-sm text-secondary">
            Acute: {data[hoveredIdx].acute.toFixed(1)}
          </span>
          <span className="text-sm text-secondary">
            Chronic: {data[hoveredIdx].chronic?.toFixed(1)}
          </span>
          {data[hoveredIdx].acr! > warningThreshold && (
            <span className="badge-danger text-xs">Exceeds 1.2 Limit</span>
          )}
        </div>
      )}
    </div>
  );
};
