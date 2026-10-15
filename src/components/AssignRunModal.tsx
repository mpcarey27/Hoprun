import React, { useState, useMemo } from 'react';
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
  convertDistance,
  formatDate,
  getDayName,
  addDays,
  generateRecurringDates,
} from '../utils/calculations';
import { ROSTER_USERS } from '../utils/storage';

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
  allWorkouts = [],
  onUpdateRun,
  onDeleteRun,
}) => {
  const isCoach = currentUser.role === 'coach';
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const initialStart = activeDate || todayStr;

  // Active Modal Mode Tab: 'assign' = Create New Recurring Runs, 'edit' = Manage & Edit Previously Assigned Runs
  const [activeTab, setActiveTab] = useState<'assign' | 'edit'>('assign');

  // -------------------------------------------------------------
  // Assign Tab State
  // -------------------------------------------------------------
  // Default target athlete to Rob (or coach themselves if selected)
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(() => {
    const rob = ROSTER_USERS.find((u) => u.name.toLowerCase().includes('rob'));
    return rob ? rob.id : currentUser.id;
  });

  const selectedAthlete = useMemo(() => {
    return ROSTER_USERS.find((u) => u.id === selectedAthleteId) || currentUser;
  }, [selectedAthleteId, currentUser]);

  // Run Configuration
  const [distance, setDistance] = useState<number>(10);
  const [unit, setUnit] = useState<DistanceUnit>(distanceUnit);
  const [runType, setRunType] = useState<string>('easy');
  const [instructions, setInstructions] = useState<string>('Easy Zone 2 aerobic run');

  // Date Range
  const [startDate, setStartDate] = useState<string>(initialStart);
  const [endDate, setEndDate] = useState<string>(() => {
    const currentYear = new Date().getFullYear();
    const defaultEnd = `${currentYear}-12-31`;
    return defaultEnd >= initialStart ? defaultEnd : addDays(initialStart, 56);
  });

  // Repeating Days: Default to Monday & Wednesday
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3]);
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1);

  // Success message toast
  const [successMessage, setSuccessMessage] = useState<string>('');

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

  // Toggle single day
  const handleToggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

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

  // Assign recurring runs to the selected athlete
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
      comments: instructions.trim() || `Coach ${currentUser.name || 'Michael Carey'} assigned ${runType} run to ${selectedAthlete.name}`,
      completed: false, // Planned workout for athlete to complete
      isPlanAssigned: true,
      athleteId: selectedAthlete.id,
      athleteName: selectedAthlete.name,
      assignedByCoachId: currentUser.id,
      assignedByCoachName: currentUser.name,
      updatedAt: new Date().toISOString(),
    }));

    const daysSummary = selectedDays
      .map((d) => DAY_LABELS.find((l) => l.day === d)?.label)
      .filter(Boolean)
      .join(', ');

    const notifMsg = `Coach ${currentUser.name || 'Michael Carey'} assigned ${newRuns.length} runs to ${selectedAthlete.name}: ${distance} ${unit.toUpperCase()} ${runType.replace('_', ' ')} on ${daysSummary} (${startDate} through ${endDate})`;

    onAssignRuns(newRuns, notifMsg);
    setSuccessMessage(`✓ Successfully assigned ${newRuns.length} workouts to ${selectedAthlete.name}!`);
    setTimeout(() => {
      setSuccessMessage('');
      onClose();
    }, 1400);
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
                Coach Prescription & Assignment Center
              </span>
              <span className="badge-safe text-xxs font-mono">COACH ADMIN</span>
            </div>
            <h2 id="assign-run-title" className="modal-title flex items-center gap-2 mt-0.5">
              <span>{activeTab === 'assign' ? 'Assign Run to Athlete' : 'Edit Assigned Runs'}</span>
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
            ➕ Assign New Runs
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'edit' ? 'tab-pill-active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            ✏️ Edit Previously Assigned Runs ({previouslyAssignedRuns.length})
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
                ⚠️ Coach Admin Access Required
              </p>
              <p className="text-xs text-secondary">
                Only users with coach admin status (such as Coach Michael Carey) can assign workouts to other athletes or edit prescribed plans. You are currently logged in as <strong>{currentUser.name}</strong> ({currentUser.role}).
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: ASSIGN NEW RUNS */}
          {/* ============================================================ */}
          {activeTab === 'assign' && (
            <>
              {/* Section 0: Target Athlete Selection (Mandatory Coach Choice) */}
              <div className="assign-section mb-4 p-3 rounded" style={{ backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="section-label font-mono text-xs text-primary uppercase font-bold">
                    1. Select Target Athlete for Prescription
                  </h3>
                  <span className="text-xxs font-mono text-accent font-bold uppercase">
                    Prescribing For: {selectedAthlete.name} ({selectedAthlete.role === 'coach' ? 'Coach' : 'Athlete'})
                  </span>
                </div>
                <p className="text-xs text-muted mb-2.5">
                  Select which athlete this training schedule will be assigned to. You can assign to yourself or any athlete on the team roster.
                </p>

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

              {/* Section 1: Workout Prescription */}
              <div className="assign-section">
                <h3 className="section-label font-mono text-xs text-primary uppercase mb-2">
                  2. Workout Prescription
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
                  Coach Instructions & Athlete Focus Notes
                </label>
                <textarea
                  rows={2}
                  className="textarea-notes"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={`e.g. Aerobic zone 2 run for ${selectedAthlete.name}, keep cadence smooth, negative split final 2 miles...`}
                />
              </div>

              <div className="settings-divider" />

              {/* Section 2: Repeating Schedule Options */}
              <div className="assign-section">
                <h3 className="section-label font-mono text-xs text-primary uppercase mb-2">
                  3. Repeating Days & Schedule
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
                        <span className="font-bold">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Presets */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xxs text-muted font-mono uppercase">Quick Presets:</span>
                  <button
                    type="button"
                    className="btn-preset-pill font-mono text-xxs"
                    onClick={() => handleSelectPreset([1, 3])}
                  >
                    Mon &amp; Wed
                  </button>
                  <button
                    type="button"
                    className="btn-preset-pill font-mono text-xxs"
                    onClick={() => handleSelectPreset([1, 3, 5])}
                  >
                    Mon / Wed / Fri
                  </button>
                  <button
                    type="button"
                    className="btn-preset-pill font-mono text-xxs"
                    onClick={() => handleSelectPreset([2, 4, 6])}
                  >
                    Tue / Thu / Sat
                  </button>
                  <button
                    type="button"
                    className="btn-preset-pill font-mono text-xxs"
                    onClick={() => handleSelectPreset([6, 0])}
                  >
                    Weekends (Sat/Sun)
                  </button>
                </div>

                {/* Date range grid */}
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
                      Prescription Summary for {selectedAthlete.name}
                    </span>
                    <strong className="text-sm font-mono text-primary">
                      {matchingDates.length} Runs Prescribed
                    </strong>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted">
                      Total Dist: <strong className="text-primary">{totalVolumeMiles} mi</strong>
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
                  <span className="text-xxs font-mono text-muted uppercase">Filter Athlete:</span>
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
                    placeholder="Search date, run type, or notes..."
                    value={editSearchQuery}
                    onChange={(e) => setEditSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Previously Assigned Runs List */}
              {filteredAssignedRuns.length === 0 ? (
                <div className="empty-day-box p-6 text-center">
                  <p className="text-secondary font-medium text-sm">
                    No assigned workouts match your filter.
                  </p>
                  <p className="text-muted text-xs mt-1">
                    Switch to the "Assign New Runs" tab to prescribe workouts to athletes.
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
                              COACH ASSIGNED → {athleteDisplay}
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
                              {run.completed ? '✓ Completed' : '⏳ Planned'}
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
                              {isEditing ? 'Cancel' : 'Edit Run ✏️'}
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
                                (Stress Load: {run.load.toFixed(1)} pts)
                              </span>
                            </div>
                            {run.comments && (
                              <p className="text-xs text-muted font-sans italic w-full mt-1">
                                Instructions: "{run.comments}"
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-2.5">
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
                                  Session Status
                                </label>
                                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={draftCompleted}
                                    onChange={(e) => setDraftCompleted(e.target.checked)}
                                  />
                                  <span className="text-xs font-mono">
                                    {draftCompleted ? '✓ Marked as Completed' : '⏳ Marked as Planned / Prescribed'}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <div className="mb-2.5">
                              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                                Coach Notes / Instructions
                              </label>
                              <textarea
                                rows={2}
                                className="textarea-notes text-xs"
                                value={draftComments}
                                onChange={(e) => setDraftComments(e.target.value)}
                                placeholder="Instructions for athlete..."
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer flex items-center justify-between">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            {activeTab === 'edit' ? 'Close Manager' : 'Cancel'}
          </button>

          {activeTab === 'assign' && (
            <button
              type="button"
              className="btn-action-primary"
              disabled={!isCoach || matchingDates.length === 0 || distance <= 0}
              onClick={handleAssign}
            >
              Assign {matchingDates.length} Runs to {selectedAthlete.name} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
