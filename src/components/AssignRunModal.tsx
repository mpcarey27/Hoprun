import React, { useState, useMemo } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  UserProfile,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  calculateRunLoad,
  convertDistance,
  formatDate,
  addDays,
  generateRecurringDates,
} from '../utils/calculations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  onAssignRuns: (newRuns: WorkoutRun[], notificationText: string) => void;
  activeDate?: string;
}

const DAY_LABELS = [
  { day: 1, label: 'Mon', full: 'Monday' },
  { day: 2, label: 'Tue', full: 'Tuesday' },
  { day: 3, label: 'Wed', full: 'Wednesday' },
  { day: 4, label: 'Thu', full: 'Thursday' },
  { day: 5, label: 'Fri', full: 'Friday' },
  { day: 6, label: 'Sat', full: 'Saturday' },
  { day: 0, label: 'Sun', full: 'Sunday' },
];

export const AssignRunModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  distanceUnit,
  onAssignRuns,
  activeDate,
}) => {
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const initialStart = activeDate || todayStr;

  // Run Configuration
  const [distance, setDistance] = useState<number>(10);
  const [unit, setUnit] = useState<DistanceUnit>(distanceUnit);
  const [runType, setRunType] = useState<string>('easy');
  const [instructions, setInstructions] = useState<string>('Easy Zone 2 aerobic run');

  // Date Range
  const [startDate, setStartDate] = useState<string>(initialStart);
  // Default end date to Dec 31 of current year or 8 weeks out
  const [endDate, setEndDate] = useState<string>(() => {
    const currentYear = new Date().getFullYear();
    const defaultEnd = `${currentYear}-12-31`;
    return defaultEnd >= initialStart ? defaultEnd : addDays(initialStart, 56);
  });

  // Repeating Days: Default to Monday & Wednesday (matching coach example)
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3]);
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1);

  // Success message toast
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Toggle single day
  const handleToggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  // Day preset helpers
  const handleSelectPreset = (days: number[]) => {
    setSelectedDays(days);
  };

  // Computed matching dates
  const matchingDates = useMemo(() => {
    return generateRecurringDates({
      startDate,
      endDate,
      selectedDays,
      intervalWeeks,
    });
  }, [startDate, endDate, selectedDays, intervalWeeks]);

  // Math totals
  const multiplier = getRunTypeMultiplier(runType);
  const loadPerRun = calculateRunLoad(distance, unit, multiplier);
  const totalVolumeMiles = useMemo(() => {
    const mi = convertDistance(distance, unit, 'mi');
    return Number((mi * matchingDates.length).toFixed(1));
  }, [distance, unit, matchingDates.length]);
  const totalWorkloadStress = Number((loadPerRun * matchingDates.length).toFixed(1));

  const handleAssign = () => {
    if (matchingDates.length === 0 || distance <= 0) return;

    const baseTime = Date.now();
    const newRuns: WorkoutRun[] = matchingDates.map((dateStr, idx) => ({
      id: `run_assigned_${baseTime}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      workoutDate: dateStr,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier,
      load: loadPerRun,
      comments: instructions.trim() || `Coach ${currentUser.name || 'Admin'} assigned ${runType} run`,
      completed: false, // Planned workout for athlete to complete
      isPlanAssigned: true,
      updatedAt: new Date().toISOString(),
    }));

    const daysSummary = selectedDays
      .map((d) => DAY_LABELS.find((l) => l.day === d)?.label)
      .filter(Boolean)
      .join(', ');

    const notifMsg = `Coach assigned ${newRuns.length} runs: ${distance} ${unit.toUpperCase()} ${runType.replace('_', ' ')} on ${daysSummary} (${startDate} through ${endDate})`;

    onAssignRuns(newRuns, notifMsg);
    setSuccessMessage(`✓ Assigned ${newRuns.length} workouts!`);
    setTimeout(() => {
      setSuccessMessage('');
      onClose();
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-lg animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-run-title"
      >
        <div className="modal-header">
          <div>
            <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
              Coach Prescription Tool
            </span>
            <h2 id="assign-run-title" className="modal-title flex items-center gap-2">
              <span>Assign Run</span>
              <span className="badge-safe text-xxs font-mono">COACH ONLY</span>
            </h2>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {successMessage && (
            <div className="inweek-ribbon inweek-ribbon-optimal mb-4">
              <span className="font-mono text-sm font-bold text-success">
                {successMessage}
              </span>
            </div>
          )}

          {/* Section 1: Workout Prescription */}
          <div className="assign-section">
            <h3 className="section-label font-mono text-xs text-white uppercase mb-2">
              1. Workout Prescription
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {/* Distance Input with Unit Toggle */}
              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Target Distance
                </label>
                <div className="hero-distance-input-box">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="hero-distance-input font-mono"
                    value={distance || ''}
                    placeholder="10.0"
                    onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
                  />
                  <button
                    type="button"
                    className="btn-unit-pill font-mono"
                    onClick={() => setUnit(unit === 'mi' ? 'km' : 'mi')}
                    title="Toggle unit"
                  >
                    {unit.toUpperCase()}
                  </button>
                </div>
              </div>

              {/* Stress per run badge */}
              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Workload Stress Per Run
                </label>
                <div className="hero-load-pill font-mono flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-muted">
                    {distance} {unit} × {multiplier.toFixed(1)}
                  </span>
                  <span className="text-lg font-bold text-primary">{loadPerRun.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Run Category Selector */}
            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1.5">
              Run Category & Intensity Multiplier
            </label>
            <div className="workout-chips-grid mb-3">
              {DEFAULT_RUN_TYPES.map((t) => {
                const isSelected = runType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`btn-type-chip ${isSelected ? 'btn-type-chip-active' : ''}`}
                    style={{
                      borderColor: isSelected ? t.color : undefined,
                      backgroundColor: isSelected ? `${t.color}22` : undefined,
                    }}
                    onClick={() => setRunType(t.id)}
                  >
                    <span className="chip-color-dot" style={{ backgroundColor: t.color }} />
                    <span className="chip-name-text">{t.name}</span>
                    <span className="text-xxs font-mono text-muted">×{t.multiplier}</span>
                  </button>
                );
              })}
            </div>

            {/* Coach Instructions */}
            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
              Coach Instructions & Focus Notes
            </label>
            <textarea
              rows={2}
              className="textarea-notes"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. 10 mile aerobic zone 2 run, keep cadence smooth, negative split final 2 miles..."
            />
          </div>

          <div className="settings-divider" />

          {/* Section 2: Repeating Schedule Options */}
          <div className="assign-section">
            <h3 className="section-label font-mono text-xs text-white uppercase mb-2">
              2. Repeating Days & Schedule
            </h3>

            {/* Days of week selector pills */}
            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1.5">
              Repeat On (Select Multiple Days):
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DAY_LABELS.map(({ day, label, full }) => {
                const isSelected = selectedDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`btn-day-picker-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => handleToggleDay(day)}
                    title={full}
                  >
                    <span className="font-mono text-xs font-bold">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick preset buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <span className="text-xxs font-mono text-muted mr-1">Presets:</span>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([1, 3])}
              >
                Mon & Wed
              </button>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([1, 3, 5])}
              >
                Mon, Wed, Fri
              </button>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([2, 4])}
              >
                Tue & Thu
              </button>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([1, 2, 3, 4, 5])}
              >
                Weekdays
              </button>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([0, 6])}
              >
                Weekends
              </button>
              <button
                type="button"
                className="btn-preset-pill"
                onClick={() => handleSelectPreset([0, 1, 2, 3, 4, 5, 6])}
              >
                Every Day
              </button>
            </div>

            {/* Date Range Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  className="input-field text-xs font-mono w-full"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Repeat Until Date
                </label>
                <input
                  type="date"
                  className="input-field text-xs font-mono w-full"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Cadence
                </label>
                <select
                  className="select-field text-xs font-mono w-full"
                  value={intervalWeeks}
                  onChange={(e) => setIntervalWeeks(Number(e.target.value))}
                >
                  <option value={1}>Every week</option>
                  <option value={2}>Every 2 weeks (Bi-weekly)</option>
                  <option value={3}>Every 3 weeks</option>
                  <option value={4}>Every 4 weeks</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Schedule Calculation & Preview */}
          <div className="assign-summary-box">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <span className="font-mono text-xs text-muted uppercase block">
                  Generated Schedule Summary
                </span>
                <strong className="text-sm font-mono text-white">
                  {matchingDates.length} Runs Assigned
                </strong>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted">
                  Total Dist: <strong className="text-white">{totalVolumeMiles} mi</strong>
                </span>
                <span className="text-xs font-mono text-primary font-bold">
                  Total Stress: {totalWorkloadStress} pts
                </span>
              </div>
            </div>

            {/* Scrollable list of matched dates */}
            {matchingDates.length > 0 ? (
              <div className="matched-dates-chip-list">
                {matchingDates.map((dStr) => {
                  const [y, m, d] = dStr.split('-').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const formatted = dateObj.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <span key={dStr} className="matched-date-pill font-mono text-xxs">
                      {formatted}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-danger font-mono mt-1">
                No dates matched. Please select at least one day of the week and ensure the end date is on or after the start date.
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-action-primary"
            disabled={matchingDates.length === 0 || distance <= 0}
            onClick={handleAssign}
          >
            Assign {matchingDates.length} Runs to Calendar →
          </button>
        </div>
      </div>
    </div>
  );
};
