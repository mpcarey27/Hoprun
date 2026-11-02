import React, { useState, useMemo } from 'react';
import type { WorkoutRun, DistanceUnit, TargetRace } from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeColor,
  convertDistance,
  formatDuration,
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
  onOpenStravaConnect?: () => void;
  stravaConnected?: boolean;
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
  onOpenStravaConnect,
  stravaConnected = false,
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

      {/* Feed Header: Title, Weekly Target Progress, and Primary Action */}
      <div className="feed-header-bar">
        <div className="feed-header-left">
          <div className="feed-title-row">
            <h2 className="feed-title">Activities</h2>
            <span className="feed-count-chip font-mono">
              {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
            </span>
          </div>
          <p className="feed-subtitle">
            Recent running sessions and workload progression
          </p>
        </div>

        <div className="feed-header-right">
          {/* Sleek Weekly Target Progress Module */}
          <div
            className={`weekly-target-widget ${progressPercent >= 100 ? 'target-completed' : ''}`}
            title={`Weekly Target: ${currentWeekMiles.toFixed(1)} / ${weeklyTarget} ${distanceUnit.toUpperCase()} completed (${progressPercent}%)`}
          >
            <div className="target-progress-ring">
              <svg className="target-ring-svg" viewBox="0 0 36 36">
                <path
                  className="ring-track"
                  strokeWidth="3.5"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="ring-fill"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="ring-percentage font-mono">{progressPercent}%</span>
            </div>
            <div className="target-details">
              <span className="target-label font-mono">Weekly Target</span>
              <span className="target-numbers font-mono">
                {currentWeekMiles.toFixed(1)}{' '}
                <span className="target-goal">/ {weeklyTarget} {distanceUnit.toUpperCase()}</span>
              </span>
            </div>
          </div>

          {onLogRun && (
            <button
              type="button"
              className="btn-action-primary btn-log-run-header"
              onClick={onLogRun}
              title="Log a new run with popup menu"
            >
              <span className="btn-plus-icon leading-none">+</span>
              <span>Log Run</span>
            </button>
          )}
        </div>
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

        <div className="search-input-wrapper">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input font-mono text-xs"
            placeholder="Search workouts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Strava 1-Click Connect Banner */}
      {!stravaConnected && onOpenStravaConnect && (
        <div className="strava-hero-banner mb-4 p-3.5 rounded-2xl bg-surface border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in">
          <div className="flex items-center gap-3">
            <div className="strava-badge-icon-box">
              <svg viewBox="0 0 24 24" fill="#FC4C02" style={{ width: '22px', height: '22px' }} aria-hidden="true">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.01 13.828h4.172" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <strong className="text-xs font-bold text-primary">Sync Your Runs via Strava</strong>
                <span className="badge-strava font-mono text-xxs font-bold">STRAVA SYNC</span>
              </div>
              <p className="text-xxs text-secondary leading-normal">
                Connect your Strava account to automatically sync your runs, pace, distance &amp; heart rate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              className="btn-strava-banner-cta font-mono text-xs font-bold whitespace-nowrap"
              onClick={onOpenStravaConnect}
              title="Connect your Strava account"
            >
              Connect Strava →
            </button>
          </div>
        </div>
      )}

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

                        {/* Strava, Garmin & Google Sheets Device & Telemetry Badges */}
                        {w.source === 'google_sheets' && (
                          <span
                            className="text-xxs font-mono whitespace-nowrap"
                            style={{
                              padding: '0.15rem 0.45rem',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.14)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              fontWeight: 700,
                            }}
                            title="Synced from Color-Coded Google Sheet"
                          >
                            📊 SHEET PLAN
                          </span>
                        )}

                        {w.source === 'strava' && (
                          <span className="badge-strava text-xxs font-mono whitespace-nowrap" title="Synced from Strava">
                            🟠 STRAVA
                          </span>
                        )}

                        {w.averageHeartRate && (
                          <span
                            className="badge-hr text-xxs font-mono whitespace-nowrap"
                            title={w.maxHeartRate ? `Avg: ${w.averageHeartRate} bpm, Max: ${w.maxHeartRate} bpm` : `${w.averageHeartRate} bpm avg`}
                          >
                            ❤️ {w.averageHeartRate} BPM
                          </span>
                        )}

                        {w.elevationGainFeet !== undefined && w.elevationGainFeet > 0 && (
                          <span className="badge-elevation text-xxs font-mono whitespace-nowrap" title={`${w.elevationGainFeet} ft elevation gain`}>
                            ⛰️ +{w.elevationGainFeet} FT
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
                          title="Change run type or add/read comments on this run"
                        >
                          Edit Type / Comment ✎
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

                      {w.averageHeartRate && (
                        <div className="activity-stat">
                          <span className="activity-stat-label">Avg HR</span>
                          <span className="activity-stat-val font-mono text-danger whitespace-nowrap">
                            {w.averageHeartRate}{' '}
                            <span className="activity-stat-unit text-xs text-muted font-normal">BPM</span>
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

                    {/* Athlete Strava Post Description Snippet */}
                    {w.athleteComment && (
                      <div
                        className="activity-athlete-comment-box mb-2 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 cursor-pointer"
                        onClick={() => onEditRun && onEditRun(w)}
                        title="Click to edit or adjust this workout"
                      >
                        <span className="text-amber-400 text-sm mt-0.5">💬</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xxs font-mono uppercase text-amber-400 font-bold">
                              Athlete Strava Post Description
                            </span>
                            <span className="text-xxs font-mono text-amber-300/80">
                              Edit Run ✎
                            </span>
                          </div>
                          <p className="text-xs text-amber-100/90 whitespace-pre-wrap leading-relaxed">
                            {w.athleteComment}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Runner Comments / Notes Section (Click to Read or Edit) */}
                    {w.comments && (!w.athleteComment || (w.comments !== w.athleteComment && !w.comments.startsWith(w.athleteComment))) ? (
                      <div
                        className="activity-notes-box cursor-pointer"
                        onClick={() => onEditRun && onEditRun(w)}
                        title="Click to edit comment or run type"
                      >
                        <svg className="notes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xxs font-mono uppercase text-accent font-bold">
                              Run Comment
                            </span>
                            <span className="text-xxs font-mono text-muted">
                              Edit Comment ✎
                            </span>
                          </div>
                          <p className="activity-notes-text">{w.comments}</p>
                        </div>
                      </div>
                    ) : !w.athleteComment ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="text-xxs font-mono text-muted hover:text-accent transition-colors"
                          onClick={() => onEditRun && onEditRun(w)}
                        >
                          💬 + Add a comment to this run...
                        </button>
                      </div>
                    ) : null}
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
