import React, { useState, useEffect, useMemo } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  UserProfile,
  RunnerFeeling,
  RunningShoe,
  QuickLogStaple,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  calculateRunLoad,
  formatDate,
  getDayName,
  getUserQuickStaples,
  formatStapleLabel,
  formatTimeOfDay,
  getSmartDefaultTitle,
} from '../utils/calculations';
import { ROSTER_USERS } from '../utils/storage';
import { StravaTimePacePicker } from './StravaTimePacePicker';
import { RPEFeelingPicker } from './RPEFeelingPicker';
import { QuickLogPresetsModal } from './QuickLogPresetsModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // If runToEdit is provided, modal opens in Edit mode; otherwise Log mode
  runToEdit?: WorkoutRun | null;
  defaultDate?: string;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  onSaveRun: (run: WorkoutRun) => void;
  onDeleteRun?: (runId: string) => void;
  shoes?: RunningShoe[];
  allWorkouts?: WorkoutRun[];
  userQuickStaplesMap?: Record<string, QuickLogStaple[]>;
  onSaveUserStaples?: (userId: string, staples: QuickLogStaple[]) => void;
  selectedAthleteFilter?: string;
  safeRemainingBudget?: number | null;
}

export const LogRunModal: React.FC<Props> = ({
  isOpen,
  onClose,
  runToEdit,
  defaultDate,
  currentUser,
  distanceUnit,
  onSaveRun,
  onDeleteRun,
  shoes = [],
  allWorkouts = [],
  userQuickStaplesMap,
  onSaveUserStaples,
  selectedAthleteFilter,
  safeRemainingBudget,
}) => {
  const isEditMode = Boolean(runToEdit);
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const initialDate = runToEdit?.workoutDate || defaultDate || todayStr;

  // Form State
  const [date, setDate] = useState<string>(initialDate);
  const isCoach = currentUser.role === 'coach';

  const [athleteId, setAthleteId] = useState<string>(() => {
    if (runToEdit?.athleteId) return runToEdit.athleteId;
    if (isCoach && selectedAthleteFilter && selectedAthleteFilter !== 'all') {
      return selectedAthleteFilter;
    }
    return currentUser.id;
  });

  const targetAthlete = useMemo(() => {
    return ROSTER_USERS.find((u) => u.id === athleteId) || currentUser;
  }, [athleteId, currentUser]);

  // Find the shoe used on the most recent run for this athlete
  const lastUsedShoeId = useMemo(() => {
    if (!allWorkouts || allWorkouts.length === 0 || !shoes || shoes.length === 0) return '';
    const activeShoeIds = new Set(shoes.filter((s) => !s.isRetired).map((s) => s.id));
    const athleteRunsWithShoe = allWorkouts
      .filter(
        (w) =>
          (w.athleteId === targetAthlete.id || !w.athleteId) &&
          w.shoeId &&
          activeShoeIds.has(w.shoeId)
      )
      .sort((a, b) => {
        const cmp = b.workoutDate.localeCompare(a.workoutDate);
        if (cmp !== 0) return cmp;
        return (b.runOrder ?? 1) - (a.runOrder ?? 1);
      });
    return athleteRunsWithShoe[0]?.shoeId || '';
  }, [allWorkouts, targetAthlete.id, shoes]);

  const lastUsedShoe = useMemo(() => {
    return shoes.find((s) => s.id === lastUsedShoeId);
  }, [shoes, lastUsedShoeId]);

  const [title, setTitle] = useState<string>(() => runToEdit?.title ?? '');
  const [startTime, setStartTime] = useState<string>(() => {
    if (runToEdit?.startTime) return runToEdit.startTime;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const [distance, setDistance] = useState<number>(() => runToEdit?.distance ?? 5.0);
  const [unit, setUnit] = useState<DistanceUnit>(() => runToEdit?.distanceUnit ?? distanceUnit);
  const [runType, setRunType] = useState<string>(() => runToEdit?.runType ?? 'easy');
  const [comments, setComments] = useState<string>(() => runToEdit?.comments ?? '');
  const [completed, setCompleted] = useState<boolean>(() => runToEdit?.completed ?? true);
  const [shoeId, setShoeId] = useState<string>(() => {
    if (runToEdit?.shoeId) return runToEdit.shoeId;
    return lastUsedShoeId || (shoes.find((s) => !s.isRetired)?.id ?? '');
  });

  // Subjective effort & feeling
  const [rpe, setRpe] = useState<number | undefined>(() => runToEdit?.rpe);
  const [feeling, setFeeling] = useState<RunnerFeeling | undefined>(() => runToEdit?.feeling);

  // Strava Time & Pace
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(
    () => runToEdit?.durationSeconds
  );
  const [durationFormatted, setDurationFormatted] = useState<string | undefined>(
    () => runToEdit?.durationFormatted
  );
  const [paceSeconds, setPaceSeconds] = useState<number | undefined>(() => runToEdit?.paceSeconds);
  const [paceFormatted, setPaceFormatted] = useState<string | undefined>(
    () => runToEdit?.paceFormatted
  );

  // Modals & confirmation state
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Sync form state whenever runToEdit or isOpen changes
  useEffect(() => {
    if (isOpen) {
      if (runToEdit) {
        setTitle(runToEdit.title || '');
        setStartTime(runToEdit.startTime || '');
        setDate(runToEdit.workoutDate);
        setAthleteId(runToEdit.athleteId || currentUser.id);
        setDistance(runToEdit.distance);
        setUnit(runToEdit.distanceUnit);
        setRunType(runToEdit.runType);
        setComments(runToEdit.comments || '');
        setCompleted(runToEdit.completed);
        setShoeId(runToEdit.shoeId || '');
        setRpe(runToEdit.rpe);
        setFeeling(runToEdit.feeling);
        setDurationSeconds(runToEdit.durationSeconds);
        setDurationFormatted(runToEdit.durationFormatted);
        setPaceSeconds(runToEdit.paceSeconds);
        setPaceFormatted(runToEdit.paceFormatted);
      } else {
        setTitle('');
        const now = new Date();
        setStartTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        setDate(defaultDate || todayStr);
        setAthleteId(
          isCoach && selectedAthleteFilter && selectedAthleteFilter !== 'all'
            ? selectedAthleteFilter
            : currentUser.id
        );
        setDistance(5.0);
        setUnit(distanceUnit);
        setRunType('easy');
        setComments('');
        setCompleted(true);
        setShoeId(lastUsedShoeId || (shoes.find((s) => !s.isRetired)?.id ?? ''));
        setRpe(undefined);
        setFeeling(undefined);
        setDurationSeconds(undefined);
        setDurationFormatted(undefined);
        setPaceSeconds(undefined);
        setPaceFormatted(undefined);
      }
      setConfirmDelete(false);
      setToastMessage('');
    }
  }, [isOpen, runToEdit, defaultDate, todayStr, distanceUnit, currentUser.id, isCoach, selectedAthleteFilter, lastUsedShoeId, shoes]);

  // Derived load calculation
  const multiplier = getRunTypeMultiplier(runType);
  const load = calculateRunLoad(distance, unit, multiplier);

  // User's quick staples
  const activeStaples = useMemo(() => {
    return getUserQuickStaples(targetAthlete.id, userQuickStaplesMap, unit);
  }, [targetAthlete.id, userQuickStaplesMap, unit]);

  const handleApplyStaple = (staple: QuickLogStaple) => {
    setDistance(staple.distance);
    setUnit(staple.unit);
    setRunType(staple.runType);
    if (staple.label && !comments) {
      setComments(`Preset: ${staple.label}`);
    }
  };

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

    // When editing a past/existing run: ONLY allow changing runType (+ derived multiplier/load) and comments.
    // Everything else about the run stays strictly the same.
    if (isEditMode && runToEdit) {
      const updatedMultiplier = getRunTypeMultiplier(runType);
      const updatedLoad = calculateRunLoad(
        runToEdit.distance,
        runToEdit.distanceUnit,
        updatedMultiplier
      );

      const updatedPastRun: WorkoutRun = {
        ...runToEdit,
        runType,
        multiplier: updatedMultiplier,
        load: updatedLoad,
        comments: comments.trim(),
        updatedAt: new Date().toISOString(),
      };

      onSaveRun(updatedPastRun);
      setToastMessage(
        `✓ Updated run type to ${runType.replace('_', ' ')} & saved comments!`
      );

      setTimeout(() => {
        onClose();
      }, 500);
      return;
    }

    const selectedShoe = shoes.find((s) => s.id === shoeId);
    const finalTitle = title.trim() || getSmartDefaultTitle(startTime, runType);

    const baseTime = Date.now();
    const updatedRun: WorkoutRun = {
      id: `run_${baseTime}_${Math.random().toString(36).slice(2, 6)}`,
      workoutDate: date,
      runOrder: 1,
      distance,
      distanceUnit: unit,
      runType,
      multiplier,
      load,
      comments: comments.trim(),
      completed,
      title: finalTitle,
      startTime: startTime || undefined,
      isPlanAssigned: false,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
      durationSeconds,
      durationFormatted,
      paceSeconds,
      paceFormatted,
      rpe,
      feeling,
      shoeId: selectedShoe ? selectedShoe.id : undefined,
      shoeName: selectedShoe ? selectedShoe.name : undefined,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };

    onSaveRun(updatedRun);
    setToastMessage(
      `✓ Logged ${distance} ${unit.toUpperCase()} ${runType.replace('_', ' ')} run!`
    );

    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (runToEdit && onDeleteRun) {
      onDeleteRun(runToEdit.id);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-lg animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-run-modal-title"
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2.5">
            <span className="quick-add-plus-badge">{isEditMode ? '✎' : '+'}</span>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold block">
                {isEditMode ? 'Strava Edit Activity • Run Type & Notes' : 'Manual Activity Entry'}
              </span>
              <h2 id="log-run-modal-title" className="modal-title">
                {isEditMode ? 'Edit Activity' : 'Log Run'}
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

        <form onSubmit={handleSubmit} className="log-run-form">
          {/* Scrollable Modal Content with Sleek Dedicated Scrollbar */}
          <div className="modal-body log-run-body space-y-4">
            {toastMessage && (
              <div className="inweek-ribbon inweek-ribbon-optimal mb-3">
                <span className="font-mono text-sm font-bold text-success">
                  {toastMessage}
                </span>
              </div>
            )}

            {isEditMode && runToEdit ? (
              /* =========================================================================
                 STRAVA-STYLE EDIT PAST RUN MODE:
                 Only Run Type (e.g. Fartlek -> Easy) and Comments can be modified.
                 All other metrics (distance, date, time, pace, HR, shoe) stay locked.
                 ========================================================================= */
              <div className="strava-edit-activity-shell">
                {/* Top Activity Summary Header (Strava Edit Activity Header) */}
                <div className="strava-edit-header-card">
                  <div className="strava-edit-title-row">
                    <div>
                      <h3 className="strava-edit-run-title">
                        {runToEdit.title ||
                          `${runToEdit.runType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Run`}
                      </h3>
                      <div className="strava-edit-meta-line">
                        <span>
                          📅 {formattedDay} ({getDayName(runToEdit.workoutDate)})
                        </span>
                        {runToEdit.startTime && (
                          <span>• 🕒 {formatTimeOfDay(runToEdit.startTime)}</span>
                        )}
                        {runToEdit.athleteName && (
                          <span>• 🏃 {runToEdit.athleteName}</span>
                        )}
                        {runToEdit.shoeName && (
                          <span>• 👟 {runToEdit.shoeName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {runToEdit.source === 'strava' && (
                        <span className="badge-strava font-mono font-bold">
                          🟠 STRAVA
                        </span>
                      )}
                      <span className="badge-safe font-mono text-xxs font-bold">
                        🔒 TELEMETRY LOCKED
                      </span>
                    </div>
                  </div>

                  {/* 4-Column Horizontal Strava Telemetry Strip */}
                  <div className="strava-telemetry-strip">
                    <div className="strava-telemetry-cell">
                      <span className="strava-telemetry-label">Distance</span>
                      <strong className="strava-telemetry-value">
                        {runToEdit.distance} {runToEdit.distanceUnit.toUpperCase()}
                      </strong>
                    </div>

                    <div className="strava-telemetry-cell">
                      <span className="strava-telemetry-label">Moving Time</span>
                      <strong className="strava-telemetry-value">
                        {runToEdit.durationFormatted || '—'}
                      </strong>
                    </div>

                    <div className="strava-telemetry-cell">
                      <span className="strava-telemetry-label">Avg Pace</span>
                      <strong className="strava-telemetry-value" style={{ color: 'var(--color-accent)' }}>
                        {runToEdit.paceFormatted || '—'}
                      </strong>
                    </div>

                    <div className="strava-telemetry-cell">
                      <span className="strava-telemetry-label">Training Load</span>
                      <strong className="strava-telemetry-value">
                        {calculateRunLoad(
                          runToEdit.distance,
                          runToEdit.distanceUnit,
                          multiplier
                        ).toFixed(1)}{' '}
                        <span className="text-xxs text-muted font-normal">
                          (×{multiplier})
                        </span>
                      </strong>
                    </div>
                  </div>

                  <p className="strava-edit-lock-note">
                    GPS telemetry (distance, moving time, pace, and date) stays locked so your synced activity data remains intact. Below you can reclassify the <strong>Type of Run</strong> or add/read your <strong>Run Comments</strong>.
                  </p>
                </div>

                {/* Section 1: Strava Workout / Run Type Selector */}
                <div className="strava-edit-section">
                  <div className="strava-section-header">
                    <div>
                      <h4 className="strava-section-title">1. Workout / Run Type</h4>
                      <p className="strava-section-subtitle">
                        Reclassify how this run counts toward your Acute:Chronic Workload Ratio (e.g., switch a Fartlek to an Easy run).
                      </p>
                    </div>
                    {runType !== runToEdit.runType && (
                      <span className="badge-safe font-mono text-xs font-bold">
                        {runToEdit.runType.replace('_', ' ')} (×{getRunTypeMultiplier(runToEdit.runType)}) → {runType.replace('_', ' ')} (×{multiplier})
                      </span>
                    )}
                  </div>

                  <div className="strava-run-type-grid">
                    {DEFAULT_RUN_TYPES.map((t) => {
                      const isSelected = runType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`strava-run-type-card ${isSelected ? 'active' : ''}`}
                          style={{
                            borderColor: isSelected ? t.color : undefined,
                            backgroundColor: isSelected ? `${t.color}20` : undefined,
                          }}
                          onClick={() => setRunType(t.id)}
                        >
                          <div className="strava-run-type-left">
                            <span
                              className="chip-color-dot"
                              style={{
                                backgroundColor: t.color,
                                width: '10px',
                                height: '10px',
                                flexShrink: 0,
                              }}
                            />
                            <span className="strava-run-type-name">{t.name}</span>
                          </div>
                          <span className="strava-run-type-mult">×{t.multiplier}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Strava Description & Run Comments */}
                <div className="strava-edit-section">
                  <div className="strava-section-header">
                    <div>
                      <h4 className="strava-section-title">2. Description &amp; Run Comments</h4>
                      <p className="strava-section-subtitle">
                        Write or review notes for this specific run — splits, how your legs felt, weather, or workout takeaways.
                      </p>
                    </div>
                    <span className="text-xxs font-mono text-muted">
                      Saved to this run
                    </span>
                  </div>

                  {runToEdit.comments && (
                    <div className="strava-saved-comment-box">
                      <span className="strava-saved-comment-label">
                        💬 Saved Comment on This Run
                      </span>
                      <p className="strava-saved-comment-text">
                        {runToEdit.comments}
                      </p>
                    </div>
                  )}

                  <textarea
                    rows={5}
                    className="strava-comment-textarea"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="How did it go? Share more about your activity, splits, how your legs felt, or coach notes so you can come back and read them anytime..."
                  />
                </div>
              </div>
            ) : (
              /* =========================================================================
                 LOG NEW RUN MODE (Full Form)
                 ========================================================================= */
              <>
            {/* 1-Tap Quick Staples Presets Strip */}
            <div className="p-2.5 rounded bg-surface border border-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xxs uppercase tracking-wider text-muted font-mono font-bold">
                  1-Tap Quick Staples ({activeStaples.length}/7)
                </span>
                {onSaveUserStaples && (
                  <button
                    type="button"
                    className="text-xxs font-mono text-accent hover:underline flex items-center gap-1"
                    onClick={() => setIsPresetsModalOpen(true)}
                  >
                    <span>Customize</span>
                    <span>⚙️</span>
                  </button>
                )}
              </div>

              <div className="quick-relog-chips">
                {activeStaples.map((staple) => (
                  <button
                    key={staple.id}
                    type="button"
                    className="quick-staple-btn text-xs"
                    onClick={() => handleApplyStaple(staple)}
                    title={`Fill ${staple.distance} ${staple.unit} ${staple.runType}`}
                  >
                    {formatStapleLabel(staple)}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Athlete (Only if Coach) */}
            {isCoach && (
              <div className="p-2.5 rounded bg-surface border border-subtle">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Runner
                  </label>
                  <span className="text-xxs font-mono text-accent font-bold">
                    Target: {targetAthlete.name}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROSTER_USERS.map((user) => {
                    const isSelected = athleteId === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={`btn-filter-pill font-mono text-xs ${
                          isSelected ? 'active' : ''
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

            {/* Workout Title (Strava Benchmark) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                  Activity Title
                </label>
                <span className="text-xxs font-mono text-muted">
                  Default: {getSmartDefaultTitle(startTime, runType)}
                </span>
              </div>
              <input
                type="text"
                className="input-field text-xs font-semibold w-full"
                placeholder={getSmartDefaultTitle(startTime, runType)}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Date & Start Time Picker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Start Time
                  </label>
                  <span className="text-xs font-mono text-primary font-bold">
                    {formatTimeOfDay(startTime) || 'Not set'}
                  </span>
                </div>
                <input
                  type="time"
                  className="input-field text-xs font-mono w-full"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>

            {/* Distance & Load Calculation */}
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
                  Workload Load
                </label>
                <div className="hero-load-pill font-mono flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-muted">
                    {distance} {unit} × {multiplier.toFixed(1)}
                  </span>
                  <span className="text-lg font-bold text-primary">{load.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Run Category / Sport Type Chips */}
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

            {/* Strava Time & Pace (Bi-directional) */}
            <StravaTimePacePicker
              distance={distance}
              distanceUnit={unit}
              durationSeconds={durationSeconds}
              paceSeconds={paceSeconds}
              onChange={(timing) => {
                setDurationSeconds(timing.durationSeconds);
                setDurationFormatted(timing.durationFormatted);
                setPaceSeconds(timing.paceSeconds);
                setPaceFormatted(timing.paceFormatted);
              }}
              label="Time & Pace (Strava Style)"
              compact
            />

            {/* Subjective Effort (RPE) & Feeling */}
            <RPEFeelingPicker
              rpe={rpe}
              onRpeChange={setRpe}
              feeling={feeling}
              onFeelingChange={setFeeling}
              durationSeconds={durationSeconds}
              compact
            />

            {/* Running Shoe / Gear Selector with Last-Run Auto-Assignment */}
            {shoes && shoes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Running Shoe / Gear
                  </label>
                  {lastUsedShoe && (
                    <span className="text-xxs font-mono text-accent">
                      Auto-assigned from last run ({lastUsedShoe.name})
                    </span>
                  )}
                </div>
                <select
                  className="input-field text-xs font-mono w-full"
                  value={shoeId}
                  onChange={(e) => setShoeId(e.target.value)}
                >
                  <option value="">No shoe selected</option>
                  {shoes.map((s) => {
                    const isLastUsed = s.id === lastUsedShoeId;
                    return (
                      <option key={s.id} value={s.id}>
                        👟 {s.name} ({s.totalMiles.toFixed(1)} / {s.maxMiles} mi){isLastUsed ? ' — (Last Run)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Completion Status Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-subtle">
              <div>
                <span className="text-xs font-mono font-bold block text-primary">
                  Activity Status
                </span>
                <span className="text-xxs text-muted font-mono">
                  {completed ? 'Workout completed and executed' : 'Planned workout for future'}
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

            {/* Optional Workout Notes */}
            <div>
              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                Workout Description & Notes (Optional)
              </label>
              <textarea
                rows={2}
                className="textarea-notes text-xs"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="How did the run feel? Weather, route, cadence, sensations..."
              />
            </div>

            {/* Safe Budget Indicator Preview */}
            {safeRemainingBudget !== null && safeRemainingBudget !== undefined && (
              <div className="p-2 rounded bg-surface-subtle border border-subtle flex items-center justify-between text-xs font-mono">
                <span className="text-muted">In-Week Safe Budget:</span>
                <span className={safeRemainingBudget >= load ? 'text-success font-bold' : 'text-danger font-bold'}>
                  {safeRemainingBudget >= load
                    ? `✓ Safe (+${(safeRemainingBudget - load).toFixed(1)} remaining)`
                    : `⚠️ Exceeds safe threshold by ${(load - safeRemainingBudget).toFixed(1)}`}
                </span>
              </div>
            )}
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="modal-footer flex items-center justify-between">
            <div>
              {isEditMode && onDeleteRun && (
                <button
                  type="button"
                  className={`btn-modal-cancel ${confirmDelete ? 'text-danger border-danger font-bold' : ''}`}
                  onClick={handleDelete}
                >
                  {confirmDelete ? 'Confirm Delete? ⚠️' : 'Delete Run 🗑️'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                <span>{isEditMode ? 'Save Changes' : 'Log Run'}</span>
                <span className="font-mono text-xs">({load.toFixed(1)} load)</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Embedded Presets Customizer */}
      {isPresetsModalOpen && onSaveUserStaples && (
        <QuickLogPresetsModal
          isOpen={isPresetsModalOpen}
          onClose={() => setIsPresetsModalOpen(false)}
          currentUser={targetAthlete}
          distanceUnit={unit}
          userQuickStaplesMap={userQuickStaplesMap}
          onSaveUserStaples={onSaveUserStaples}
        />
      )}
    </div>
  );
};
