import React, { useState, useMemo } from 'react';
import type { WorkoutRun, DistanceUnit } from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeColor,
  convertDistance,
} from '../utils/calculations';

interface Props {
  workouts: WorkoutRun[];
  distanceUnit: DistanceUnit;
  onEditWorkoutDate: (date: string) => void;
  onDeleteWorkout: (id: string) => void;
}

export const WorkoutsTab: React.FC<Props> = ({
  workouts,
  distanceUnit,
  onEditWorkoutDate,
  onDeleteWorkout,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
  const { totalDistance, totalLoad } = useMemo(() => {
    let dist = 0;
    let load = 0;
    for (const w of workouts) {
      dist += convertDistance(w.distance, w.distanceUnit, distanceUnit);
      load += w.load;
    }
    return { totalDistance: dist, totalLoad: load };
  }, [workouts, distanceUnit]);

  return (
    <div className="tab-container">
      {/* Strava-Style Top Banner / Summary */}
      <div className="strava-summary-bar">
        <div className="strava-profile-stat">
          <span className="strava-stat-label">Total Activities</span>
          <span className="strava-stat-val font-mono">{workouts.length}</span>
        </div>
        <div className="strava-profile-stat">
          <span className="strava-stat-label">Total Distance</span>
          <span className="strava-stat-val font-mono">
            {totalDistance.toFixed(1)} {distanceUnit.toUpperCase()}
          </span>
        </div>
        <div className="strava-profile-stat">
          <span className="strava-stat-label">Total Workload Stress</span>
          <span className="strava-stat-val font-mono text-primary font-bold">
            {totalLoad.toFixed(1)}
          </span>
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
            All Runs ({workouts.length})
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
          placeholder="Filter notes or date..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Activities Feed */}
      <div className="activity-feed">
        {filtered.length === 0 ? (
          <div className="empty-feed-card">
            <h4 className="text-secondary font-semibold text-sm">No recorded workouts match your view</h4>
            <p className="text-muted text-xs mt-1">
              Switch to "1. Log Run" to record runs on any date.
            </p>
          </div>
        ) : (
          filtered.map((w) => {
            const runColor = getRunTypeColor(w.runType);
            const distInPref = convertDistance(w.distance, w.distanceUnit, distanceUnit);

            const [year, month, day] = w.workoutDate.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const dateDisplay = dateObj.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={w.id}
                className="activity-card"
                style={{ borderLeftColor: runColor }}
              >
                <div className="activity-card-header">
                  <div>
                    <span className="activity-date font-mono">{dateDisplay}</span>
                    <span
                      className="activity-type-badge font-mono text-xs"
                      style={{ color: runColor, borderColor: runColor }}
                    >
                      {w.runType.replace('_', ' ').toUpperCase()} (×{w.multiplier})
                    </span>
                  </div>

                  <div className="activity-actions">
                    <button
                      type="button"
                      className="btn-activity-edit"
                      onClick={() => onEditWorkoutDate(w.workoutDate)}
                      title="Edit this day in Log Run"
                    >
                      Edit Day →
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

                {/* Big Stats Row */}
                <div className="activity-stats-row">
                  <div className="activity-stat">
                    <span className="activity-stat-label">Distance</span>
                    <span className="activity-stat-val font-mono">
                      {distInPref.toFixed(2)}{' '}
                      <span className="text-xs text-muted font-normal">{distanceUnit.toUpperCase()}</span>
                    </span>
                  </div>

                  <div className="activity-stat">
                    <span className="activity-stat-label">Workload Load</span>
                    <span className="activity-stat-val font-mono text-primary font-bold">
                      {w.load.toFixed(1)}
                    </span>
                  </div>

                  <div className="activity-stat">
                    <span className="activity-stat-label">Session Status</span>
                    <span
                      className={`activity-status-pill font-mono text-xs ${
                        w.completed ? 'status-done' : 'status-plan'
                      }`}
                    >
                      {w.completed ? 'Completed' : 'Planned'}
                    </span>
                  </div>
                </div>

                {/* Runner Comments / Feelings */}
                {w.comments && (
                  <div className="activity-notes-box">
                    <span className="notes-quote-mark">“</span>
                    <p className="activity-notes-text">{w.comments}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
