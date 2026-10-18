import React, { useState, useEffect } from 'react';
import type { DistanceUnit } from '../types/acr';
import {
  timeToSeconds,
  secondsToTime,
  formatDuration,
  paceToSeconds,
  secondsToPace,
  calculatePaceSeconds,
  calculateDurationFromPace,
  formatPace,
} from '../utils/calculations';

interface Props {
  distance: number;
  distanceUnit: DistanceUnit;
  durationSeconds?: number;
  paceSeconds?: number;
  onChange: (result: {
    durationSeconds?: number;
    durationFormatted?: string;
    paceSeconds?: number;
    paceFormatted?: string;
  }) => void;
  label?: string;
  compact?: boolean;
}

export const StravaTimePacePicker: React.FC<Props> = ({
  distance,
  distanceUnit,
  durationSeconds,
  paceSeconds,
  onChange,
  label = 'Time & Pace (Optional)',
  compact = false,
}) => {
  // Input mode: 'time' = enter duration, 'pace' = enter pace
  const [entryMode, setEntryMode] = useState<'time' | 'pace'>('time');

  // Time state (Hours, Minutes, Seconds)
  const initialTime = secondsToTime(durationSeconds || 0);
  const [hours, setHours] = useState<string>(
    durationSeconds && durationSeconds >= 3600 ? String(initialTime.hours) : ''
  );
  const [minutes, setMinutes] = useState<string>(
    durationSeconds ? String(initialTime.minutes) : ''
  );
  const [seconds, setSeconds] = useState<string>(
    durationSeconds ? String(initialTime.seconds) : ''
  );

  // Pace state (Minutes, Seconds per unit)
  const initialPace = secondsToPace(paceSeconds || 0);
  const [paceMins, setPaceMins] = useState<string>(
    paceSeconds ? String(initialPace.minutes) : ''
  );
  const [paceSecs, setPaceSecs] = useState<string>(
    paceSeconds ? String(initialPace.seconds) : ''
  );

  // Sync internal state if durationSeconds or paceSeconds changes from outside
  useEffect(() => {
    if (durationSeconds && durationSeconds > 0) {
      const t = secondsToTime(durationSeconds);
      setHours(t.hours > 0 ? String(t.hours) : '');
      setMinutes(String(t.minutes));
      setSeconds(t.seconds > 0 ? String(t.seconds) : '');
    } else if (!durationSeconds && !paceSeconds) {
      setHours('');
      setMinutes('');
      setSeconds('');
    }
  }, [durationSeconds]);

  useEffect(() => {
    if (paceSeconds && paceSeconds > 0) {
      const p = secondsToPace(paceSeconds);
      setPaceMins(String(p.minutes));
      setPaceSecs(p.seconds > 0 ? String(p.seconds) : '');
    } else if (!durationSeconds && !paceSeconds) {
      setPaceMins('');
      setPaceSecs('');
    }
  }, [paceSeconds]);

  // Handle Time input change
  const handleTimeChange = (newH: string, newM: string, newS: string) => {
    setHours(newH);
    setMinutes(newM);
    setSeconds(newS);

    const hNum = parseInt(newH, 10) || 0;
    const mNum = parseInt(newM, 10) || 0;
    const sNum = parseInt(newS, 10) || 0;
    const totalSecs = timeToSeconds(hNum, mNum, sNum);

    if (totalSecs > 0) {
      const formattedDur = formatDuration(totalSecs);
      const computedPaceSecs = calculatePaceSeconds(totalSecs, distance) || undefined;
      const formattedP = computedPaceSecs ? formatPace(computedPaceSecs, distanceUnit) : undefined;

      if (computedPaceSecs) {
        const p = secondsToPace(computedPaceSecs);
        setPaceMins(String(p.minutes));
        setPaceSecs(p.seconds > 0 ? String(p.seconds) : '');
      }

      onChange({
        durationSeconds: totalSecs,
        durationFormatted: formattedDur,
        paceSeconds: computedPaceSecs,
        paceFormatted: formattedP,
      });
    } else {
      setPaceMins('');
      setPaceSecs('');
      onChange({
        durationSeconds: undefined,
        durationFormatted: undefined,
        paceSeconds: undefined,
        paceFormatted: undefined,
      });
    }
  };

  // Handle Pace input change
  const handlePaceChange = (newPMin: string, newPSec: string) => {
    setPaceMins(newPMin);
    setPaceSecs(newPSec);

    const pMinNum = parseInt(newPMin, 10) || 0;
    const pSecNum = parseInt(newPSec, 10) || 0;
    const totalPaceSecs = paceToSeconds(pMinNum, pSecNum);

    if (totalPaceSecs > 0) {
      const formattedP = formatPace(totalPaceSecs, distanceUnit);
      const computedDurSecs = calculateDurationFromPace(totalPaceSecs, distance) || undefined;
      const formattedDur = computedDurSecs ? formatDuration(computedDurSecs) : undefined;

      if (computedDurSecs) {
        const t = secondsToTime(computedDurSecs);
        setHours(t.hours > 0 ? String(t.hours) : '');
        setMinutes(String(t.minutes));
        setSeconds(t.seconds > 0 ? String(t.seconds) : '');
      }

      onChange({
        durationSeconds: computedDurSecs,
        durationFormatted: formattedDur,
        paceSeconds: totalPaceSecs,
        paceFormatted: formattedP,
      });
    } else {
      setHours('');
      setMinutes('');
      setSeconds('');
      onChange({
        durationSeconds: undefined,
        durationFormatted: undefined,
        paceSeconds: undefined,
        paceFormatted: undefined,
      });
    }
  };

  // Clear all time and pace
  const handleClear = () => {
    setHours('');
    setMinutes('');
    setSeconds('');
    setPaceMins('');
    setPaceSecs('');
    onChange({
      durationSeconds: undefined,
      durationFormatted: undefined,
      paceSeconds: undefined,
      paceFormatted: undefined,
    });
  };

  const hasValues = Boolean(
    (durationSeconds && durationSeconds > 0) ||
    (paceSeconds && paceSeconds > 0) ||
    hours || minutes || seconds || paceMins || paceSecs
  );

  return (
    <div className={`strava-time-pace-box ${compact ? 'compact' : ''}`}>
      {/* Header with Mode Toggle & Clear */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xxs uppercase tracking-wider text-muted font-mono block font-bold">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {/* Mode Switcher Tabs */}
          <div className="mode-toggle-pill-group">
            <button
              type="button"
              className={`mode-toggle-btn ${entryMode === 'time' ? 'active' : ''}`}
              onClick={() => setEntryMode('time')}
              title="Record duration (hr/min/sec) & auto-compute pace"
            >
              ⏱️ Time
            </button>
            <button
              type="button"
              className={`mode-toggle-btn ${entryMode === 'pace' ? 'active' : ''}`}
              onClick={() => setEntryMode('pace')}
              title={`Record pace (min/sec per ${distanceUnit}) & auto-compute time`}
            >
              ⚡ Pace
            </button>
          </div>

          {hasValues && (
            <button
              type="button"
              className="text-xxs font-mono text-muted hover:text-danger underline transition-colors"
              onClick={handleClear}
              title="Clear time & pace"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Input Rows based on Mode */}
      {entryMode === 'time' ? (
        <div className="strava-time-row">
          <div className="grid grid-cols-3 gap-2">
            {/* Hours */}
            <div className="strava-field-col">
              <div className="strava-field-box">
                <input
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  className="strava-field-input font-mono"
                  value={hours}
                  onChange={(e) => handleTimeChange(e.target.value, minutes, seconds)}
                />
                <span className="strava-field-unit">hr</span>
              </div>
            </div>

            {/* Minutes */}
            <div className="strava-field-col">
              <div className="strava-field-box">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="00"
                  className="strava-field-input font-mono"
                  value={minutes}
                  onChange={(e) => handleTimeChange(hours, e.target.value, seconds)}
                />
                <span className="strava-field-unit">min</span>
              </div>
            </div>

            {/* Seconds */}
            <div className="strava-field-col">
              <div className="strava-field-box">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="00"
                  className="strava-field-input font-mono"
                  value={seconds}
                  onChange={(e) => handleTimeChange(hours, minutes, e.target.value)}
                />
                <span className="strava-field-unit">sec</span>
              </div>
            </div>
          </div>

          {/* Auto-computed Pace Display */}
          <div className="mt-2 flex items-center justify-between text-xxs font-mono">
            <span className="text-muted">Calculated Pace:</span>
            {paceSeconds && paceSeconds > 0 ? (
              <span className="text-accent font-bold">
                ⚡ {formatPace(paceSeconds, distanceUnit)}
              </span>
            ) : distance > 0 && (hours || minutes || seconds) ? (
              <span className="text-muted italic">Enter valid time</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
        </div>
      ) : (
        <div className="strava-pace-row">
          <div className="grid grid-cols-2 gap-2">
            {/* Pace Minutes */}
            <div className="strava-field-col">
              <div className="strava-field-box">
                <input
                  type="number"
                  min="1"
                  max="59"
                  placeholder="8"
                  className="strava-field-input font-mono"
                  value={paceMins}
                  onChange={(e) => handlePaceChange(e.target.value, paceSecs)}
                />
                <span className="strava-field-unit">min</span>
              </div>
            </div>

            {/* Pace Seconds */}
            <div className="strava-field-col">
              <div className="strava-field-box">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="00"
                  className="strava-field-input font-mono"
                  value={paceSecs}
                  onChange={(e) => handlePaceChange(paceMins, e.target.value)}
                />
                <span className="strava-field-unit">sec /{distanceUnit}</span>
              </div>
            </div>
          </div>

          {/* Auto-computed Duration Display */}
          <div className="mt-2 flex items-center justify-between text-xxs font-mono">
            <span className="text-muted">Calculated Duration:</span>
            {durationSeconds && durationSeconds > 0 ? (
              <span className="text-accent font-bold">
                ⏱️ {formatDuration(durationSeconds)}
              </span>
            ) : distance > 0 && (paceMins || paceSecs) ? (
              <span className="text-muted italic">Enter valid pace</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
