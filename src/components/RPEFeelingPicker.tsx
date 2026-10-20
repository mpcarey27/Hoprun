import React from 'react';
import type { RunnerFeeling } from '../types/acr';

interface Props {
  rpe?: number;
  onRpeChange: (rpe: number | undefined) => void;
  feeling?: RunnerFeeling;
  onFeelingChange: (feeling: RunnerFeeling | undefined) => void;
  durationSeconds?: number;
  compact?: boolean;
}

const FEELING_OPTIONS: Array<{
  id: RunnerFeeling;
  label: string;
  icon: string;
  desc: string;
}> = [
  { id: 'fresh', label: 'Fresh', icon: '⚡', desc: 'Bouncy & energized' },
  { id: 'good', label: 'Good', icon: '😊', desc: 'Strong & steady' },
  { id: 'normal', label: 'Normal', icon: '😐', desc: 'Standard effort' },
  { id: 'tired', label: 'Tired', icon: '🥱', desc: 'Heavy legs / fatigued' },
  { id: 'exhausted', label: 'Exhausted', icon: '💥', desc: 'Very sore / drained' },
];

const RPE_DESCRIPTIONS: Record<number, string> = {
  1: 'Very Light / Recovery',
  2: 'Easy Jog / Zone 1',
  3: 'Comfortable Zone 2',
  4: 'Moderate Aerobic',
  5: 'Somewhat Hard / Steady',
  6: 'Challenging Pace',
  7: 'Hard / Threshold / Tempo',
  8: 'Very Hard / Intervals',
  9: 'Extremely Hard',
  10: 'Maximum / All-Out Sprint',
};

export const RPEFeelingPicker: React.FC<Props> = ({
  rpe,
  onRpeChange,
  feeling,
  onFeelingChange,
  durationSeconds,
  compact = false,
}) => {
  const srpe =
    rpe && durationSeconds && durationSeconds > 0
      ? Math.round((durationSeconds / 60) * rpe)
      : null;

  return (
    <div className={`rpe-feeling-picker ${compact ? 'picker-compact' : ''}`}>
      {/* Feeling Section */}
      <div className="picker-block">
        <div className="picker-header-row">
          <label className="picker-label">How did this run feel?</label>
          {feeling && (
            <button
              type="button"
              className="picker-clear-btn"
              onClick={() => onFeelingChange(undefined)}
              title="Clear selection"
            >
              Clear
            </button>
          )}
        </div>
        <div className="feeling-chips-grid">
          {FEELING_OPTIONS.map((opt) => {
            const isSelected = feeling === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`feeling-chip ${isSelected ? 'active' : ''}`}
                onClick={() => onFeelingChange(isSelected ? undefined : opt.id)}
                title={opt.desc}
              >
                <span className="feeling-icon">{opt.icon}</span>
                <span className="feeling-name">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RPE Section */}
      <div className="picker-block rpe-block">
        <div className="picker-header-row">
          <label className="picker-label">
            Effort Rating (RPE 1–10)
            {rpe && <span className="rpe-active-tag font-mono">Level {rpe}</span>}
          </label>
          <div className="picker-rpe-actions">
            {srpe !== null && (
              <span className="srpe-metric font-mono text-accent" title="Session RPE = Duration (min) × RPE">
                {srpe} sRPE
              </span>
            )}
            {rpe !== undefined && (
              <button
                type="button"
                className="picker-clear-btn"
                onClick={() => onRpeChange(undefined)}
                title="Clear RPE"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* 10-point scale chips */}
        <div className="rpe-scale-row">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
            const isSelected = rpe === num;
            // Color gradient indicator for RPE scale
            let levelClass = 'rpe-low';
            if (num >= 5 && num <= 6) levelClass = 'rpe-mid';
            if (num >= 7 && num <= 8) levelClass = 'rpe-high';
            if (num >= 9) levelClass = 'rpe-max';

            return (
              <button
                key={num}
                type="button"
                className={`rpe-chip ${levelClass} ${isSelected ? 'active' : ''}`}
                onClick={() => onRpeChange(isSelected ? undefined : num)}
                title={`RPE ${num}: ${RPE_DESCRIPTIONS[num]}`}
              >
                {num}
              </button>
            );
          })}
        </div>

        {/* Dynamic effort description */}
        {rpe ? (
          <div className="rpe-descriptor font-mono text-xs text-secondary">
            {rpe} / 10 · {RPE_DESCRIPTIONS[rpe]}
          </div>
        ) : (
          <div className="rpe-descriptor font-mono text-xs text-muted">
            Select perceived exertion from 1 (effortless) to 10 (all-out)
          </div>
        )}
      </div>
    </div>
  );
};
