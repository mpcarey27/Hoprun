import React, { useState, useMemo } from 'react';
import type { WeekWorkload, DistanceUnit } from '../types/acr';
import { ACRTrendChart } from './Charts/ACRTrendChart';
import { WorkloadComparisonChart } from './Charts/WorkloadComparisonChart';
import { MileageBarChart } from './Charts/MileageBarChart';
import { exportWorkloadToCsv } from '../utils/csvExport';

interface Props {
  weeks: WeekWorkload[];
  currentWeek: WeekWorkload | undefined;
  distanceUnit: DistanceUnit;
  onSelectWeek: (startDate: string) => void;
  warningThreshold?: number;
}

export const AnalyticsTab: React.FC<Props> = ({
  weeks,
  currentWeek,
  distanceUnit,
  onSelectWeek,
  warningThreshold = 1.2,
}) => {
  // Custom windows options
  const [windowOption, setWindowOption] = useState<'4w' | '8w' | '12w' | 'ytd' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const displayWeeks = useMemo(() => {
    if (weeks.length === 0) return [];

    if (windowOption === '4w') {
      return weeks.slice(-4);
    }
    if (windowOption === '8w') {
      return weeks.slice(-8);
    }
    if (windowOption === '12w') {
      return weeks.slice(-12);
    }
    if (windowOption === 'ytd') {
      const currentYear = new Date().getFullYear().toString();
      return weeks.filter((w) => w.startDate.startsWith(currentYear));
    }
    if (windowOption === 'custom') {
      return weeks.filter((w) => {
        const afterStart = !customStartDate || w.startDate >= customStartDate;
        const beforeEnd = !customEndDate || w.endDate <= customEndDate;
        return afterStart && beforeEnd;
      });
    }
    return weeks;
  }, [weeks, windowOption, customStartDate, customEndDate]);

  const latestCalculatedWeek = [...displayWeeks].reverse().find((w) => w.acr !== null) || currentWeek;

  return (
    <div className="tab-container">
      {/* Analytics Custom Window Bar & Clean CSV Button */}
      <div className="analytics-toolbar">
        <div className="window-selector-group">
          <span className="text-xxs text-muted uppercase font-mono mr-2">Window:</span>
          <button
            type="button"
            className={`btn-window ${windowOption === '4w' ? 'active' : ''}`}
            onClick={() => setWindowOption('4w')}
          >
            Last 4 Weeks
          </button>
          <button
            type="button"
            className={`btn-window ${windowOption === '8w' ? 'active' : ''}`}
            onClick={() => setWindowOption('8w')}
          >
            Last 8 Weeks
          </button>
          <button
            type="button"
            className={`btn-window ${windowOption === '12w' ? 'active' : ''}`}
            onClick={() => setWindowOption('12w')}
          >
            Last 12 Weeks
          </button>
          <button
            type="button"
            className={`btn-window ${windowOption === 'ytd' ? 'active' : ''}`}
            onClick={() => setWindowOption('ytd')}
          >
            Year to Date
          </button>
          <button
            type="button"
            className={`btn-window ${windowOption === 'all' ? 'active' : ''}`}
            onClick={() => setWindowOption('all')}
          >
            All History ({weeks.length}w)
          </button>
          <button
            type="button"
            className={`btn-window ${windowOption === 'custom' ? 'active' : ''}`}
            onClick={() => setWindowOption('custom')}
          >
            Custom Range
          </button>
        </div>

        {/* Clean text button with zero emoji */}
        <button
          type="button"
          className="btn-clean-export"
          onClick={() => exportWorkloadToCsv(displayWeeks, distanceUnit)}
          title="Download CSV"
        >
          Export CSV
        </button>
      </div>

      {/* Custom Date Pickers if 'custom' is active */}
      {windowOption === 'custom' && (
        <div className="custom-range-card">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="form-group">
              <label className="text-xxs text-muted font-mono">From Date:</label>
              <input
                type="date"
                className="input-field text-xs font-mono"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="text-xxs text-muted font-mono">To Date:</label>
              <input
                type="date"
                className="input-field text-xs font-mono"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                className="text-xs text-secondary hover:text-white underline mt-3"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
              >
                Clear Range
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Latest ACR Ratio</span>
          <div className="flex items-baseline gap-2">
            <span
              className={`kpi-val font-mono ${
                latestCalculatedWeek?.acr && latestCalculatedWeek.acr > warningThreshold
                  ? 'text-danger'
                  : latestCalculatedWeek?.acr && latestCalculatedWeek.acr >= 0.8
                  ? 'text-success'
                  : 'text-primary'
              }`}
            >
              {latestCalculatedWeek?.acr !== null && latestCalculatedWeek?.acr !== undefined
                ? latestCalculatedWeek.acr.toFixed(2)
                : 'Need 4w'}
            </span>
            {latestCalculatedWeek?.acr && (
              <span
                className={`badge-xs ${
                  latestCalculatedWeek.acr > warningThreshold
                    ? 'badge-danger'
                    : latestCalculatedWeek.acr >= 0.8
                    ? 'badge-safe'
                    : 'badge-muted'
                }`}
              >
                {latestCalculatedWeek.acr > warningThreshold
                  ? 'OVERLOAD (>1.2)'
                  : latestCalculatedWeek.acr >= 0.8
                  ? 'OPTIMAL (0.8-1.2)'
                  : 'DELOAD'}
              </span>
            )}
          </div>
          <span className="text-xxs text-muted">
            {latestCalculatedWeek?.weekNumber ? `Week ${latestCalculatedWeek.weekNumber}` : 'Active Cycle'}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Current Acute Workload</span>
          <span className="kpi-val font-mono text-primary">
            {currentWeek?.acuteWorkload.toFixed(1) || '0.0'}
          </span>
          <span className="text-xxs text-muted">Current week stress score</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">4-Week Chronic Baseline</span>
          <span className="kpi-val font-mono text-warning">
            {currentWeek?.chronicWorkload !== null ? currentWeek?.chronicWorkload?.toFixed(1) : 'Building'}
          </span>
          <span className="text-xxs text-muted">Rolling aerobic baseline</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Total Mileage in Window</span>
          <span className="kpi-val font-mono text-white">
            {displayWeeks.reduce((acc, w) => acc + (distanceUnit === 'mi' ? w.totalMiles : w.totalKm), 0).toFixed(1)}{' '}
            <span className="text-xs font-normal text-muted">{distanceUnit.toUpperCase()}</span>
          </span>
          <span className="text-xxs text-muted">Across {displayWeeks.length} training weeks</span>
        </div>
      </div>

      {/* SVG Charts */}
      {displayWeeks.length === 0 ? (
        <div className="empty-feed-card">
          <h4 className="text-secondary font-semibold text-sm">No training data logged yet</h4>
          <p className="text-muted text-xs mt-1">
            Log your daily workouts in "1. Log Run". ACR ratio line will appear once 4 weeks of training are logged.
          </p>
        </div>
      ) : (
        <div className="charts-container">
          <ACRTrendChart weeks={displayWeeks} warningThreshold={warningThreshold} />
          <WorkloadComparisonChart weeks={displayWeeks} />
          <MileageBarChart weeks={displayWeeks} unit={distanceUnit} />
        </div>
      )}

      {/* Detailed Tabular Historical Breakdown */}
      {displayWeeks.length > 0 && (
        <div className="history-table-section">
          <h3 className="section-heading">Detailed Calculations in Window</h3>
          <div className="table-responsive">
            <table className="acr-table">
              <thead>
                <tr>
                  <th>Week #</th>
                  <th>Date Range</th>
                  <th>Total Miles</th>
                  <th>Total KM</th>
                  <th>Acute Workload</th>
                  <th>Chronic (4-Wk Avg)</th>
                  <th>ACR Ratio</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayWeeks.map((w) => {
                  const isSelected = currentWeek?.startDate === w.startDate;
                  const isExceeded = w.acr !== null && w.acr > warningThreshold;

                  return (
                    <tr
                      key={w.startDate}
                      className={`${isSelected ? 'row-selected' : ''} ${isExceeded ? 'row-exceeded' : ''}`}
                    >
                      <td className="font-mono font-semibold">W{w.weekNumber}</td>
                      <td className="font-mono text-xs">{w.startDate} → {w.endDate}</td>
                      <td className="font-mono">{w.totalMiles.toFixed(1)}</td>
                      <td className="font-mono">{w.totalKm.toFixed(1)}</td>
                      <td className="font-mono font-semibold text-primary">{w.acuteWorkload.toFixed(1)}</td>
                      <td className="font-mono text-warning">
                        {w.chronicWorkload !== null ? w.chronicWorkload.toFixed(1) : '—'}
                      </td>
                      <td className="font-mono font-bold">
                        {w.acr !== null ? (
                          <span className={isExceeded ? 'text-danger' : 'text-success'}>
                            {w.acr.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">Need 4w</span>
                        )}
                      </td>
                      <td>
                        {w.status === 'warning' && (
                          <span className="badge-danger text-xs">⚠️ &gt; 1.2 Warning</span>
                        )}
                        {w.status === 'safe' && (
                          <span className="badge-safe text-xs">✓ Optimal</span>
                        )}
                        {w.status === 'deload' && (
                          <span className="badge-muted text-xs">Deload</span>
                        )}
                        {w.status === 'baseline' && (
                          <span className="badge-muted text-xs">Baseline</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-table-edit"
                          onClick={() => onSelectWeek(w.startDate)}
                        >
                          View in Log Run →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
