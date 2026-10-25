import React, { useState, useMemo } from 'react';
import type { WorkoutRun, DistanceUnit, TargetRace } from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeColor,
  convertDistance,
  formatDuration,
  formatDurationStrava,
  formatPace,
  calculateCompliance,
  formatDate,
  formatTimeOfDay,
  calculateRelativeStimulus,
  getWeekStartDate,
  addDays,
} from '../utils/calculations';
import { RaceCountdownBanner } from './RaceCountdownBanner';

interface Props {
  workouts: WorkoutRun[];
  distanceUnit: DistanceUnit;
  onEditWorkoutDate?: (date: string) => void;
  onEditRun?: (run: WorkoutRun) => void;
  onLogRun?: () => void;
  onDeleteWorkout: (id: string) => void;
  targetRace?: TargetRace;
  onToggleComplete?: (run: WorkoutRun) => void;
  weeklyMileageTarget?: number;
  activeWeekStartDate?: string;
}

export const WorkoutsTab: React.FC<Props> = ({
  workouts,
  distanceUnit,
  onEditWorkoutDate,
  onEditRun,
  onLogRun,
  onDeleteWorkout,
  targetRace,
  onToggleComplete,
  weeklyMileageTarget,
  activeWeekStartDate,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const todayStr = useMemo(() => formatDate(new Date()), []);

  // Sort newest first
  const sortedWorkouts = useMemo(() => {
    return [...workouts].sort((a, b) => {
      const cmp = b.workoutDate.localeCompare(a.workoutDate);
      if (cmp !== 0) return cmp;
      return b.runOrder - a.runOrder;
    });
  }, [workouts]);

  const filtered = useMemo(() => {
    return sortedWorkouts.filter((w) => {
      const matchesType = filterType === 'all' || w.runType === filterType;
      const matchesQuery =
        !searchQuery ||
        (w.comments && w.comments.toLowerCase().includes(searchQuery.toLowerCase())) ||
        w.workoutDate.includes(searchQuery);
      return matchesType && matchesQuery;
    });
  }, [sortedWorkouts, filterType, searchQuery]);

  // Total stats memoized
  const { totalDistance, totalLoad, totalDurationSecs, avgPaceSecs } = useMemo(() => {
    let dist = 0;
    let load = 0;
    let dur = 0;
    for (const w of workouts) {
      dist += convertDistance(w.distance, w.distanceUnit, distanceUnit);
      load += w.load;
      if (w.durationSeconds) dur += w.durationSeconds;
    }
    const pace = dist > 0 && dur > 0 ? Math.round(dur / dist) : null;
    return {
      totalDistance: dist,
      totalLoad: load,
      totalDurationSecs: dur,
      avgPaceSecs: pace,
    };
  }, [workouts, distanceUnit]);

  // Current Week Mileage & Weekly Goal calculation
  const currentWeekMiles = useMemo(() => {
    const weekStart = activeWeekStartDate || getWeekStartDate(todayStr, 1);
    const weekEnd = addDays(weekStart, 6);
    return workouts
      .filter((w) => w.workoutDate >= weekStart && w.workoutDate <= weekEnd)
      .reduce((sum, w) => sum + convertDistance(w.distance, w.distanceUnit, distanceUnit), 0);
  }, [workouts, activeWeekStartDate, todayStr, distanceUnit]);

  const weeklyTarget = weeklyMileageTarget || 35.0;
  const progressPercent = Math.min(100, Math.round((currentWeekMiles / weeklyTarget) * 100));

  // Average daily load for relative stimulus calculations
  const avgDailyLoad = useMemo(() => {
    if (workouts.length === 0) return 10.0;
    const totalL = workouts.reduce((acc, w) => acc + w.load, 0);
    const uniqueDays = new Set(workouts.map((w) => w.workoutDate)).size;
    return uniqueDays > 0 ? totalL / uniqueDays : 10.0;
  }, [workouts]);

  return (
    <div className="tab-container">
      {/* Target Race Countdown Banner (If Configured) */}
      {targetRace && (
        <div className="mb-4">
          <RaceCountdownBanner targetRace={targetRace} todayStr={todayStr} />
        </div>
      )}

      {/* Strava-Style Top Banner / Summary */}
      <div className="strava-summary-bar flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="strava-profile-stat">
            <span className="strava-stat-label">Activities</span>
            <span className="strava-stat-val font-mono whitespace-nowrap">{workouts.length}</span>
          </div>
          <div className="strava-profile-stat">
            <span className="strava-stat-label">Total Dist</span>
            <span className="strava-stat-val font-mono whitespace-nowrap">
              {totalDistance.toFixed(1)}{' '}
              <span className="text-xs text-muted font-normal">{distanceUnit.toUpperCase()}</span>
            </span>
          </div>
          {totalDurationSecs > 0 && (
            <div className="strava-profile-stat">
              <span className="strava-stat-label">Time</span>
              <span className="strava-stat-val font-mono whitespace-nowrap">
                {formatDurationStrava(totalDurationSecs)}
              </span>
            </div>
          )}
          {avgPaceSecs && avgPaceSecs > 0 && (
            <div className="strava-profile-stat">
              <span className="strava-stat-label">Avg Pace</span>
              <span className="strava-stat-val font-mono text-accent whitespace-nowrap">
                {formatPace(avgPaceSecs, distanceUnit)}
              </span>
            </div>
          )}
          <div className="strava-profile-stat">
            <span className="strava-stat-label">Workload</span>
            <span className="strava-stat-val font-mono text-primary font-bold whitespace-nowrap">
              {totalLoad.toFixed(1)}
            </span>
          </div>

          {/* Strava Weekly Goal Progress Ring */}
          <div className="weekly-goal-chip flex items-center gap-2.5 py-1 px-3 rounded-full bg-surface-subtle border border-subtle">
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg className="w-7 h-7 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted/20"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-accent"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xxs font-mono font-bold text-primary">{progressPercent}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xxs uppercase tracking-wider text-muted font-mono font-bold leading-none">
                Weekly Target
              </span>
              <span className="font-mono text-xs font-bold text-primary leading-tight">
                {currentWeekMiles.toFixed(1)} <span className="text-muted font-normal text-xxs">/ {weeklyTarget} {distanceUnit.toUpperCase()}</span>
              </span>
            </div>
          </div>
        </div>

        {onLogRun && (
          <button
            type="button"
            className="btn-action-primary flex items-center gap-1.5 py-2 px-4 text-xs font-bold rounded-full shadow-sm"
            onClick={onLogRun}
            title="Log a new run with popup menu"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Log Run</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="activity-filter-bar">
        <div className="filter-pill-group">
          <button
            type="button"
            className={`btn-filter-pill ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All ({workouts.length})
          </button>
          {DEFAULT_RUN_TYPES.map((t) => {
            const count = workouts.filter((w) => w.runType === t.id).length;
            if (count === 0 && filterType !== t.id) return null;
            return (
              <button
                key={t.id}
                type="button"
                className={`btn-filter-pill ${filterType === t.id ? 'active' : ''}`}
                onClick={() => setFilterType(t.id)}
              >
                {t.name} ({count})
              </button>
            );
          })}
        </div>

        <input
          type="text"
          className="search-input font-mono text-xs"
          placeholder="Search workouts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Activities Feed */}
      <div className="activity-feed">
        {filtered.length === 0 ? (
          <div className="empty-feed-card text-center py-10 px-4 rounded-2xl bg-surface border border-subtle">
            <div className="text-3xl mb-2">👟</div>
            <h4 className="text-primary font-bold text-base mb-1">No recorded activities</h4>
            <p className="text-secondary text-xs max-w-sm mx-auto mb-4">
              {searchQuery || filterType !== 'all'
                ? 'No workouts match the active filter or search query.'
                : 'Start logging your workouts to track acute:chronic workload ratios and prevent injury.'}
            </p>
            {onLogRun && (
              <button
                type="button"
                className="btn-action-primary py-2 px-5 text-xs font-bold rounded-full inline-flex items-center gap-1.5 shadow-sm"
                onClick={onLogRun}
              >
                <span>+</span>
                <span>Log First Run</span>
              </button>
            )}
          </div>
        ) : (
          filtered.map((w) => {
            const runColor = getRunTypeColor(w.runType);
            const distInPref = convertDistance(w.distance, w.distanceUnit, distanceUnit);
            const stimulus = calculateRelativeStimulus(w.load, avgDailyLoad);

            const [year, month, day] = w.workoutDate.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const dateDisplay = dateObj.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const timeDisplay = w.startTime ? formatTimeOfDay(w.startTime) : '';

            const defaultTitle = `${w.runType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Run`;
            const cardTitle = w.title || defaultTitle;

            return (
              <article
                key={w.id}
                className={`activity-card ${w.completed ? 'activity-card-completed' : ''}`}
                style={{ borderLeftColor: runColor }}
              >
                <div className="activity-card-layout">
                  {/* Stride Status Indicator Button */}
                  <button
                    type="button"
                    className={`activity-status-btn ${w.completed ? 'status-btn-done' : 'status-btn-pending'}`}
                    onClick={() => onToggleComplete?.(w)}
                    aria-pressed={w.completed}
                    title={w.completed ? 'Completed (click to mark planned)' : 'Planned (click to mark completed)'}
                  >
                    <svg
                      className="status-check-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="sr-only">{w.completed ? 'Mark as not done' : 'Mark as done'}</span>
                  </button>

                  {/* Main Card Content */}
                  <div className="activity-card-body">
                    {/* Header Row: Meta badges + Actions */}
                    <div className="activity-card-header">
                      <div className="activity-card-meta">
                        <span
                          className="activity-type-badge font-mono text-xs"
                          style={{
                            color: runColor,
                            backgroundColor: `${runColor}18`,
                            borderColor: `${runColor}33`,
                          }}
                        >
                          {w.runType.replace('_', ' ').toUpperCase()} (×{w.multiplier})
                        </span>

                        <span className="activity-date font-mono text-xs text-muted whitespace-nowrap">
                          {dateDisplay} {timeDisplay && `• ${timeDisplay}`}
                        </span>

                        {/* Strava-Style Relative Effort Stimulus Badge */}
                        <span
                          className={`badge-stimulus badge-stimulus-${stimulus.level} text-xxs font-mono whitespace-nowrap`}
                          title={stimulus.description}
                        >
                          {stimulus.label.toUpperCase()}
                        </span>

                        {w.plannedDistance && (
                          <span className="badge-planned text-xxs font-mono whitespace-nowrap">
                            {w.plannedDistance} {distanceUnit.toUpperCase()} PLANNED
                          </span>
                        )}

                        {w.athleteName && (
                          <span className="badge-safe text-xxs font-mono whitespace-nowrap">
                            ATHLETE: {w.athleteName.toUpperCase()}
                          </span>
                        )}

                        {w.isPlanAssigned && (
                          <span className="badge-safe text-xxs font-mono whitespace-nowrap">
                            COACH ASSIGNED
                          </span>
                        )}

                        {w.plannedDistance && (
                          <span
                            className={`badge-compliance badge-compliance-${calculateCompliance(w.plannedDistance, w.distance).status} text-xxs font-mono whitespace-nowrap`}
                          >
                            {calculateCompliance(w.plannedDistance, w.distance).percent}% EXEC
                          </span>
                        )}

                        {w.feeling && (
                          <span className="badge-feeling text-xxs font-semibold whitespace-nowrap">
                            {w.feeling.toUpperCase()}
                          </span>
                        )}

                        {w.rpe && (
                          <span className="badge-rpe text-xxs font-mono whitespace-nowrap">
                            RPE {w.rpe}/10
                          </span>
                        )}

                        {w.shoeName && (
                          <span className="badge-shoe text-xxs whitespace-nowrap">
                            👟 {w.shoeName}
                          </span>
                        )}
                      </div>

                      <div className="activity-actions">
                        <button
                          type="button"
                          className="btn-activity-edit"
                          onClick={() => {
                            if (onEditRun) {
                              onEditRun(w);
                            } else if (onEditWorkoutDate) {
                              onEditWorkoutDate(w.workoutDate);
                            }
                          }}
                          title="Edit this run individually in pop-up menu"
                        >
                          Edit ✎
                        </button>
                        <button
                          type="button"
                          className="btn-activity-del"
                          onClick={() => onDeleteWorkout(w.id)}
                          title="Delete workout"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Workout Card Title */}
                    <h3 className={`activity-card-title ${w.completed ? 'title-done' : ''}`}>
                      {cardTitle}
                    </h3>

                    {/* Dedicated Metrics Box (like Stride: rounded-2xl bg-surface-elevated/70 p-3.5 border border-subtle) */}
                    <div className="activity-stats-row">
                      <div className="activity-stat">
                        <span className="activity-stat-label">Distance</span>
                        <span className="activity-stat-val font-mono whitespace-nowrap">
                          {distInPref.toFixed(2)}{' '}
                          <span className="activity-stat-unit text-xs text-muted font-normal">{distanceUnit.toUpperCase()}</span>
                        </span>
                      </div>

                      {(w.durationFormatted || (w.durationSeconds && w.durationSeconds > 0)) && (
                        <div className="activity-stat">
                          <span className="activity-stat-label">Time</span>
                          <span className="activity-stat-val font-mono whitespace-nowrap">
                            {w.durationFormatted || formatDuration(w.durationSeconds)}
                          </span>
                        </div>
                      )}

                      {(w.paceFormatted || (w.paceSeconds && w.paceSeconds > 0)) && (
                        <div className="activity-stat">
                          <span className="activity-stat-label">Avg Pace</span>
                          <span className="activity-stat-val font-mono text-accent whitespace-nowrap">
                            {w.paceFormatted || formatPace(w.paceSeconds, distanceUnit)}
                          </span>
                        </div>
                      )}

                      <div className="activity-stat">
                        <span className="activity-stat-label">Workload</span>
                        <span className="activity-stat-val font-mono text-primary font-bold whitespace-nowrap">
                          {w.load.toFixed(1)}
                        </span>
                      </div>

                      <div className="activity-stat">
                        <span className="activity-stat-label">Status</span>
                        <span
                          className={`activity-status-pill font-mono text-xs whitespace-nowrap ${
                            w.completed ? 'status-done' : 'status-plan'
                          }`}
                        >
                          {w.completed ? 'Completed' : 'Planned'}
                        </span>
                      </div>
                    </div>

                    {/* Runner Comments / Notes Box */}
                    {w.comments && (
                      <div className="activity-notes-box">
                        <svg className="notes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <p className="activity-notes-text">{w.comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
