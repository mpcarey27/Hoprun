import React from 'react';

interface Props {
  acr: number | null;
  projectedAcr?: number;
  acuteWorkload?: number;
  chronicWorkload?: number | null;
  safeRemainingBudget?: number | null;
  hasExceededBudget?: boolean;
  compact?: boolean;
}

export const ACRTachometerDial: React.FC<Props> = ({
  acr,
  projectedAcr,
  acuteWorkload,
  chronicWorkload,
  safeRemainingBudget,
  hasExceededBudget,
  compact = false,
}) => {
  // Determine displayed ratio: acr or projectedAcr or null
  const displayRatio = acr !== null ? acr : projectedAcr !== undefined ? projectedAcr : null;
  const isProjectedOnly = acr === null && projectedAcr !== undefined;

  // Arc math: 180-degree sweep from -180° (left) to 0° (right) or 150° to 390°
  // Let's use a 180-degree semi-circle gauge:
  // min ACR = 0.40 (-180°), max ACR = 1.60 (0°)
  // Range is 0.40 to 1.60 (span of 1.20)
  const minVal = 0.40;
  const maxVal = 1.60;

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  // Converts ACR value to angle in degrees from -180 to 0
  const valToAngle = (val: number) => {
    const clamped = clamp(val, minVal, maxVal);
    const fraction = (clamped - minVal) / (maxVal - minVal);
    return -180 + fraction * 180;
  };

  const currentAngle = displayRatio !== null ? valToAngle(displayRatio) : -180;

  // Gauge dimensions
  const width = compact ? 220 : 280;
  const height = compact ? 130 : 160;
  const cx = width / 2;
  const cy = compact ? 115 : 140;
  const radius = compact ? 85 : 105;
  const strokeWidth = compact ? 12 : 16;

  // Helper to convert polar to cartesian
  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  // Helper to describe an arc path between two angles (in degrees, -180 to 0)
  const describeArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, r, startAngle);
    const end = polarToCartesian(x, y, r, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  // Zone boundaries:
  // Zone 1: Deload (< 0.80) -> minVal (0.40) to 0.80
  const z1Start = valToAngle(0.40);
  const z1End = valToAngle(0.80);

  // Zone 2: Sweet Spot (0.80 to 1.20)
  const z2Start = valToAngle(0.80);
  const z2End = valToAngle(1.20);

  // Zone 3: Caution (1.20 to 1.35)
  const z3Start = valToAngle(1.20);
  const z3End = valToAngle(1.35);

  // Zone 4: Danger (> 1.35) -> 1.35 to 1.60
  const z4Start = valToAngle(1.35);
  const z4End = valToAngle(1.60);

  // Determine current status string and color
  let statusText = 'Baseline Building';
  let statusColor = 'var(--text-muted)';
  let statusBadgeClass = 'dial-status-baseline';

  if (displayRatio !== null) {
    if (displayRatio < 0.80) {
      statusText = 'Under-Training / Deload';
      statusColor = '#38bdf8';
      statusBadgeClass = 'dial-status-deload';
    } else if (displayRatio <= 1.20) {
      statusText = 'Optimal Sweet Spot';
      statusColor = '#10b981';
      statusBadgeClass = 'dial-status-sweet';
    } else if (displayRatio <= 1.35) {
      statusText = 'Elevated Strain · Caution';
      statusColor = '#f59e0b';
      statusBadgeClass = 'dial-status-caution';
    } else {
      statusText = 'Injury Hazard · Overload';
      statusColor = '#ef4444';
      statusBadgeClass = 'dial-status-danger';
    }
  }

  // Needle tip coordinates
  const needleLength = radius - 8;
  const needleTip = polarToCartesian(cx, cy, needleLength, currentAngle);
  const needleBack = polarToCartesian(cx, cy, -10, currentAngle);

  // Tick label coordinates for 0.80 and 1.20
  const tick80 = polarToCartesian(cx, cy, radius + (compact ? 12 : 16), valToAngle(0.80));
  const tick120 = polarToCartesian(cx, cy, radius + (compact ? 12 : 16), valToAngle(1.20));

  return (
    <div className={`acr-tachometer-card ${compact ? 'tachometer-compact' : ''}`}>
      <div className="tachometer-header">
        <span className="tachometer-title">Acute:Chronic Ratio (ACR)</span>
        {isProjectedOnly && <span className="tachometer-projected-tag">Projected</span>}
      </div>

      <div className="tachometer-svg-container">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="tachometer-svg"
          aria-label={`ACWR Tachometer: ${displayRatio ? displayRatio.toFixed(2) : 'No data'}`}
        >
          {/* Background track */}
          <path
            d={describeArc(cx, cy, radius, -180, 0)}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Zone 1: Deload (< 0.80) - Cyan/Blue */}
          <path
            d={describeArc(cx, cy, radius, z1Start, z1End)}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={strokeWidth}
            opacity="0.85"
          />

          {/* Zone 2: Sweet Spot (0.80 - 1.20) - Vibrant Green */}
          <path
            d={describeArc(cx, cy, radius, z2Start, z2End)}
            fill="none"
            stroke="#10b981"
            strokeWidth={strokeWidth}
            opacity="0.95"
          />

          {/* Zone 3: Caution (1.20 - 1.35) - Amber */}
          <path
            d={describeArc(cx, cy, radius, z3Start, z3End)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            opacity="0.9"
          />

          {/* Zone 4: Hazard (> 1.35) - Red */}
          <path
            d={describeArc(cx, cy, radius, z4Start, z4End)}
            fill="none"
            stroke="#ef4444"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Tick mark labels */}
          <text
            x={tick80.x}
            y={tick80.y}
            textAnchor="middle"
            fontSize="9"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
            fontWeight="bold"
          >
            0.8
          </text>
          <text
            x={tick120.x}
            y={tick120.y}
            textAnchor="middle"
            fontSize="9"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
            fontWeight="bold"
          >
            1.2
          </text>

          {/* Needle (renders only if displayRatio is available) */}
          {displayRatio !== null && (
            <g className="tachometer-needle-group">
              <line
                x1={needleBack.x}
                y1={needleBack.y}
                x2={needleTip.x}
                y2={needleTip.y}
                stroke={statusColor}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={cx} cy={cy} r="5" fill={statusColor} />
              <circle cx={cx} cy={cy} r="2" fill="var(--bg-surface)" />
            </g>
          )}
        </svg>

        {/* Center Readout */}
        <div className="tachometer-readout" style={{ bottom: compact ? '4px' : '8px' }}>
          <div className="tachometer-val-row">
            <span
              className="tachometer-value font-mono"
              style={{ color: displayRatio !== null ? statusColor : 'var(--text-muted)' }}
            >
              {displayRatio !== null ? displayRatio.toFixed(2) : '--'}
            </span>
          </div>
          <div className={`tachometer-badge ${statusBadgeClass}`}>
            {statusText}
          </div>
        </div>
      </div>

      {/* Budget & Context Footer */}
      {safeRemainingBudget !== undefined && safeRemainingBudget !== null && !hasExceededBudget && (
        <div className="tachometer-budget-row">
          <span className="budget-label">Safe Budget:</span>
          <span className="budget-pts font-mono font-bold text-success">
            +{safeRemainingBudget.toFixed(1)} pts
          </span>
          <span className="budget-hint">remaining before 1.20 hazard</span>
        </div>
      )}

      {hasExceededBudget && (
        <div className="tachometer-budget-row budget-exceeded">
          <span className="budget-alert-badge">Over Budget</span>
          <span className="budget-hint text-danger font-bold">
            Already crossed safe 1.20 threshold
          </span>
        </div>
      )}

      {acuteWorkload !== undefined && chronicWorkload && (
        <div className="tachometer-metrics-sub">
          <span>Acute: <strong className="font-mono">{acuteWorkload.toFixed(1)}</strong></span>
          <span>·</span>
          <span>Chronic: <strong className="font-mono">{chronicWorkload.toFixed(1)}</strong></span>
        </div>
      )}
    </div>
  );
};
