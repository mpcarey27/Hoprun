import React, { useState, useMemo } from 'react';
import type { WeekWorkload, DistanceUnit, WorkoutRun } from '../types/acr';
import {
  getRunTypeColor,
  addDays,
  getMonthCalendarWeeks,
  convertDistance,
  formatDate,
  formatTimeOfDay,
} from '../utils/calculations';
import { DayDetailsModal } from './DayDetailsModal';

interface Props {
  weeks: WeekWorkload[];
  activeWeekStartDate: string;
  onSelectWeekStart: (startDate: string) => void;
  onSelectDay: (date: string) => void;
  distanceUnit: DistanceUnit;
  warningThreshold?: number;
  workouts?: WorkoutRun[];
  onEditRun?: (run: WorkoutRun) => void;
  onLogRun?: (date?: string) => void;
}

export const TrainingLogTab: React.FC<Props> = ({
  weeks,
  activeWeekStartDate,
  onSelectWeekStart,
  onSelectDay,
  distanceUnit,
  warningThreshold = 1.2,
  workouts = [],
  onEditRun,
  onLogRun,
}) => {
  // View Modes: 'calendar' (Big Month Calendar) or 'week' (Week Breakdown)
  const [logViewMode, setLogViewMode] = useState<'calendar' | 'week'>('calendar');

  const todayStr = useMemo(() => formatDate(new Date()), []);

  // Calendar month state: defaults to active week's month or current month
  const [calYear, setCalYear] = useState<number>(() => {
    const baseDate = activeWeekStartDate || todayStr;
    return Number(baseDate.slice(0, 4)) || new Date().getFullYear();
  });

  const [calMonth, setCalMonth] = useState<number>(() => {
    const baseDate = activeWeekStartDate || todayStr;
    return Number(baseDate.slice(5, 7)) || new Date().getMonth() + 1;
  });

  // Popup modal state for clicking a day
  const [selectedDayForModal, setSelectedDayForModal] = useState<string | null>(null);

  // Index workouts by date for O(1) day lookup
  const runsByDate = useMemo(() => {
    const map = new Map<string, WorkoutRun[]>();
    for (const r of workouts) {
      const list = map.get(r.workoutDate) || [];
      list.push(r);
      map.set(r.workoutDate, list);
    }
    return map;
  }, [workouts]);

  // Index weeks by weekStartDate for O(1) week summary lookup
  const weeksByStart = useMemo(() => {
    const map = new Map<string, WeekWorkload>();
    for (const w of weeks) {
      map.set(w.startDate, w);
    }
    return map;
  }, [weeks]);

  // 7-day week rows for the selected month (Monday as first day)
  const monthWeeks = useMemo(() => {
    return getMonthCalendarWeeks(calYear, calMonth, 1);
  }, [calYear, calMonth]);

  const monthTitle = useMemo(() => {
    const d = new Date(calYear, calMonth - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calYear, calMonth]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (calMonth === 1) {
      setCalMonth(12);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 12) {
      setCalMonth(1);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth() + 1);
  };

  // Month aggregate volume
  const monthStats = useMemo(() => {
    const monthPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
    let totalDist = 0;
    let runsCount = 0;
    let totalLoad = 0;

    for (const w of workouts) {
      if (w.workoutDate.startsWith(monthPrefix)) {
        totalDist += convertDistance(w.distance, w.distanceUnit, distanceUnit);
        totalLoad += w.load;
        runsCount++;
      }
    }

    return {
      totalDist: Number(totalDist.toFixed(1)),
      totalLoad: Number(totalLoad.toFixed(1)),
      runsCount,
    };
  }, [calYear, calMonth, workouts, distanceUnit]);

  // Runs for the active day modal
  const modalRuns = useMemo(() => {
    if (!selectedDayForModal) return [];
    return runsByDate.get(selectedDayForModal) || [];
  }, [selectedDayForModal, runsByDate]);

  // Existing week view calculation
  const currentWeek =
    weeks.find((w) => w.startDate === activeWeekStartDate) || weeks[weeks.length - 1];

  return (
    <div className="tab-container">
      {/* View Switcher: Big Calendar View vs Week Breakdown */}
      <div className="log-top-bar">
        <div className="log-mode-buttons">
          <button
            type="button"
            className={`btn-log-mode ${logViewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setLogViewMode('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`btn-log-mode ${logViewMode === 'week' ? 'active' : ''}`}
            onClick={() => setLogViewMode('week')}
          >
            Week Breakdown
          </button>
        </div>

        {logViewMode === 'calendar' && (
          <div className="flex items-center gap-2">
            <span className="text-xxs font-mono text-muted uppercase">Volume:</span>
            <span className="font-mono text-xs font-bold text-primary whitespace-nowrap">
              {monthStats.totalDist} {distanceUnit.toUpperCase()}
            </span>
            <span className="text-muted text-xs">·</span>
            <span className="font-mono text-xs text-primary font-bold whitespace-nowrap">
              {monthStats.totalLoad} pts
            </span>
          </div>
        )}

        {logViewMode === 'week' && (
          <div className="week-stepper">
            <button
              type="button"
              className="btn-step"
              onClick={() => onSelectWeekStart(addDays(activeWeekStartDate, -7))}
            >
              ← Prev
            </button>
            <span className="font-mono text-sm font-semibold">
              {currentWeek?.startDate} — {currentWeek?.endDate}
            </span>
            <button
              type="button"
              className="btn-step"
              onClick={() => onSelectWeekStart(addDays(activeWeekStartDate, 7))}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          VIEW 1: LARGE CALENDAR VIEW (Day-by-Day with Run Colors & Week ACR)
         ========================================================================= */}
      {logViewMode === 'calendar' && (
        <div className="big-calendar-view animate-in">
          {/* Calendar Month Stepper Navigation Bar */}
          <div className="big-calendar-top-bar">
            <div className="big-calendar-month-nav">
              <button
                type="button"
                className="btn-step"
                onClick={handlePrevMonth}
                title="Previous Month"
              >
                ‹
              </button>

              <h2 className="big-calendar-month-title">{monthTitle}</h2>

              <button
                type="button"
                className="btn-step"
                onClick={handleNextMonth}
                title="Next Month"
              >
                ›
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-duration-pill active"
                onClick={handleJumpToToday}
              >
                Today
              </button>
            </div>
          </div>

          {/* 8-Column Grid: Mon-Sun + Week Total & ACR */}
          <div className="big-calendar-grid-wrapper">
            <div className="big-calendar-table">
              {/* Day Headers Row */}
              <div className="big-calendar-header-row">
                <div className="big-calendar-header-cell">Monday</div>
                <div className="big-calendar-header-cell">Tuesday</div>
                <div className="big-calendar-header-cell">Wednesday</div>
                <div className="big-calendar-header-cell">Thursday</div>
                <div className="big-calendar-header-cell">Friday</div>
                <div className="big-calendar-header-cell">Saturday</div>
                <div className="big-calendar-header-cell">Sunday</div>
                <div className="big-calendar-header-cell summary-col">
                  Week Total & ACR
                </div>
              </div>

              {/* Week Rows */}
              {monthWeeks.map((weekRow) => {
                // Look up week summary data from weeks array
                const matchedWeek = weeksByStart.get(weekRow.weekStartDate);

                // Calculate week total distance from workouts if not in weeks array
                let weekMilesSum = 0;
                let weekKmSum = 0;
                let weekLoadSum = 0;

                for (const day of weekRow.days) {
                  const dayRuns = runsByDate.get(day.date) || [];
                  for (const r of dayRuns) {
                    weekMilesSum += convertDistance(r.distance, r.distanceUnit, 'mi');
                    weekKmSum += convertDistance(r.distance, r.distanceUnit, 'km');
                    weekLoadSum += r.load;
                  }
                }

                const displayTotalMiles = matchedWeek
                  ? matchedWeek.totalMiles
                  : Number(weekMilesSum.toFixed(1));
                const displayTotalKm = matchedWeek
                  ? matchedWeek.totalKm
                  : Number(weekKmSum.toFixed(1));
                const displayAcute = matchedWeek
                  ? matchedWeek.acuteWorkload
                  : Number(weekLoadSum.toFixed(1));
                const displayAcr = matchedWeek ? matchedWeek.acr : null;
                const acrStatus = matchedWeek ? matchedWeek.status : null;

                return (
                  <div key={weekRow.weekStartDate} className="big-calendar-week-row">
                    {/* 7 Days of the Week */}
                    {weekRow.days.map((day) => {
                      const dayRuns = runsByDate.get(day.date) || [];
                      const isToday = day.date === todayStr;

                      const dayTotalDist = dayRuns.reduce((acc, r) => {
                        return acc + convertDistance(r.distance, r.distanceUnit, distanceUnit);
                      }, 0);

                      return (
                        <div
                          key={day.date}
                          className={`big-calendar-day-cell ${
                            !day.isCurrentMonth ? 'outside-month' : ''
                          } ${isToday ? 'is-today' : ''}`}
                          onClick={() => setSelectedDayForModal(day.date)}
                          title={`Click to view full details for ${day.date}`}
                        >
                          {/* Day Header */}
                          <div className="big-calendar-day-header">
                            <span className="big-calendar-day-num">
                              {day.dayNumber === 1
                                ? new Date(
                                    Number(day.date.slice(0, 4)),
                                    Number(day.date.slice(5, 7)) - 1,
                                    1
                                  ).toLocaleDateString('en-US', { month: 'short' }) +
                                  ' ' +
                                  day.dayNumber
                                : day.dayNumber}
                            </span>
                            {isToday && (
                              <span className="big-calendar-today-pill">TODAY</span>
                            )}
                          </div>

                          {/* Workouts in this Day with Run-Specific Colors */}
                          <div className="big-calendar-runs-stack">
                            {dayRuns.length === 0 ? (
                              <div className="big-calendar-rest-tag">Rest</div>
                            ) : (
                              dayRuns.map((r, rIdx) => {
                                const color = getRunTypeColor(r.runType);
                                return (
                                  <div
                                    key={r.id || rIdx}
                                    className="day-workout-card cursor-pointer"
                                    style={{
                                      borderLeftColor: color,
                                      backgroundColor: `${color}18`,
                                    }}
                                    onClick={(e) => {
                                      if (onEditRun) {
                                        e.stopPropagation();
                                        onEditRun(r);
                                      }
                                    }}
                                    title="Click to edit this run in pop-up menu"
                                  >
                                    <div className="day-workout-top-line">
                                      <span className="day-workout-miles whitespace-nowrap">
                                        {r.distance} {r.distanceUnit.toUpperCase()}
                                      </span>
                                      <span
                                        className="day-workout-category-pill"
                                        style={{
                                          color,
                                          backgroundColor: `${color}28`,
                                        }}
                                      >
                                        {r.runType.replace('_', ' ')}
                                      </span>
                                    </div>

                                    {/* Telemetry Line: Time & Avg Pace */}
                                    {(r.durationFormatted || r.paceFormatted) && (
                                      <div className="day-workout-telemetry text-xxs font-mono text-secondary flex items-center gap-1.5 my-0.5 whitespace-nowrap">
                                        {r.durationFormatted && <span>⏱️ {r.durationFormatted}</span>}
                                        {r.durationFormatted && r.paceFormatted && <span>·</span>}
                                        {r.paceFormatted && <span>⚡ {r.paceFormatted}</span>}
                                      </div>
                                    )}

                                    <span className="day-workout-load-tag font-mono whitespace-nowrap">
                                      Load: {r.load.toFixed(1)}
                                    </span>

                                    {/* Athlete Strava post comments / description */}
                                    {r.athleteComment && (
                                      <div className="day-workout-athlete-comment mt-1 p-1 bg-amber-500/15 border-l-2 border-amber-400 rounded-r text-xxs text-amber-200/90 leading-tight">
                                        <span className="font-semibold block text-[10px] text-amber-300">Athlete Post:</span>
                                        <span className="line-clamp-2">{r.athleteComment}</span>
                                      </div>
                                    )}

                                    {/* Wrapped Notes Preview */}
                                    {r.comments && (!r.athleteComment || (r.comments !== r.athleteComment && !r.comments.startsWith(r.athleteComment))) && (
                                      <p className="day-workout-notes-preview mt-1">
                                        {r.comments}
                                      </p>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Day Footer */}
                          {dayRuns.length > 0 && (
                            <div className="big-calendar-day-footer">
                              <span className="big-calendar-day-total">
                                Total: {dayTotalDist.toFixed(1)}{' '}
                                {distanceUnit.toUpperCase()}
                              </span>
                              <span className="big-calendar-click-hint font-mono">
                                Details ↗
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Column 8: Week Total Mileage & ACR Summary */}
                    <div
                      className="big-calendar-week-summary-cell"
                      onClick={() => {
                        onSelectWeekStart(weekRow.weekStartDate);
                        setLogViewMode('week');
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Click to view detailed Week Breakdown"
                    >
                      <span className="week-summary-label">Week Total</span>

                      <span className="week-summary-miles font-mono">
                        {distanceUnit === 'mi'
                          ? `${displayTotalMiles.toFixed(1)} mi`
                          : `${displayTotalKm.toFixed(1)} km`}
                      </span>

                      {/* ACR Badge */}
                      {displayAcr !== null ? (
                        <div
                          className={`week-summary-acr-badge font-mono ${
                            displayAcr > warningThreshold
                              ? 'warning'
                              : displayAcr >= 0.8
                              ? 'safe'
                              : 'baseline'
                          }`}
                        >
                          <span>ACR:</span>
                          <strong>{displayAcr.toFixed(2)}</strong>
                        </div>
                      ) : (
                        <div className="week-summary-acr-badge baseline font-mono text-xxs">
                          {acrStatus === 'baseline' ? 'Baseline' : 'Need 4w'}
                        </div>
                      )}

                      <span className="week-summary-load font-mono">
                        Acute: {displayAcute.toFixed(1)}
                      </span>

                      <span className="text-xxs font-mono text-accent mt-1 hover:underline">
                        Breakdown →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: WEEK BREAKDOWN (Existing Week Matrix with Detailed Day Cards)
         ========================================================================= */}
      {logViewMode === 'week' && (
        <div className="week-matrix-view animate-in">
          {/* Week Top Summary Strip */}
          <div className="week-matrix-summary">
            <div className="matrix-stat">
              <span className="stat-label">Week Volume</span>
              <span className="stat-val font-mono">
                {currentWeek
                  ? distanceUnit === 'mi'
                    ? `${currentWeek.totalMiles.toFixed(1)} mi`
                    : `${currentWeek.totalKm.toFixed(1)} km`
                  : '0.0'}
              </span>
            </div>
            <div className="matrix-stat">
              <span className="stat-label">Acute Workload</span>
              <span className="stat-val font-mono text-primary font-bold">
                {currentWeek?.acuteWorkload.toFixed(1) || '0.0'}
              </span>
            </div>
            <div className="matrix-stat">
              <span className="stat-label">Chronic Baseline</span>
              <span className="stat-val font-mono text-warning">
                {currentWeek?.chronicWorkload !== null
                  ? currentWeek?.chronicWorkload?.toFixed(1)
                  : 'Baseline'}
              </span>
            </div>
            <div className="matrix-stat">
              <span className="stat-label">Week ACR</span>
              <span
                className={`stat-val font-mono font-bold ${
                  currentWeek?.acr && currentWeek.acr > warningThreshold
                    ? 'text-danger'
                    : currentWeek?.acr && currentWeek.acr >= 0.8
                    ? 'text-success'
                    : 'text-secondary'
                }`}
              >
                {currentWeek?.acr !== null ? currentWeek?.acr?.toFixed(2) : '—'}
              </span>
            </div>
          </div>

          {/* 7 Days Matrix Columns */}
          <div className="matrix-days-grid">
            {currentWeek?.days.map((day) => {
              return (
                <div
                  key={day.date}
                  className="matrix-day-cell"
                  onClick={() => onSelectDay(day.date)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="matrix-day-header">
                    <span className="font-bold text-xs">{day.dayName}</span>
                    <span className="font-mono text-xxs text-muted">
                      {day.date.slice(5)}
                    </span>
                  </div>

                  <div className="matrix-day-body">
                    {day.runs.length === 0 ? (
                      <span className="matrix-rest-tag">Rest</span>
                    ) : (
                      day.runs.map((r, i) => {
                        const color = getRunTypeColor(r.runType);
                        return (
                          <div
                            key={i}
                            className="matrix-run-item cursor-pointer"
                            style={{ borderLeftColor: color }}
                            onClick={() => onEditRun && onEditRun(r)}
                            title="Click to edit this run in pop-up menu"
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="font-bold text-xs text-primary truncate">
                                {r.title || `${r.runType.replace('_', ' ')} Run`}
                              </span>
                              {r.startTime && (
                                <span className="font-mono text-xxs text-muted whitespace-nowrap">
                                  {formatTimeOfDay(r.startTime)}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                              {r.distance} {r.distanceUnit.toUpperCase()}
                            </span>
                            {(r.durationFormatted || r.paceFormatted) && (
                              <div className="font-mono text-xxs text-secondary flex items-center gap-1.5 my-0.5 whitespace-nowrap">
                                {r.durationFormatted && <span>⏱️ {r.durationFormatted}</span>}
                                {r.durationFormatted && r.paceFormatted && <span>·</span>}
                                {r.paceFormatted && <span>⚡ {r.paceFormatted}</span>}
                              </div>
                            )}
                            <span className="font-mono text-xxs text-muted block">
                              {r.runType.replace('_', ' ')} (load: {r.load.toFixed(1)})
                            </span>
                            {r.athleteComment && (
                              <div className="mt-1 p-1 bg-amber-500/15 border-l-2 border-amber-400 rounded-r text-xxs text-amber-200/90 leading-tight">
                                <span className="font-semibold block text-[9px] text-amber-300">Athlete Post:</span>
                                <span className="line-clamp-2">{r.athleteComment}</span>
                              </div>
                            )}
                            {r.comments && (!r.athleteComment || (r.comments !== r.athleteComment && !r.comments.startsWith(r.athleteComment))) && (
                              <p className="day-workout-notes-preview mt-1">
                                💬 {r.comments}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="matrix-day-footer font-mono text-xxs text-secondary">
                    Total:{' '}
                    {distanceUnit === 'mi'
                      ? day.totalDistanceMi
                      : day.totalDistanceKm}{' '}
                    {distanceUnit.toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pop-up window when user clicks any day in the calendar */}
      <DayDetailsModal
        isOpen={selectedDayForModal !== null}
        onClose={() => setSelectedDayForModal(null)}
        date={selectedDayForModal || ''}
        runs={modalRuns}
        distanceUnit={distanceUnit}
        onGoToLogRun={(clickedDate) => {
          setSelectedDayForModal(null);
          if (onLogRun) {
            onLogRun(clickedDate);
          } else {
            onSelectDay(clickedDate);
          }
        }}
        onEditRun={onEditRun}
        onLogRun={onLogRun}
      />
    </div>
  );
};
