import React, { useState, useMemo } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  UserProfile,
} from '../types/acr';
import {
  getRunTypeColor,
  getRunTypeMultiplier,
  formatDate,
  getDayName,
} from '../utils/calculations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  allWorkouts: WorkoutRun[];
  onToggleComplete: (run: WorkoutRun, completed: boolean) => void;
  activeDate?: string;
}

export const AssignedRunsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  allWorkouts,
  onToggleComplete,
  activeDate,
}) => {
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const viewingDate = activeDate || todayStr;

  // View Filter: 'today' = Today's Assigned Runs, 'all_pending' = All Uncompleted Assigned Runs
  const [viewFilter, setViewFilter] = useState<'today' | 'all_pending'>('today');

  // Tracking which run just got checked off for the celebratory animation
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Filter athlete's coach-assigned runs
  const athleteAssignedRuns = useMemo(() => {
    return allWorkouts.filter((w) => {
      const isForAthlete =
        w.athleteId === currentUser.id ||
        (w.athleteName &&
          w.athleteName.toLowerCase().includes(currentUser.name.toLowerCase()));
      const isAssigned = w.isPlanAssigned || w.assignedByCoachId !== undefined;
      return isForAthlete && isAssigned;
    });
  }, [allWorkouts, currentUser]);

  // Today's assigned runs
  const todayAssignedRuns = useMemo(() => {
    return athleteAssignedRuns.filter((w) => w.workoutDate === viewingDate);
  }, [athleteAssignedRuns, viewingDate]);

  // All pending assigned runs
  const allPendingRuns = useMemo(() => {
    return athleteAssignedRuns
      .filter((w) => !w.completed)
      .sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
  }, [athleteAssignedRuns]);

  const displayedRuns = viewFilter === 'today' ? todayAssignedRuns : allPendingRuns;

  // Formatted date string
  const formattedToday = useMemo(() => {
    try {
      const [y, m, d] = viewingDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return viewingDate;
    }
  }, [viewingDate]);

  if (!isOpen) return null;

  const handleCheckmarkClick = (run: WorkoutRun) => {
    const nextCompleted = !run.completed;

    if (nextCompleted) {
      // Trigger feel-good completion animation
      setJustCompletedId(run.id);
      setTimeout(() => {
        setJustCompletedId(null);
      }, 2500);
    }

    onToggleComplete(run, nextCompleted);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-lg animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assigned-runs-title"
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span className="assigned-check-header-icon">✓</span>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Athlete Schedule · Daily Check-Off
              </span>
              <h2 id="assigned-runs-title" className="modal-title">
                Assigned Workouts
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

        {/* Filter Pills: Today vs All Pending */}
        <div className="flex items-center justify-between px-6 pt-3 pb-2 border-b border-subtle bg-surface">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`tab-pill ${viewFilter === 'today' ? 'tab-pill-active' : ''}`}
              onClick={() => setViewFilter('today')}
            >
              Today ({todayAssignedRuns.length})
            </button>
            <button
              type="button"
              className={`tab-pill ${viewFilter === 'all_pending' ? 'tab-pill-active' : ''}`}
              onClick={() => setViewFilter('all_pending')}
            >
              All Pending ({allPendingRuns.length})
            </button>
          </div>

          <span className="text-xs font-mono font-semibold text-secondary hidden md:inline">
            {formattedToday}
          </span>
        </div>

        <div className="modal-body">
          {displayedRuns.length === 0 ? (
            <div className="empty-day-box py-10 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <h4 className="font-bold text-sm mb-1 text-primary">
                {viewFilter === 'today' ? 'All clear for today!' : 'No pending workouts!'}
              </h4>
              <p className="text-muted text-xs max-w-sm mx-auto">
                {viewFilter === 'today'
                  ? `No coach-assigned workouts scheduled for ${formattedToday}. Rest up or log an easy recovery run using the + button!`
                  : 'You have completed all workouts prescribed by your coach. Great job staying on top of your training!'}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {displayedRuns.map((run) => {
                const isCompleted = run.completed;
                const isJustFinished = justCompletedId === run.id;
                const color = getRunTypeColor(run.runType);
                const mult = run.multiplier || getRunTypeMultiplier(run.runType);

                return (
                  <div
                    key={run.id}
                    className={`assigned-run-card transition-all ${
                      isCompleted ? 'assigned-run-completed' : 'assigned-run-pending'
                    } ${isJustFinished ? 'assigned-run-celebrating' : ''}`}
                    style={{
                      borderLeftColor: color,
                    }}
                  >
                    {/* Top Row: Date, Category badge, Coach attribution */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {run.workoutDate} ({getDayName(run.workoutDate)})
                        </span>
                        <span
                          className="text-xxs font-mono font-bold px-2 py-0.5 rounded border"
                          style={{
                            color,
                            backgroundColor: `${color}18`,
                            borderColor: color,
                          }}
                        >
                          {run.runType.replace('_', ' ').toUpperCase()} (×{mult})
                        </span>
                      </div>

                      <span className="text-xxs font-mono text-muted uppercase">
                        Prescribed by Coach {run.assignedByCoachName || 'Michael Carey'}
                      </span>
                    </div>

                    {/* Middle Row: Metrics & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div className="flex items-center gap-3 p-2.5 rounded bg-surface-subtle">
                        <div>
                          <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                            Distance
                          </span>
                          <strong className="text-lg font-mono text-primary">
                            {run.distance} {run.distanceUnit.toUpperCase()}
                          </strong>
                        </div>
                        <div className="h-6 w-px bg-border-subtle" />
                        <div>
                          <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                            Workload Stress
                          </span>
                          <strong className="text-lg font-mono text-primary font-bold">
                            {run.load.toFixed(1)}
                          </strong>
                        </div>
                      </div>

                      {/* Coach Notes */}
                      <div className="p-2.5 rounded bg-surface-subtle flex flex-col justify-center">
                        <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-0.5">
                          Coach Focus Notes
                        </span>
                        <p className="text-xs text-secondary italic font-sans m-0">
                          {run.comments ? `"${run.comments}"` : 'No specific instructions. Execute smoothly.'}
                        </p>
                      </div>
                    </div>

                    {/* Feel-Good Checkmark Completion Bar */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <div className="flex items-center gap-2">
                            <span className="completion-badge-pill">
                              <span className="completion-star-icon">✨</span>
                              <span>Completed</span>
                            </span>
                            {isJustFinished && (
                              <span className="celebration-toast-text animate-pulse">
                                🎉 Crushed it! Great workout!
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-muted">
                            Tap checkmark when workout is finished:
                          </span>
                        )}
                      </div>

                      {/* Delightful Interactive Checkmark Button */}
                      <button
                        type="button"
                        className={`delightful-check-btn ${
                          isCompleted ? 'is-checked' : 'is-unchecked'
                        } ${isJustFinished ? 'just-checked-pop' : ''}`}
                        onClick={() => handleCheckmarkClick(run)}
                        title={isCompleted ? 'Mark as Planned / Incomplete' : 'Check off as Completed'}
                        aria-pressed={isCompleted}
                      >
                        <div className="check-btn-inner">
                          {/* Animated Sparkle Burst Graphic on Completion */}
                          {isJustFinished && (
                            <div className="sparkle-burst-container" aria-hidden="true">
                              <span className="burst-star s1">✦</span>
                              <span className="burst-star s2">★</span>
                              <span className="burst-star s3">✦</span>
                              <span className="burst-star s4">★</span>
                              <span className="burst-star s5">✦</span>
                              <span className="burst-star s6">★</span>
                            </div>
                          )}

                          <svg
                            className="check-svg-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle
                              className="check-circle-ring"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                            <path
                              className="check-mark-path"
                              d="M7 12.5L10.5 16L17 9.5"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>

                          <span className="check-btn-label font-mono text-xs font-bold">
                            {isCompleted ? 'Completed ✓' : 'Mark Complete'}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer flex items-center justify-between">
          <span className="text-xxs font-mono text-muted">
            Checking off a run automatically logs load &amp; notifies your coach
          </span>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
