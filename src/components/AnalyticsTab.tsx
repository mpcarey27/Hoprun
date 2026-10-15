import React, { useState, useMemo } from 'react';
import type { WeekWorkload, DistanceUnit, UserProfile, WorkoutRun, DayOfWeek } from '../types/acr';
import { ACRTrendChart } from './Charts/ACRTrendChart';
import { WorkloadComparisonChart } from './Charts/WorkloadComparisonChart';
import { MileageBarChart } from './Charts/MileageBarChart';
import { exportWorkloadToCsv } from '../utils/csvExport';
import { ROSTER_USERS, DEFAULT_USER } from '../utils/storage';
import { buildWeeklyWorkloadData } from '../utils/calculations';

export type GraphViewMode = 'acr' | 'workload' | 'mileage' | 'all';

interface Props {
  weeks: WeekWorkload[];
  currentWeek: WeekWorkload | undefined;
  distanceUnit: DistanceUnit;
  onSelectWeek: (startDate: string) => void;
  warningThreshold?: number;
  currentUser?: UserProfile;
  allWorkouts?: WorkoutRun[];
  selectedAthleteFilter?: string;
  onSelectAthleteFilter?: (athleteId: string) => void;
  firstDayOfWeek?: DayOfWeek;
  activeWeekStartDate?: string;
  onOpenAssignRun?: () => void;
}

export const AnalyticsTab: React.FC<Props> = ({
  weeks,
  currentWeek,
  distanceUnit,
  onSelectWeek,
  warningThreshold = 1.2,
  currentUser = DEFAULT_USER,
  allWorkouts = [],
  selectedAthleteFilter = 'all',
  onSelectAthleteFilter = () => {},
  firstDayOfWeek = 1,
  activeWeekStartDate,
  onOpenAssignRun,
}) => {
  // Custom windows options
  const [windowOption, setWindowOption] = useState<'4w' | '8w' | '12w' | 'ytd' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Graph view selection state for All Athletes breakdown
  const [selectedGraphView, setSelectedGraphView] = useState<GraphViewMode>('acr');
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState<boolean>(false);

  // Role & View Access: Only Coach can access the multi-athlete "All Athletes" breakdown
  const isCoach = currentUser.role === 'coach';
  const isAllAthletesMode = isCoach && selectedAthleteFilter === 'all';

  // Find currently selected athlete details when viewing single athlete
  const activeAthleteInfo = useMemo(() => {
    if (selectedAthleteFilter === 'all') return null;
    return (
      ROSTER_USERS.find((u) => u.id === selectedAthleteFilter) || {
        id: selectedAthleteFilter,
        name: selectedAthleteFilter,
        role: 'runner' as const,
        email: '',
      }
    );
  }, [selectedAthleteFilter]);

  // Filter single athlete display weeks according to windowOption
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

  // Build isolated workload breakdowns for every athlete in All Athletes mode
  const athleteBreakdowns = useMemo(() => {
    if (!isAllAthletesMode) return [];

    // Collect roster users and any athletes tagged in workouts
    const athletesMap = new Map<string, { id: string; name: string; role: 'coach' | 'runner' }>();
    ROSTER_USERS.forEach((u) => athletesMap.set(u.id, { id: u.id, name: u.name, role: u.role }));
    allWorkouts.forEach((w) => {
      if (w.athleteId && !athletesMap.has(w.athleteId)) {
        athletesMap.set(w.athleteId, {
          id: w.athleteId,
          name: w.athleteName || 'Athlete',
          role: 'runner',
        });
      }
    });

    return Array.from(athletesMap.values()).map((athlete) => {
      const athleteWorkouts = allWorkouts.filter(
        (w) => w.athleteId === athlete.id || w.athleteName === athlete.name
      );
      const fullWeeks = buildWeeklyWorkloadData(athleteWorkouts, firstDayOfWeek, warningThreshold);

      // Apply window option to athlete's weeks
      let athleteDisplayWeeks = fullWeeks;
      if (windowOption === '4w') {
        athleteDisplayWeeks = fullWeeks.slice(-4);
      } else if (windowOption === '8w') {
        athleteDisplayWeeks = fullWeeks.slice(-8);
      } else if (windowOption === '12w') {
        athleteDisplayWeeks = fullWeeks.slice(-12);
      } else if (windowOption === 'ytd') {
        const currentYear = new Date().getFullYear().toString();
        athleteDisplayWeeks = fullWeeks.filter((w) => w.startDate.startsWith(currentYear));
      } else if (windowOption === 'custom') {
        athleteDisplayWeeks = fullWeeks.filter((w) => {
          const afterStart = !customStartDate || w.startDate >= customStartDate;
          const beforeEnd = !customEndDate || w.endDate <= customEndDate;
          return afterStart && beforeEnd;
        });
      }

      const latestWeek =
        [...athleteDisplayWeeks].reverse().find((w) => w.acr !== null) || fullWeeks[fullWeeks.length - 1];

      const currentWeekForAthlete =
        fullWeeks.find((w) => w.startDate === activeWeekStartDate) || fullWeeks[fullWeeks.length - 1];

      const totalDist = athleteDisplayWeeks.reduce(
        (acc, w) => acc + (distanceUnit === 'mi' ? w.totalMiles : w.totalKm),
        0
      );

      return {
        athlete,
        workouts: athleteWorkouts,
        fullWeeks,
        displayWeeks: athleteDisplayWeeks,
        latestWeek,
        currentWeek: currentWeekForAthlete,
        totalDist,
      };
    });
  }, [
    isAllAthletesMode,
    allWorkouts,
    firstDayOfWeek,
    warningThreshold,
    windowOption,
    customStartDate,
    customEndDate,
    activeWeekStartDate,
    distanceUnit,
  ]);

  const viewLabels: Record<GraphViewMode, { title: string; badge: string; desc: string }> = {
    acr: {
      title: 'ACR Trend',
      badge: '📈 ACR Ratio Trend',
      desc: 'Acute:Chronic workload ratio, safe green corridor (0.8–1.2), & overload warnings (>1.2).',
    },
    workload: {
      title: 'Acute vs Chronic',
      badge: '📊 Acute vs Chronic Load',
      desc: 'Weekly acute fatigue plotted directly against rolling 4-week chronic aerobic baseline.',
    },
    mileage: {
      title: 'Total Mileage',
      badge: '🏃 Weekly Mileage',
      desc: 'Volume bar chart showing weekly training distance in miles/km.',
    },
    all: {
      title: 'All Graphs',
      badge: '📑 All Graphs Suite',
      desc: 'Simultaneous display of ACR Trend, Workload Comparison, and Mileage charts.',
    },
  };

  return (
    <div className="tab-container">
      {/* If Coach is viewing an individual athlete, show return banner */}
      {isCoach && selectedAthleteFilter !== 'all' && activeAthleteInfo && (
        <div className="single-athlete-banner">
          <div className="flex items-center gap-3">
            <span className="athlete-avatar-circle">
              {activeAthleteInfo.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-primary">{activeAthleteInfo.name}</span>
                <span className="badge-xs badge-muted">
                  {activeAthleteInfo.role === 'coach' ? 'Coach' : 'Athlete'}
                </span>
              </div>
              <p className="text-xxs text-muted">
                Viewing complete analytics, charts suite, and historical workload table for this athlete.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-return-team"
            onClick={() => onSelectAthleteFilter('all')}
          >
            ← Back to All Athletes Breakdown
          </button>
        </div>
      )}

      {/* Analytics Toolbar */}
      <div className="analytics-toolbar">
        {/* Time Window Selector Group */}
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

      {/* ===============================================================
          MODE 1: ALL ATHLETES BREAKDOWN (Coach / Admin Only)
          Separated athlete sections with selectable graph view
          =============================================================== */}
      {isAllAthletesMode ? (
        <div className="all-athletes-analytics-section">
          {/* Coach Graph View Selector Bar */}
          <div className="graph-view-control-card">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary uppercase font-mono tracking-wider">
                    Select View:
                  </span>
                  <span className="badge-safe text-xxs font-semibold">
                    {viewLabels[selectedGraphView].badge}
                  </span>
                </div>
                <p className="text-xxs text-muted mt-0.5">
                  {viewLabels[selectedGraphView].desc}
                </p>
              </div>

              {/* Interactive Select View Button & Segmented Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <button
                    type="button"
                    className="btn-select-view-dropdown"
                    onClick={() => setIsViewDropdownOpen((prev) => !prev)}
                    title="Choose graph view on display"
                  >
                    <span>Select View: <strong>{viewLabels[selectedGraphView].title}</strong></span>
                    <span className="text-xxs ml-1">{isViewDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {/* Dropdown Menu */}
                  {isViewDropdownOpen && (
                    <div className="select-view-menu">
                      {(['acr', 'workload', 'mileage', 'all'] as GraphViewMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`select-view-item ${selectedGraphView === mode ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedGraphView(mode);
                            setIsViewDropdownOpen(false);
                          }}
                        >
                          <div className="font-semibold text-xs">{viewLabels[mode].badge}</div>
                          <div className="text-xxs text-muted">{viewLabels[mode].desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Pill Buttons for Fast 1-Click Switching */}
                <div className="segmented-view-group">
                  <button
                    type="button"
                    className={`btn-view-pill ${selectedGraphView === 'acr' ? 'active' : ''}`}
                    onClick={() => setSelectedGraphView('acr')}
                  >
                    ACR Trend
                  </button>
                  <button
                    type="button"
                    className={`btn-view-pill ${selectedGraphView === 'workload' ? 'active' : ''}`}
                    onClick={() => setSelectedGraphView('workload')}
                  >
                    Acute vs Chronic
                  </button>
                  <button
                    type="button"
                    className={`btn-view-pill ${selectedGraphView === 'mileage' ? 'active' : ''}`}
                    onClick={() => setSelectedGraphView('mileage')}
                  >
                    Total Mileage
                  </button>
                  <button
                    type="button"
                    className={`btn-view-pill ${selectedGraphView === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedGraphView('all')}
                  >
                    All Graphs
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Individual Athlete Breakdown Cards */}
          <div className="athlete-breakdown-list">
            {athleteBreakdowns.map((item) => {
              const { athlete, workouts, displayWeeks: aWeeks, latestWeek, currentWeek: aCurrentWeek, totalDist } = item;
              const isSelf = athlete.id === currentUser.id;
              const hasRuns = workouts.length > 0;
              const acrValue = latestWeek?.acr;
              const isOverload = acrValue !== null && acrValue !== undefined && acrValue > warningThreshold;
              const isOptimal = acrValue !== null && acrValue !== undefined && acrValue >= 0.8 && !isOverload;

              return (
                <div key={athlete.id} className="athlete-breakdown-card">
                  {/* Athlete Card Header */}
                  <div className="athlete-card-header">
                    <div className="flex items-center gap-3">
                      <div className="athlete-avatar-circle">
                        {athlete.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="athlete-card-name">
                            {athlete.name} {isSelf ? '(You / Coach)' : ''}
                          </span>
                          <span className="badge-xs badge-muted">
                            {athlete.role === 'coach' ? 'Coach' : 'Athlete'}
                          </span>
                          {/* Real-time Status Badge */}
                          {acrValue !== null && acrValue !== undefined ? (
                            <span className={`badge-xs ${isOverload ? 'badge-danger' : isOptimal ? 'badge-safe' : 'badge-muted'}`}>
                              {isOverload ? 'OVERLOAD (>1.2)' : isOptimal ? 'OPTIMAL (0.8-1.2)' : 'DELOAD'}
                            </span>
                          ) : hasRuns ? (
                            <span className="badge-xs badge-muted">Building Baseline</span>
                          ) : (
                            <span className="badge-xs badge-muted">No Runs Yet</span>
                          )}
                        </div>
                        <span className="text-xxs text-muted">
                          {workouts.length} total logged workouts • {aWeeks.length} active weeks in window
                        </span>
                      </div>
                    </div>

                    {/* Drill-down Button */}
                    <button
                      type="button"
                      className="btn-athlete-focus"
                      onClick={() => onSelectAthleteFilter(athlete.id)}
                      title={`Open full dashboard with all charts and detailed tables for ${athlete.name}`}
                    >
                      View All Charts & Stats for {athlete.name.split(' ')[0]} →
                    </button>
                  </div>

                  {/* Athlete Isolated KPI Row */}
                  <div className="athlete-kpi-row">
                    <div className="athlete-kpi-box">
                      <span className="kpi-mini-label">Latest ACR</span>
                      <span className={`kpi-mini-val font-mono ${isOverload ? 'text-danger' : isOptimal ? 'text-success' : 'text-primary'}`}>
                        {acrValue !== null && acrValue !== undefined ? acrValue.toFixed(2) : 'Need 4w'}
                      </span>
                    </div>

                    <div className="athlete-kpi-box">
                      <span className="kpi-mini-label">Acute Load</span>
                      <span className="kpi-mini-val font-mono text-primary">
                        {aCurrentWeek?.acuteWorkload.toFixed(1) || '0.0'}
                      </span>
                    </div>

                    <div className="athlete-kpi-box">
                      <span className="kpi-mini-label">Chronic Baseline</span>
                      <span className="kpi-mini-val font-mono text-warning">
                        {aCurrentWeek?.chronicWorkload !== null && aCurrentWeek?.chronicWorkload !== undefined
                          ? aCurrentWeek.chronicWorkload.toFixed(1)
                          : 'Building'}
                      </span>
                    </div>

                    <div className="athlete-kpi-box">
                      <span className="kpi-mini-label">Window Mileage</span>
                      <span className="kpi-mini-val font-mono text-white">
                        {totalDist.toFixed(1)}{' '}
                        <span className="text-xxs font-normal text-muted">{distanceUnit.toUpperCase()}</span>
                      </span>
                    </div>
                  </div>

                  {/* Athlete Graph Display (Respecting Select View) */}
                  <div className="athlete-chart-preview">
                    {!hasRuns || aWeeks.length === 0 ? (
                      <div className="empty-feed-card text-center py-6">
                        <p className="text-secondary font-medium text-xs">
                          No workout data logged yet for {athlete.name}.
                        </p>
                        {onOpenAssignRun && athlete.role === 'runner' && (
                          <button
                            type="button"
                            className="btn-action-primary text-xs py-1 px-3 mt-2"
                            onClick={onOpenAssignRun}
                          >
                            + Prescribe Run for {athlete.name.split(' ')[0]}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {selectedGraphView === 'acr' && (
                          <ACRTrendChart weeks={aWeeks} warningThreshold={warningThreshold} />
                        )}
                        {selectedGraphView === 'workload' && (
                          <WorkloadComparisonChart weeks={aWeeks} />
                        )}
                        {selectedGraphView === 'mileage' && (
                          <MileageBarChart weeks={aWeeks} unit={distanceUnit} />
                        )}
                        {selectedGraphView === 'all' && (
                          <div className="charts-container">
                            <ACRTrendChart weeks={aWeeks} warningThreshold={warningThreshold} />
                            <WorkloadComparisonChart weeks={aWeeks} />
                            <MileageBarChart weeks={aWeeks} unit={distanceUnit} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ===============================================================
            MODE 2: INDIVIDUAL ATHLETE FULL SUITE
            (Standard view when an athlete is selected, or runner is logged in)
            Shows ALL graphs/charts, full KPI cards, & historical table
            =============================================================== */
        <>
          {/* Full KPI Cards */}
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

          {/* SVG Charts: Full Suite */}
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
        </>
      )}
    </div>
  );
};
