import React, { useState, useMemo } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  UserProfile,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeColor,
  getRunTypeMultiplier,
  calculateRunLoad,
  formatDate,
  getDayName,
} from '../utils/calculations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  allWorkouts: WorkoutRun[];
  onToggleComplete: (run: WorkoutRun, completed: boolean, athleteComment?: string) => void;
  onUpdateRun?: (updatedRun: WorkoutRun, editReason?: string) => void;
  activeDate?: string;
}

export const AssignedRunsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  distanceUnit,
  allWorkouts,
  onToggleComplete,
  onUpdateRun,
  activeDate,
}) => {
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const viewingDate = activeDate || todayStr;

  // View Filter: 'today' = Today's Assigned Runs, 'all_pending' = All Uncompleted Assigned Runs
  const [viewFilter, setViewFilter] = useState<'today' | 'all_pending'>('today');

  // Tracking which run just got checked off for the celebratory animation
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Toast message
  const [actionToast, setActionToast] = useState<string>('');

  // Comment drafts per run ID so athlete can type before or after checking off
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Inline editing state for athlete
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [draftDistance, setDraftDistance] = useState<number>(0);
  const [draftUnit, setDraftUnit] = useState<DistanceUnit>(distanceUnit);
  const [draftDate, setDraftDate] = useState<string>('');
  const [draftRunType, setDraftRunType] = useState<string>('easy');
  const [draftCompleted, setDraftCompleted] = useState<boolean>(false);
  const [draftEditReason, setDraftEditReason] = useState<string>('');

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

  // Start inline editing of an assigned run
  const handleStartEdit = (run: WorkoutRun) => {
    setEditingRunId(run.id);
    setDraftDistance(run.distance);
    setDraftUnit(run.distanceUnit);
    setDraftDate(run.workoutDate);
    setDraftRunType(run.runType);
    setDraftCompleted(run.completed);
    setDraftEditReason(run.editReason || '');
  };

  // Save athlete's edits to the assigned run
  const handleSaveEdit = (originalRun: WorkoutRun) => {
    if (!onUpdateRun) return;
    const mult = getRunTypeMultiplier(draftRunType);
    const newLoad = calculateRunLoad(draftDistance, draftUnit, mult);

    const updatedRun: WorkoutRun = {
      ...originalRun,
      workoutDate: draftDate,
      distance: draftDistance,
      distanceUnit: draftUnit,
      runType: draftRunType,
      multiplier: mult,
      load: newLoad,
      completed: draftCompleted,
      editReason: draftEditReason.trim(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateRun(updatedRun, draftEditReason.trim());
    setEditingRunId(null);
    setActionToast('✓ Workout edited & coach updated!');
    setTimeout(() => setActionToast(''), 2500);
  };

  // Toggle checkmark with athlete comment
  const handleCheckmarkClick = (run: WorkoutRun) => {
    const nextCompleted = !run.completed;
    const currentComment = commentDrafts[run.id] !== undefined
      ? commentDrafts[run.id]
      : run.athleteComment || '';

    if (nextCompleted) {
      // Trigger feel-good completion animation
      setJustCompletedId(run.id);
      setTimeout(() => {
        setJustCompletedId(null);
      }, 2500);
    }

    onToggleComplete(run, nextCompleted, currentComment);
  };

  // Save comment manually without re-toggling completed state
  const handleSaveComment = (run: WorkoutRun) => {
    const comment = commentDrafts[run.id];
    if (comment === undefined) return;

    onToggleComplete(run, run.completed, comment);
    setActionToast('✓ Comment saved for coach!');
    setTimeout(() => setActionToast(''), 2200);
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
                Athlete Schedule · Daily Check-Off &amp; Edit
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
          {actionToast && (
            <div className="inweek-ribbon inweek-ribbon-optimal mb-3">
              <span className="font-mono text-sm font-bold text-success">
                {actionToast}
              </span>
            </div>
          )}

          {displayedRuns.length === 0 ? (
            <div className="empty-day-box py-10 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <h4 className="font-bold text-sm mb-1 text-primary">
                {viewFilter === 'today' ? 'All clear for today!' : 'No pending workouts!'}
              </h4>
              <p className="text-muted text-xs max-w-sm mx-auto">
                {viewFilter === 'today'
                  ? `No coach-assigned workouts scheduled for ${formattedToday}. Rest up or log a run using the + button!`
                  : 'You have completed all workouts prescribed by your coach. Great job staying on top of your training!'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedRuns.map((run) => {
                const isEditing = editingRunId === run.id;
                const isCompleted = run.completed;
                const isJustFinished = justCompletedId === run.id;
                const color = getRunTypeColor(run.runType);
                const mult = run.multiplier || getRunTypeMultiplier(run.runType);
                const currentDraftComment = commentDrafts[run.id] ?? run.athleteComment ?? '';

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
                    {/* Header Row: Date, Category badge, Coach attribution & Edit button */}
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
                        {run.editReason && (
                          <span className="badge-safe text-xxs font-mono" title={run.editReason}>
                            MODIFIED
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xxs font-mono text-muted uppercase hidden sm:inline">
                          Coach {run.assignedByCoachName || 'Michael Carey'}
                        </span>
                        <button
                          type="button"
                          className="btn-filter-pill text-xxs font-mono py-0.5 px-2.5"
                          onClick={() => {
                            if (isEditing) {
                              setEditingRunId(null);
                            } else {
                              handleStartEdit(run);
                            }
                          }}
                        >
                          {isEditing ? 'Cancel Edit' : '✏️ Edit'}
                        </button>
                      </div>
                    </div>

                    {/* ==================================================== */}
                    {/* STANDARD VIEW: Metrics, Coach Notes, Post-Run Feedback */}
                    {/* ==================================================== */}
                    {!isEditing && (
                      <>
                        {/* Middle Row: Metrics & Coach Focus Notes */}
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
                                Workload
                              </span>
                              <strong className="text-lg font-mono text-primary font-bold">
                                {run.load.toFixed(1)}
                              </strong>
                            </div>
                          </div>

                          {/* Coach Instructions */}
                          <div className="p-2.5 rounded bg-surface-subtle flex flex-col justify-center">
                            <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-0.5">
                              Coach Focus Instructions
                            </span>
                            <p className="text-xs text-secondary italic font-sans m-0">
                              {run.comments ? `"${run.comments}"` : 'Execute smoothly and comfortably.'}
                            </p>
                          </div>
                        </div>

                        {/* Optional Athlete Post-Run Comment for Coach */}
                        <div className="athlete-comment-box p-2.5 rounded bg-surface border border-subtle mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xxs uppercase tracking-wider text-accent font-mono font-bold block">
                              Your Comment / Feedback for Coach (Optional)
                            </label>
                            {commentDrafts[run.id] !== undefined && commentDrafts[run.id] !== (run.athleteComment || '') && (
                              <button
                                type="button"
                                className="text-xxs font-mono font-bold text-accent hover:underline"
                                onClick={() => handleSaveComment(run)}
                              >
                                Save Note ✓
                              </button>
                            )}
                          </div>
                          <textarea
                            rows={2}
                            className="textarea-notes text-xs"
                            value={currentDraftComment}
                            onChange={(e) =>
                              setCommentDrafts({
                                ...commentDrafts,
                                [run.id]: e.target.value,
                              })
                            }
                            placeholder="How did this run feel? Pace, cadence, soreness, weather (Coach will see this)..."
                          />
                        </div>

                        {/* Feel-Good Checkmark Completion Bar */}
                        <div className="flex items-center justify-between pt-1">
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
                      </>
                    )}

                    {/* ==================================================== */}
                    {/* ATHLETE EDIT VIEW: Edit Distance, Type, Date & Reason */}
                    {/* ==================================================== */}
                    {isEditing && (
                      <div className="athlete-edit-panel p-3 rounded bg-surface border border-accent mt-2 animate-in">
                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-subtle">
                          <span className="text-xs font-mono font-bold text-accent uppercase">
                            Edit Workout Parameters
                          </span>
                          <span className="text-xxs font-mono text-muted">
                            New Workload: {(draftDistance * getRunTypeMultiplier(draftRunType)).toFixed(1)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-2.5">
                          {/* Distance & Unit */}
                          <div>
                            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                              Distance
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                className="input-field text-xs font-mono flex-1"
                                value={draftDistance || ''}
                                onChange={(e) => setDraftDistance(parseFloat(e.target.value) || 0)}
                              />
                              <button
                                type="button"
                                className="btn-unit-pill font-mono text-xs px-2"
                                onClick={() => setDraftUnit(draftUnit === 'mi' ? 'km' : 'mi')}
                              >
                                {draftUnit.toUpperCase()}
                              </button>
                            </div>
                          </div>

                          {/* Workout Date */}
                          <div>
                            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              className="input-field text-xs font-mono w-full"
                              value={draftDate}
                              onChange={(e) => setDraftDate(e.target.value)}
                            />
                          </div>

                          {/* Completed Status */}
                          <div>
                            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                              Status
                            </label>
                            <label className="flex items-center gap-2 mt-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draftCompleted}
                                onChange={(e) => setDraftCompleted(e.target.checked)}
                              />
                              <span className="text-xs font-mono">
                                {draftCompleted ? '✓ Completed' : '⏳ Planned'}
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Run Category Chips */}
                        <div className="mb-2.5">
                          <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                            Run Category
                          </label>
                          <div className="workout-chips-grid">
                            {DEFAULT_RUN_TYPES.map((t) => {
                              const isSelected = draftRunType === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={`btn-type-chip ${isSelected ? 'btn-type-chip-active' : ''}`}
                                  style={{
                                    borderColor: isSelected ? t.color : undefined,
                                    backgroundColor: isSelected ? `${t.color}22` : undefined,
                                  }}
                                  onClick={() => setDraftRunType(t.id)}
                                >
                                  <span className="chip-color-dot" style={{ backgroundColor: t.color }} />
                                  <span className="chip-name-text">{t.name}</span>
                                  <span className="text-xxs font-mono text-muted">×{t.multiplier}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Optional Reason for Edit for Coach */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                              Reason for Edit (Optional · Visible to Coach)
                            </label>
                            <span className="text-xxs font-mono text-muted italic">Not required</span>
                          </div>
                          <textarea
                            rows={2}
                            className="textarea-notes text-xs"
                            value={draftEditReason}
                            onChange={(e) => setDraftEditReason(e.target.value)}
                            placeholder="Why was the run changed? (e.g. cut 1 mile short due to calf tightness, shifted tempo to easy due to fatigue...)"
                          />
                        </div>

                        {/* Edit Action Buttons */}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="btn-modal-cancel text-xs py-1 px-3"
                            onClick={() => setEditingRunId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-action-primary text-xs py-1 px-3"
                            onClick={() => handleSaveEdit(run)}
                          >
                            Save Changes ✓
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer flex items-center justify-between">
          <span className="text-xxs font-mono text-muted">
            Checking off or editing a workout automatically logs your workload &amp; updates your coach
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
