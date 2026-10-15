import React from 'react';
import type { InWeekPrediction } from '../utils/calculations';

interface Props {
  prediction: InWeekPrediction;
  warningThreshold?: number;
}

export const InWeekWarningBanner: React.FC<Props> = ({
  prediction,
  warningThreshold = 1.2,
}) => {
  if (prediction.severity === 'normal' && !prediction.isPredictedToExceed) {
    return (
      <div className="inweek-ribbon-optimal">
        <div className="ribbon-content">
          <span className="ribbon-status-dot">●</span>
          <span className="ribbon-badge">OPTIMAL SWEET SPOT</span>
          <span className="ribbon-metrics">
            Projected ACR: <strong className="font-mono text-white">{prediction.projectedAcr !== null ? prediction.projectedAcr.toFixed(2) : '—'}</strong>
            <span className="text-muted text-xs ml-1.5">(Safe ceiling: {warningThreshold.toFixed(2)})</span>
          </span>
          {prediction.remainingSafeLoad !== null && (
            <span className="ribbon-budget font-mono">
              · <strong className="text-success">{prediction.remainingSafeLoad.toFixed(0)}</strong> safe workload pts remaining
            </span>
          )}
        </div>
      </div>
    );
  }

  const isCritical = prediction.hasAlreadyExceeded;

  return (
    <div className={`inweek-banner ${isCritical ? 'inweek-critical' : 'inweek-warning'}`}>
      <div className="inweek-content">
        <div className="inweek-header">
          <span className={`inweek-badge ${isCritical ? 'badge-critical' : 'badge-caution'}`}>
            {isCritical ? '⚠️ THRESHOLD BREACHED' : '⚠️ PREDICTED EXCEEDANCE'}
          </span>
          <div className="inweek-metrics">
            <span>
              Current ACR: <strong className="font-mono text-white">{prediction.currentAcr !== null ? prediction.currentAcr.toFixed(2) : '—'}</strong>
            </span>
            <span className="mx-2">·</span>
            <span>
              Projected End-of-Week ACR: <strong className="font-mono text-danger font-bold">{prediction.projectedAcr !== null ? prediction.projectedAcr.toFixed(2) : '—'}</strong>
            </span>
            <span className="mx-2">·</span>
            <span className="text-muted">Threshold: {warningThreshold.toFixed(2)}</span>
          </div>
        </div>

        <p className="inweek-text">
          {prediction.message}
        </p>

        <div className="inweek-breakdown">
          <div className="breakdown-stat">
            <span className="stat-label">Days Elapsed</span>
            <span className="stat-value">{prediction.daysElapsed} / 7</span>
          </div>
          <div className="breakdown-stat">
            <span className="stat-label">Completed Load</span>
            <span className="stat-value">{prediction.completedLoad}</span>
          </div>
          <div className="breakdown-stat">
            <span className="stat-label">Remaining Planned Load</span>
            <span className="stat-value">{prediction.plannedRemainingLoad}</span>
          </div>
          <div className="breakdown-stat">
            <span className="stat-label">Safe Load Budget</span>
            <span className="stat-value text-accent">
              {prediction.safeMaxLoadForWeek !== null ? prediction.safeMaxLoadForWeek.toFixed(0) : '—'}
            </span>
          </div>
          <div className="breakdown-stat">
            <span className="stat-label">Safe Buffer Left</span>
            <span className={`stat-value ${isCritical ? 'text-danger' : 'text-warning'}`}>
              {prediction.remainingSafeLoad !== null ? `${prediction.remainingSafeLoad.toFixed(0)} pts` : '0 pts'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
