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
  formatDate,
  getDayName,
} from '../utils/calculations';
import { ROSTER_USERS } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  onSaveRun: (run: WorkoutRun) => void;
  activeDate?: string;
  selectedAthleteFilter?: string;
}

export const QuickLogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  distanceUnit,
  onSaveRun,
  activeDate,
  selectedAthleteFilter,
}) => {
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const initialDate = activeDate || todayStr;

  // Selected date for the logged run
  const [date, setDate] = useState<string>(initialDate);

  // Target athlete (if coach, can assign/log for specific athlete or self; runner logs for self)
  const isCoach = currentUser.role === 'coach';
  const [athleteId, setAthleteId] = useState<string>(() => {
    if (isCoach && selectedAthleteFilter && selectedAthleteFilter !== 'all') {
      return selectedAthleteFilter;
    }
    return currentUser.id;
  });

  const targetAthlete = useMemo(() => {
    return ROSTER_USERS.find((u) => u.id === athleteId) || currentUser;
  }, [athleteId, currentUser]);

  // Run parameters
  const [distance, setDistance] = useState<number>(5.0);
  const [unit, setUnit] = useState<DistanceUnit>(distanceUnit);
  const [runType, setRunType] = useState<string>('easy');
  const [comments, setComments] = useState<string>('');
  const [completed, setCompleted] = useState<boolean>(true);
  const [successToast, setSuccessToast] = useState<string>('');

  // Math totals
  const multiplier = getRunTypeMultiplier(runType);
  const load = calculateRunLoad(distance, unit, multiplier);

  const formattedDay = useMemo(() => {
    if (!date) return '';
    try {
      const [y, m, d] = date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  }, [date]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || distance <= 0) return;

    const baseTime = Date.now();
    const newRun: WorkoutRun = {
      id: `run_quick_${baseTime}_${Math.random().toString(36).slice(2, 6)}`,
      workoutDate: date,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier,
      load,
      comments: comments.trim(),
      completed,
      isPlanAssigned: false,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
      updatedAt: new Date().toISOString(),
    };

    onSaveRun(newRun);
    setSuccessToast(`✓ Logged ${distance} ${unit.toUpperCase()} ${runType.replace('_', ' ')} run!`);

    setTimeout(() => {
      setSuccessToast('');
      onClose();
    }, 1100);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-md animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span className="quick-add-plus-badge">+</span>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Quick Activity Logger
              </span>
              <h2 id="quick-log-title" className="modal-title">
                Log a Run
              </h2>
            </div>
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4">
            {successToast && (
              <div className="inweek-ribbon inweek-ribbon-optimal mb-3">
                <span className="font-mono text-sm font-bold text-success">
                  {successToast}
                </span>
              </div>
            )}

            {/* Target Athlete (only selectable if Coach) */}
            {isCoach && (
              <div className="p-2.5 rounded bg-surface border border-subtle">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Runner
                  </label>
                  <span className="text-xxs font-mono text-accent font-bold">
                    Logging for: {targetAthlete.name}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROSTER_USERS.map((user) => {
                    const isSelected = athleteId === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`text-xs px-2.5 py-1 rounded font-mono transition-all ${
                          isSelected
                            ? 'bg-accent text-white font-bold'
                            : 'bg-surface-elevated text-primary border border-subtle'
                        }`}
                        onClick={() => setAthleteId(user.id)}
                      >
                        {user.name} {user.id === currentUser.id ? '(You)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                  Date
                </label>
                <span className="text-xs font-mono text-primary font-bold">
                  {formattedDay} ({getDayName(date)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input-field text-xs font-mono flex-1"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-filter-pill text-xs font-mono py-1 px-2.5"
                  onClick={() => setDate(todayStr)}
                >
                  Today
                </button>
              </div>
            </div>

            {/* Distance & Load */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Distance
                </label>
                <div className="hero-distance-input-box">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="hero-distance-input font-mono"
                    value={distance || ''}
                    placeholder="5.0"
                    onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
                    required
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

              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Workload Stress
                </label>
                <div className="hero-load-pill font-mono flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-muted">
                    {distance} {unit} × {multiplier.toFixed(1)}
                  </span>
                  <span className="text-lg font-bold text-primary">{load.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Run Category */}
            <div>
              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1.5">
                Run Category
              </label>
              <div className="workout-chips-grid">
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
            </div>

            {/* Completion Status Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-subtle">
              <div>
                <span className="text-xs font-mono font-bold block text-primary">
                  Status
                </span>
                <span className="text-xxs text-muted font-mono">
                  {completed ? 'Workout completed and executed' : 'Planned workout'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                <span className="ml-2 text-xs font-mono font-semibold text-primary">
                  {completed ? '✓ Completed' : '⏳ Planned'}
                </span>
              </label>
            </div>

            {/* Optional Notes */}
            <div>
              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                Workout Notes (Optional)
              </label>
              <textarea
                rows={2}
                className="textarea-notes text-xs"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="How did the run feel? Pace, cadence, weather..."
              />
            </div>
          </div>

          <div className="modal-footer flex items-center justify-between">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-action-primary flex items-center gap-1.5"
              disabled={distance <= 0}
            >
              <span>Log Run</span>
              <span className="font-mono text-xs">({load.toFixed(1)} load) →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
