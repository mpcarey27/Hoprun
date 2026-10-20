import React from 'react';
import type { TargetRace } from '../types/acr';
import { calculateRaceCountdown } from '../utils/calculations';

interface Props {
  targetRace?: TargetRace;
  todayStr: string;
  onOpenSettings?: () => void;
}

export const RaceCountdownBanner: React.FC<Props> = ({
  targetRace,
  todayStr,
  onOpenSettings,
}) => {
  if (!targetRace || !targetRace.date) {
    return null;
  }

  const countdown = calculateRaceCountdown(todayStr, targetRace.date);

  // Phase badge color class
  let phaseClass = 'phase-base';
  if (countdown.phase === 'Peak Mileage') phaseClass = 'phase-peak';
  if (countdown.phase === 'Taper') phaseClass = 'phase-taper';
  if (countdown.phase === 'Race Week' || countdown.phase === 'Race Day') phaseClass = 'phase-raceweek';

  return (
    <div className="race-countdown-banner">
      <div className="race-countdown-left">
        <span className="race-flag-icon">🏁</span>
        <div className="race-details-col">
          <div className="race-title-row">
            <span className="race-name font-bold">{targetRace.name}</span>
            <span className="race-date font-mono text-xs text-muted">({targetRace.date})</span>
            {targetRace.targetTime && (
              <span className="race-target-pill font-mono text-xs">
                Goal: {targetRace.targetTime}
              </span>
            )}
          </div>
          <div className="race-phase-row">
            <span className={`race-phase-badge ${phaseClass}`}>{countdown.phase}</span>
            <span className="race-timeline-hint text-xs text-secondary">
              {countdown.isPast
                ? `Completed ${countdown.daysRemaining} days ago`
                : countdown.daysRemaining === 0
                ? 'TODAY IS RACE DAY! Go crush it!'
                : `${countdown.daysRemaining} days remaining`}
            </span>
          </div>
        </div>
      </div>

      <div className="race-countdown-right">
        {!countdown.isPast && countdown.daysRemaining > 0 && (
          <div className="countdown-number-block">
            <span className="countdown-big-val font-mono font-bold text-accent">
              {countdown.daysRemaining}
            </span>
            <span className="countdown-unit-lbl text-xs text-muted">DAYS</span>
          </div>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className="race-edit-btn"
            onClick={onOpenSettings}
            title="Configure target race in Settings"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
};
