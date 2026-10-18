import React, { useState, useMemo, useEffect } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  UserProfile,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  getRunTypeColor,
  calculateRunLoad,
  formatDate,
  getDayName,
} from '../utils/calculations';
import { ROSTER_USERS } from '../utils/storage';
import { StravaTimePacePicker } from './StravaTimePacePicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  onAssignRuns: (newRuns: WorkoutRun[], notificationText: string) => void;
  activeDate?: string;
  allWorkouts?: WorkoutRun[];
  onUpdateRun?: (updatedRun: WorkoutRun) => void;
  onDeleteRun?: (runId: string) => void;
}

export const AssignRunModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  distanceUnit,
  onAssignRuns,
  activeDate,
  allWorkouts = [],
  onUpdateRun,
  onDeleteRun,
}) => {
  const isCoach = currentUser.role === 'coach';
  const todayStr = useMemo(() => formatDate(new Date()), []);

  // Modal Mode Tab: 'assign' = Assign Single Run, 'edit' = Manage & Edit Previously Assigned Runs
  const [activeTab, setActiveTab] = useState<'assign' | 'edit'>('assign');

  // -------------------------------------------------------------
  // Assign Tab State: 1 Athlete, 1 Run, 1 Date (No Repeating)
  // -------------------------------------------------------------
  // Default target athlete to Rob (or coach themselves if selected)
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(() => {
    const rob = ROSTER_USERS.find((u) => u.name.toLowerCase().includes('rob'));
    return rob ? rob.id : currentUser.id;
  });

  const selectedAthlete = useMemo(() => {
    return ROSTER_USERS.find((u) => u.id === selectedAthleteId) || currentUser;
  }, [selectedAthleteId, currentUser]);

  // Single date for the assigned run (default to activeDate or today)
  const [workoutDate, setWorkoutDate] = useState<string>(() => activeDate || todayStr);

  useEffect(() => {
    if (activeDate) {
      setWorkoutDate(activeDate);
    }
  }, [activeDate, isOpen]);

  // Run Configuration: distance, unit, runType, instructions
  const [distance, setDistance] = useState<number>(8);
  const [unit, setUnit] = useState<DistanceUnit>(distanceUnit);
  const [runType, setRunType] = useState<string>('long_run');
  const [instructions, setInstructions] = useState<string>('');

  // Target Pace & Time for Assigned Run (Optional)
  const [targetDurationSeconds, setTargetDurationSeconds] = useState<number | undefined>(undefined);
  const [targetDurationFormatted, setTargetDurationFormatted] = useState<string | undefined>(undefined);
  const [targetPaceSeconds, setTargetPaceSeconds] = useState<number | undefined>(undefined);
  const [targetPaceFormatted, setTargetPaceFormatted] = useState<string | undefined>(undefined);

  // Success message toast
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Formatted date string (e.g. "Monday, Oct 19, 2026")
  const formattedDate = useMemo(() => {
    if (!workoutDate) return '';
    try {
      const [y, m, d] = workoutDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return workoutDate;
    }
  }, [workoutDate]);

  // Math totals for single run
  const multiplier = getRunTypeMultiplier(runType);
  const load = calculateRunLoad(distance, unit, multiplier);

  // -------------------------------------------------------------
  // Edit Previously Assigned Runs State
  // -------------------------------------------------------------
  const [editAthleteFilter, setEditAthleteFilter] = useState<string>('all');
  const [editSearchQuery, setEditSearchQuery] = useState<string>('');
  const [editingRunId, setEditingRunId] = useState<string | null>(null);

  // Draft state for inline editing
  const [draftAthleteId, setDraftAthleteId] = useState<string>('');
  const [draftDate, setDraftDate] = useState<string>('');
  const [draftDistance, setDraftDistance] = useState<number>(0);
  const [draftUnit, setDraftUnit] = useState<DistanceUnit>('mi');
  const [draftRunType, setDraftRunType] = useState<string>('easy');
  const [draftComments, setDraftComments] = useState<string>('');
  const [draftCompleted, setDraftCompleted] = useState<boolean>(false);

  // Draft timing state
  const [draftDurationSeconds, setDraftDurationSeconds] = useState<number | undefined>(undefined);
  const [draftDurationFormatted, setDraftDurationFormatted] = useState<string | undefined>(undefined);
  const [draftPaceSeconds, setDraftPaceSeconds] = useState<number | undefined>(undefined);
  const [draftPaceFormatted, setDraftPaceFormatted] = useState<string | undefined>(undefined);

  // Computed list of previously assigned runs
  const previouslyAssignedRuns = useMemo(() => {
    return allWorkouts.filter(
      (w) => w.isPlanAssigned || w.assignedByCoachId !== undefined
    );
  }, [allWorkouts]);

  const filteredAssignedRuns = useMemo(() => {
    return previouslyAssignedRuns.filter((run) => {
      if (editAthleteFilter !== 'all') {
        const matchesAthlete =
          run.athleteId === editAthleteFilter ||
          (run.athleteName &&
            run.athleteName.toLowerCase().includes(editAthleteFilter.toLowerCase()));
        if (!matchesAthlete) return false;
      }
      if (editSearchQuery.trim()) {
        const q = editSearchQuery.toLowerCase();
        const matchesSearch =
          run.workoutDate.includes(q) ||
          run.runType.toLowerCase().includes(q) ||
          (run.comments && run.comments.toLowerCase().includes(q)) ||
          (run.athleteName && run.athleteName.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      return true;
    }).sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
  }, [previouslyAssignedRuns, editAthleteFilter, editSearchQuery]);

  // Assign single run to the selected athlete
  const handleAssign = () => {
    if (!workoutDate || distance <= 0) return;

    const baseTime = Date.now();
    const newRun: WorkoutRun = {
      id: `run_assigned_${baseTime}_${Math.random().toString(36).slice(2, 6)}`,
      workoutDate,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier,
      load,
      comments: instructions.trim() || `Coach ${currentUser.name || 'Michael Carey'} assigned ${runType.replace('_', ' ')} run`,
      completed: false, // Planned workout for athlete to complete
      isPlanAssigned: true,
      athleteId: selectedAthlete.id,
      athleteName: selectedAthlete.name,
      assignedByCoachId: currentUser.id,
      assignedByCoachName: currentUser.name,
      durationSeconds: targetDurationSeconds,
      durationFormatted: targetDurationFormatted,
      paceSeconds: targetPaceSeconds,
      paceFormatted: targetPaceFormatted,
      updatedAt: new Date().toISOString(),
    };

    const notifMsg = `Coach ${currentUser.name || 'Michael Carey'} assigned a ${distance} ${unit.toUpperCase()} ${runType.replace('_', ' ')} run to ${selectedAthlete.name} for ${formattedDate}${targetPaceFormatted ? ` (Target: ${targetPaceFormatted})` : ''}`;

    onAssignRuns([newRun], notifMsg);
    setSuccessMessage(`✓ Successfully assigned run to ${selectedAthlete.name} for ${formattedDate}!`);
    setTimeout(() => {
      setSuccessMessage('');
      onClose();
    }, 1200);
  };

  // Start editing a previously assigned run
  const handleStartEditRun = (run: WorkoutRun) => {
    setEditingRunId(run.id);
    setDraftAthleteId(run.athleteId || selectedAthleteId);
    setDraftDate(run.workoutDate);
    setDraftDistance(run.distance);
    setDraftUnit(run.distanceUnit);
    setDraftRunType(run.runType);
    setDraftComments(run.comments || '');
    setDraftCompleted(run.completed);
    setDraftDurationSeconds(run.durationSeconds);
    setDraftDurationFormatted(run.durationFormatted);
    setDraftPaceSeconds(run.paceSeconds);
    setDraftPaceFormatted(run.paceFormatted);
  };

  // Save changes to previously assigned run
  const handleSaveDraftRun = (originalRun: WorkoutRun) => {
    if (!onUpdateRun) return;
    const targetUser = ROSTER_USERS.find((u) => u.id === draftAthleteId) || currentUser;
    const newMult = getRunTypeMultiplier(draftRunType);
    const newLoad = calculateRunLoad(draftDistance, draftUnit, newMult);

    const updated: WorkoutRun = {
      ...originalRun,
      workoutDate: draftDate,
      distance: draftDistance,
      distanceUnit: draftUnit,
      runType: draftRunType,
      multiplier: newMult,
      load: newLoad,
      comments: draftComments,
      completed: draftCompleted,
      athleteId: targetUser.id,
      athleteName: targetUser.name,
      isPlanAssigned: true,
      assignedByCoachId: currentUser.id,
      assignedByCoachName: currentUser.name,
      durationSeconds: draftDurationSeconds,
      durationFormatted: draftDurationFormatted,
      paceSeconds: draftPaceSeconds,
      paceFormatted: draftPaceFormatted,
      updatedAt: new Date().toISOString(),
    };

    onUpdateRun(updated);
    setEditingRunId(null);
    setSuccessMessage(`✓ Workout for ${targetUser.name} on ${draftDate} updated!`);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  const handleDeleteAssignedRun = (runId: string) => {
    if (!onDeleteRun) return;
    if (window.confirm('Delete this coach-assigned workout?')) {
      onDeleteRun(runId);
      if (editingRunId === runId) setEditingRunId(null);
      setSuccessMessage('✓ Workout removed.');
      setTimeout(() => setSuccessMessage(''), 2000);
    }
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
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Coach Center
              </span>
              <span className="badge-safe text-xxs font-mono">COACH</span>
            </div>
            <h2 id="assign-run-title" className="modal-title flex items-center gap-2 mt-0.5">
              <span>{activeTab === 'assign' ? 'Assign Run' : 'Edit Assigned Runs'}</span>
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

        {/* Tab Switcher: Assign vs Edit Previously Assigned */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-subtle bg-surface">
          <button
            type="button"
            className={`tab-pill ${activeTab === 'assign' ? 'tab-pill-active' : ''}`}
            onClick={() => setActiveTab('assign')}
          >
            Assign Run
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'edit' ? 'tab-pill-active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            Edit Assigned ({previouslyAssignedRuns.length})
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

          {/* Access Control Check: Non-Coach Alert */}
          {!isCoach && (
            <div className="inweek-banner inweek-critical mb-4">
              <p className="text-sm font-bold text-danger mb-1">
                ⚠️ Coach Access Required
              </p>
              <p className="text-xs text-secondary">
                Only coaches can assign workouts. You are currently logged in as <strong>{currentUser.name}</strong> ({currentUser.role}).
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: ASSIGN 1 RUN FOR 1 ATHLETE FOR 1 DAY */}
          {/* ============================================================ */}
          {activeTab === 'assign' && (
            <>
              {/* Section 1: Target Athlete Selection */}
              <div className="assign-section mb-4 p-3 rounded" style={{ backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="section-label font-mono text-xs text-primary uppercase font-bold">
                    Select Athlete
                  </h3>
                  <span className="text-xxs font-mono text-accent font-bold uppercase">
                    For: {selectedAthlete.name} ({selectedAthlete.role === 'coach' ? 'Coach' : 'Athlete'})
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ROSTER_USERS.map((user) => {
                    const isSelected = selectedAthleteId === user.id;
                    const isSelf = user.id === currentUser.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`p-2.5 rounded text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-accent text-white font-bold'
                            : 'bg-surface hover:border-accent text-primary'
                        }`}
                        style={{
                          border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                        }}
                        onClick={() => setSelectedAthleteId(user.id)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs"
                            style={{
                              backgroundColor: isSelected ? '#ffffff' : 'var(--color-accent)',
                              color: isSelected ? '#15803d' : '#ffffff',
                            }}
                          >
                            {user.name.charAt(0)}
                          </span>
                          <span className="text-xs font-bold truncate">
                            {user.name} {isSelf ? '(You)' : ''}
                          </span>
                        </div>
                        <span className="text-xxs font-mono block opacity-80 uppercase">
                          {user.role === 'coach' ? 'Coach' : 'Athlete'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Date Selection for Single Run */}
              <div className="assign-section mb-4 p-3 rounded" style={{ backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="section-label font-mono text-xs text-primary uppercase font-bold">
                    Workout Date
                  </h3>
                  <span className="text-xs font-mono font-bold text-primary">
                    {formattedDate}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    className="input-field text-sm font-mono flex-1 min-w-[200px]"
                    value={workoutDate}
                    onChange={(e) => setWorkoutDate(e.target.value)}
                  />

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="btn-filter-pill text-xs font-mono py-1 px-2.5"
                      onClick={() => setWorkoutDate(todayStr)}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="btn-filter-pill text-xs font-mono py-1 px-2.5"
                      onClick={() => {
                        const [y, m, d] = todayStr.split('-').map(Number);
                        const nextDay = new Date(y, m - 1, d + 1);
                        setWorkoutDate(formatDate(nextDay));
                      }}
                    >
                      Tomorrow
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Run Details (Distance, Run Type, Multiplier, Notes) */}
              <div className="assign-section">
                <h3 className="section-label font-mono text-xs text-primary uppercase mb-2">
                  Workout Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {/* Distance Input with Unit Toggle */}
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
                        placeholder="8.0"
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

                  {/* Workload stress badge */}
                  <div>
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                      Workload
                    </label>
                    <div className="hero-load-pill font-mono flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-muted">
                        {distance} {unit} × {multiplier.toFixed(1)}
                      </span>
                      <span className="text-lg font-bold text-primary">{load.toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                {/* Prescribed Target Pace & Duration (Optional) */}
                <StravaTimePacePicker
                  distance={distance}
                  distanceUnit={unit}
                  durationSeconds={targetDurationSeconds}
                  paceSeconds={targetPaceSeconds}
                  onChange={(timing) => {
                    setTargetDurationSeconds(timing.durationSeconds);
                    setTargetDurationFormatted(timing.durationFormatted);
                    setTargetPaceSeconds(timing.paceSeconds);
                    setTargetPaceFormatted(timing.paceFormatted);
                  }}
                  label="Prescribed Target Pace & Time (Optional · Strava Style)"
                  compact
                />

                {/* Run Category Selector */}
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1.5">
                  Run Category
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
                  Notes &amp; Instructions
                </label>
                <textarea
                  rows={2}
                  className="textarea-notes"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={`e.g. Long run for ${selectedAthlete.name}, keep pace easy and steady...`}
                />
              </div>

              {/* Assignment Summary Strip */}
              <div className="assign-summary-box mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-muted uppercase block">
                      Target Athlete
                    </span>
                    <strong className="text-sm font-mono text-primary">
                      {selectedAthlete.name} · {formattedDate}
                    </strong>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted">
                      Distance: <strong className="text-primary">{distance} {unit.toUpperCase()}</strong>
                    </span>
                    <span className="text-xs font-mono text-primary font-bold">
                      Workload: {load.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ============================================================ */}
          {/* TAB 2: EDIT PREVIOUSLY ASSIGNED RUNS */}
          {/* ============================================================ */}
          {activeTab === 'edit' && (
            <div className="assign-edit-container">
              {/* Filter and Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 p-2.5 rounded bg-surface border border-subtle">
                <div className="flex items-center gap-2">
                  <span className="text-xxs font-mono text-muted uppercase">Athlete:</span>
                  <select
                    className="select-field text-xs font-mono"
                    value={editAthleteFilter}
                    onChange={(e) => setEditAthleteFilter(e.target.value)}
                  >
                    <option value="all">All Athletes ({previouslyAssignedRuns.length})</option>
                    {ROSTER_USERS.map((u) => {
                      const count = previouslyAssignedRuns.filter(
                        (r) => r.athleteId === u.id || r.athleteName === u.name
                      ).length;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <input
                    type="text"
                    className="input-field text-xs font-mono w-full"
                    placeholder="Search workouts..."
                    value={editSearchQuery}
                    onChange={(e) => setEditSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Previously Assigned Runs List */}
              {filteredAssignedRuns.length === 0 ? (
                <div className="empty-day-box p-6 text-center">
                  <p className="text-secondary font-medium text-sm">
                    No assigned workouts found.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {filteredAssignedRuns.map((run) => {
                    const isEditing = editingRunId === run.id;
                    const runColor = getRunTypeColor(run.runType);
                    const athleteDisplay = run.athleteName || 'Athlete';

                    return (
                      <div
                        key={run.id}
                        className="p-3 rounded border transition-all"
                        style={{
                          backgroundColor: 'var(--bg-surface-elevated)',
                          borderColor: isEditing ? 'var(--color-accent)' : 'var(--border-subtle)',
                          borderLeftWidth: '4px',
                          borderLeftColor: runColor,
                        }}
                      >
                        {/* Summary Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="badge-safe text-xxs font-mono font-bold">
                              {athleteDisplay.toUpperCase()}
                            </span>
                            <span className="font-mono text-xs font-bold text-primary">
                              {run.workoutDate} ({getDayName(run.workoutDate)})
                            </span>
                            <span
                              className="text-xxs font-mono px-1.5 py-0.5 rounded border"
                              style={{ color: runColor, borderColor: runColor }}
                            >
                              {run.runType.replace('_', ' ').toUpperCase()} (×{run.multiplier})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-xxs font-mono font-bold px-2 py-0.5 rounded ${run.completed ? 'status-done' : 'status-plan'}`}>
                              {run.completed ? 'Completed' : 'Planned'}
                            </span>
                            <button
                              type="button"
                              className="btn-filter-pill text-xxs font-mono py-1 px-2.5"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingRunId(null);
                                } else {
                                  handleStartEditRun(run);
                                }
                              }}
                            >
                              {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              className="btn-delete-run text-xs"
                              onClick={() => handleDeleteAssignedRun(run.id)}
                              title="Delete this assigned workout"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Read View */}
                        {!isEditing && (
                          <div className="flex flex-wrap items-center justify-between text-xs font-mono text-secondary mt-1">
                            <div>
                              <strong className="text-primary text-sm">
                                {run.distance} {run.distanceUnit.toUpperCase()}
                              </strong>
                              <span className="text-muted ml-2">
                                (Workload: {run.load.toFixed(1)})
                              </span>
                              {run.durationFormatted && (
                                <span className="badge-safe text-xxs font-mono ml-2">
                                  ⏱️ {run.durationFormatted}
                                </span>
                              )}
                              {run.paceFormatted && (
                                <span className="badge-safe text-xxs font-mono ml-1.5">
                                  ⚡ {run.paceFormatted}
                                </span>
                              )}
                            </div>
                            {run.comments && (
                              <p className="text-xs text-muted font-sans italic w-full mt-1">
                                {run.comments}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Inline Edit Form */}
                        {isEditing && (
                          <div className="mt-3 pt-3 border-t border-subtle">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-2.5">
                              <div>
                                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                  Assign To Athlete
                                </label>
                                <select
                                  className="select-field text-xs font-mono w-full"
                                  value={draftAthleteId}
                                  onChange={(e) => setDraftAthleteId(e.target.value)}
                                >
                                  {ROSTER_USERS.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name} ({u.role === 'coach' ? 'Coach' : 'Athlete'})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                  Workout Date
                                </label>
                                <input
                                  type="date"
                                  className="input-field text-xs font-mono w-full"
                                  value={draftDate}
                                  onChange={(e) => setDraftDate(e.target.value)}
                                />
                              </div>

                              <div>
                                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                  Distance &amp; Unit
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
                            </div>

                            {/* Strava Time & Pace for edited workout */}
                            <StravaTimePacePicker
                              distance={draftDistance}
                              distanceUnit={draftUnit}
                              durationSeconds={draftDurationSeconds}
                              paceSeconds={draftPaceSeconds}
                              onChange={(timing) => {
                                setDraftDurationSeconds(timing.durationSeconds);
                                setDraftDurationFormatted(timing.durationFormatted);
                                setDraftPaceSeconds(timing.paceSeconds);
                                setDraftPaceFormatted(timing.paceFormatted);
                              }}
                              label="Target Pace & Duration (Optional · Strava Style)"
                              compact
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-2.5 mt-2.5">
                              <div>
                                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                  Run Category
                                </label>
                                <select
                                  className="select-field text-xs font-mono w-full"
                                  value={draftRunType}
                                  onChange={(e) => setDraftRunType(e.target.value)}
                                >
                                  {DEFAULT_RUN_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name} (×{t.multiplier})
                                    </option>
                                  ))}
                                </select>
                              </div>

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
                                    {draftCompleted ? 'Completed' : 'Planned'}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <div className="mb-2.5">
                              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                Notes
                              </label>
                              <textarea
                                rows={2}
                                className="textarea-notes text-xs"
                                value={draftComments}
                                onChange={(e) => setDraftComments(e.target.value)}
                                placeholder="Notes for athlete..."
                              />
                            </div>

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
                                onClick={() => handleSaveDraftRun(run)}
                              >
                                Save Changes
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer flex items-center justify-between">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            {activeTab === 'edit' ? 'Close' : 'Cancel'}
          </button>

          {activeTab === 'assign' && (
            <button
              type="button"
              className="btn-action-primary"
              disabled={!isCoach || !workoutDate || distance <= 0}
              onClick={handleAssign}
            >
              Assign Run to {selectedAthlete.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
