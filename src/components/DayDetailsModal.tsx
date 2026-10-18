import React from 'react';
import type { WorkoutRun, DistanceUnit } from '../types/acr';
import {
  getRunTypeColor,
  convertDistance,
  getRunTypeMultiplier,
  formatDuration,
  formatPace,
} from '../utils/calculations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
  runs: WorkoutRun[];
  distanceUnit: DistanceUnit;
  onGoToLogRun: (date: string) => void;
}

export const DayDetailsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  date,
  runs,
  distanceUnit,
  onGoToLogRun,
}) => {
  if (!isOpen || !date) return null;

  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const formattedFullDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const totalDist = runs.reduce((acc, r) => {
    return acc + convertDistance(r.distance, r.distanceUnit, distanceUnit);
  }, 0);

  const totalLoad = runs.reduce((acc, r) => acc + r.load, 0);
  const totalDurSecs = runs.reduce((acc, r) => acc + (r.durationSeconds || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-lg animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-details-title"
      >
        <div className="modal-header">
          <div>
            <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
              Training Log
            </span>
            <h2 id="day-details-title" className="modal-title">
              {formattedFullDate}
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
          {/* Day Totals Summary Strip */}
          <div className="day-quick-metrics mb-4">
            <div className="quick-metric">
              <span className="metric-label">Distance</span>
              <span className="metric-val font-mono" style={{ color: 'var(--text-primary)' }}>
                {totalDist.toFixed(2)} {distanceUnit.toUpperCase()}
              </span>
            </div>
            <div className="quick-metric">
              <span className="metric-label">Workload</span>
              <span className="metric-val font-mono text-primary font-bold">
                {totalLoad.toFixed(1)}
              </span>
            </div>
            {totalDurSecs > 0 && (
              <div className="quick-metric">
                <span className="metric-label">Time</span>
                <span className="metric-val font-mono" style={{ color: 'var(--text-primary)' }}>
                  {formatDuration(totalDurSecs)}
                </span>
              </div>
            )}
            <div className="quick-metric">
              <span className="metric-label">Activities</span>
              <span className="metric-val font-mono" style={{ color: 'var(--text-primary)' }}>
                {runs.length} {runs.length === 1 ? 'Run' : 'Runs'}
              </span>
            </div>
            <div className="quick-metric">
              <span className="metric-label">Status</span>
              <span className="metric-val font-mono">
                {runs.length === 0 ? (
                  <span className="text-muted">Rest Day</span>
                ) : runs.every((r) => r.completed) ? (
                  <span className="text-success">Completed</span>
                ) : (
                  <span className="text-accent">Planned</span>
                )}
              </span>
            </div>
          </div>

          {/* Runs List */}
          {runs.length === 0 ? (
            <div className="empty-day-box py-8 text-center">
              <div className="text-2xl mb-2">👟</div>
              <h4 className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Rest Day</h4>
              <p className="text-muted text-xs">
                No runs recorded for this date.
              </p>
            </div>
          ) : (
            <div className="day-runs-detail-list space-y-3">
              {runs.map((run, idx) => {
                const color = getRunTypeColor(run.runType);
                const mult = run.multiplier || getRunTypeMultiplier(run.runType);

                return (
                  <div
                    key={run.id || idx}
                    className="day-run-detail-card"
                    style={{
                      borderLeft: `4px solid ${color}`,
                      backgroundColor: 'var(--bg-surface-elevated)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: `1px solid var(--border-subtle)`,
                      borderLeftColor: color,
                    }}
                  >
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="run-badge-tag font-mono text-xs font-bold">
                          Run #{idx + 1}
                        </span>
                        <span
                          className="run-type-pill text-xs font-mono font-bold px-2 py-0.5 rounded"
                          style={{
                            color,
                            backgroundColor: `${color}18`,
                            borderColor: color,
                          }}
                        >
                          {run.runType.replace('_', ' ').toUpperCase()} (×{mult})
                        </span>
                        {run.athleteName && (
                          <span className="badge-safe text-xxs font-mono">
                            ATHLETE: {run.athleteName.toUpperCase()}
                          </span>
                        )}
                        {run.isPlanAssigned && (
                          <span className="badge-safe text-xxs font-mono">
                            COACH ASSIGNED
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                          run.completed
                            ? 'status-done'
                            : 'status-plan'
                        }`}
                      >
                        {run.completed ? '✓ Completed' : '⏳ Planned'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <div className="p-2 rounded" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                        <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                          Distance
                        </span>
                        <strong className="text-base font-mono" style={{ color: 'var(--text-primary)' }}>
                          {run.distance} {run.distanceUnit.toUpperCase()}
                        </strong>
                      </div>

                      <div className="p-2 rounded" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                        <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                          Workload
                        </span>
                        <strong className="text-base font-mono text-primary font-bold">
                          {run.load.toFixed(1)}
                        </strong>
                      </div>

                      <div className="p-2 rounded" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                        <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                          Time
                        </span>
                        <strong className="text-base font-mono" style={{ color: 'var(--text-primary)' }}>
                          {run.durationFormatted || (run.durationSeconds ? formatDuration(run.durationSeconds) : '—')}
                        </strong>
                      </div>

                      <div className="p-2 rounded" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                        <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                          Avg Pace
                        </span>
                        <strong className="text-base font-mono text-accent font-bold">
                          {run.paceFormatted || (run.paceSeconds ? formatPace(run.paceSeconds, run.distanceUnit) : '—')}
                        </strong>
                      </div>
                    </div>

                    {/* Athlete / Coach Notes with Wrapped Text */}
                    <div
                      className="day-run-notes-box p-2.5 rounded"
                      style={{
                        backgroundColor: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                        Notes
                      </span>
                      <p
                        className="text-xs font-sans"
                        style={{
                          color: 'var(--text-secondary)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          lineHeight: '1.45',
                          margin: 0,
                        }}
                      >
                        {run.comments ? run.comments : <em className="text-muted">No notes</em>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer flex items-center justify-between">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>

          <button
            type="button"
            className="btn-action-primary"
            onClick={() => {
              onClose();
              onGoToLogRun(date);
            }}
          >
            Log / Edit Run →
          </button>
        </div>
      </div>
    </div>
  );
};
