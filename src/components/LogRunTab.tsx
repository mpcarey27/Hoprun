import React, { useRef } from 'react';
import type {
  WorkoutRun,
  DistanceUnit,
  WeekWorkload,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  getRunTypeColor,
  formatDate,
  getDayName,
  addDays,
  calculateRunLoad,
  convertDistance,
} from '../utils/calculations';

interface Props {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  runsForSelectedDate: WorkoutRun[];
  currentWeek: WeekWorkload | undefined;
  onSaveRun: (run: WorkoutRun) => void;
  onDeleteRun: (runId: string) => void;
  distanceUnit: DistanceUnit;
  onAthleteEdit?: (run: WorkoutRun) => void;
}

export const LogRunTab: React.FC<Props> = ({
  selectedDate,
  onSelectDate,
  runsForSelectedDate,
  currentWeek,
  onSaveRun,
  onDeleteRun,
  distanceUnit,
  onAthleteEdit,
}) => {
  const todayStr = formatDate(new Date());
  const isToday = selectedDate === todayStr;

  // Calendar popover dropdown state
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
  const calendarWrapperRef = useRef<HTMLDivElement>(null);

  const [calYear, setCalYear] = React.useState(() => Number(selectedDate.split('-')[0]));
  const [calMonth, setCalMonth] = React.useState(() => Number(selectedDate.split('-')[1]) - 1);

  // Sync calendar month view if selectedDate changes externally
  React.useEffect(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    setCalYear(y);
    setCalMonth(m - 1);
  }, [selectedDate]);

  // Close calendar popover on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        calendarWrapperRef.current &&
        !calendarWrapperRef.current.contains(e.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    };
    if (isCalendarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCalendarOpen]);

  // Calendar navigation & day computation
  const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayRaw = new Date(calYear, calMonth, 1).getDay();
  // Monday based: Mon=0, Sun=6
  const firstDayOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1;

  const monthTitle = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const handleSelectCalendarDay = (dayNum: number) => {
    const mStr = String(calMonth + 1).padStart(2, '0');
    const dStr = String(dayNum).padStart(2, '0');
    const newDateStr = `${calYear}-${mStr}-${dStr}`;
    onSelectDate(newDateStr);
    setIsCalendarOpen(false); // Disappears immediately back to the original page
  };

  const handleAddRun = () => {
    const newOrder = runsForSelectedDate.length + 1;
    const defaultType = 'easy';
    const defaultDist = distanceUnit === 'mi' ? 5.0 : 8.0;
    const mult = getRunTypeMultiplier(defaultType);

    const newRun: WorkoutRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workoutDate: selectedDate,
      runOrder: newOrder,
      distance: defaultDist,
      distanceUnit,
      runType: defaultType,
      multiplier: mult,
      load: calculateRunLoad(defaultDist, distanceUnit, mult),
      comments: '',
      completed: true,
      updatedAt: new Date().toISOString(),
    };

    onSaveRun(newRun);
  };

  const handleUpdateField = (run: WorkoutRun, updates: Partial<WorkoutRun>) => {
    const updated = { ...run, ...updates, updatedAt: new Date().toISOString() };
    if ('runType' in updates) {
      updated.multiplier = getRunTypeMultiplier(updated.runType);
    }
    updated.load = calculateRunLoad(updated.distance, updated.distanceUnit, updated.multiplier);

    onSaveRun(updated);
    if (onAthleteEdit) {
      onAthleteEdit(updated);
    }
  };

  const totalDayDist = runsForSelectedDate.reduce((acc, r) => {
    return acc + convertDistance(r.distance, r.distanceUnit, distanceUnit);
  }, 0);

  const totalDayLoad = runsForSelectedDate.reduce((acc, r) => acc + r.load, 0);

  // Friendly date formatting e.g. "Today · Saturday, Oct 10, 2026"
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const formattedFullDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="tab-container">
      {/* Date Header with Calendar Icon Date Picker */}
      <div className="today-header-card">
        <div className="date-nav-controls">
          <button
            type="button"
            className="btn-date-step"
            onClick={() => onSelectDate(addDays(selectedDate, -1))}
            title="Previous Day"
          >
            ←
          </button>

          <div className="date-display-wrapper">
            <div className="flex items-center gap-2">
              {isToday && <span className="today-badge font-mono">TODAY</span>}
              <h2 className="current-date-heading">{formattedFullDate}</h2>

              {/* Minimal Calendar Icon Button & Dropdown Popover */}
              <div className="calendar-trigger-wrapper" ref={calendarWrapperRef}>
                <button
                  type="button"
                  className={`btn-calendar-trigger ${isCalendarOpen ? 'border-accent text-accent' : ''}`}
                  onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                  title="Select date from calendar"
                  aria-expanded={isCalendarOpen}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="sr-only">Calendar</span>
                </button>

                {isCalendarOpen && (
                  <div className="calendar-dropdown-menu">
                    <div className="calendar-menu-header">
                      <button
                        type="button"
                        className="calendar-nav-btn"
                        onClick={handlePrevMonth}
                        title="Previous Month"
                      >
                        ‹
                      </button>
                      <span className="calendar-month-title">{monthTitle}</span>
                      <button
                        type="button"
                        className="calendar-nav-btn"
                        onClick={handleNextMonth}
                        title="Next Month"
                      >
                        ›
                      </button>
                    </div>

                    <div className="calendar-dow-row">
                      <span className="calendar-dow-cell">Mo</span>
                      <span className="calendar-dow-cell">Tu</span>
                      <span className="calendar-dow-cell">We</span>
                      <span className="calendar-dow-cell">Th</span>
                      <span className="calendar-dow-cell">Fr</span>
                      <span className="calendar-dow-cell">Sa</span>
                      <span className="calendar-dow-cell">Su</span>
                    </div>

                    <div className="calendar-days-grid">
                      {Array.from({ length: firstDayOffset }).map((_, i) => (
                        <div key={`empty-${i}`} className="calendar-empty-cell" />
                      ))}
                      {Array.from({ length: totalDaysInMonth }, (_, i) => i + 1).map((dayNum) => {
                        const mStr = String(calMonth + 1).padStart(2, '0');
                        const dStr = String(dayNum).padStart(2, '0');
                        const dateStr = `${calYear}-${mStr}-${dStr}`;
                        const isSelected = dateStr === selectedDate;
                        const isTodayDate = dateStr === todayStr;

                        return (
                          <button
                            key={dayNum}
                            type="button"
                            className={`calendar-day-btn ${isSelected ? 'active' : ''} ${
                              isTodayDate ? 'today' : ''
                            }`}
                            onClick={() => handleSelectCalendarDay(dayNum)}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>

                    <div className="calendar-dropdown-footer">
                      <button
                        type="button"
                        className="btn-jump-today text-xxs font-mono"
                        onClick={() => {
                          onSelectDate(todayStr);
                          setIsCalendarOpen(false);
                        }}
                      >
                        Jump to Today
                      </button>
                      <button
                        type="button"
                        className="text-xxs text-muted hover:text-white font-mono bg-transparent border-0 cursor-pointer"
                        onClick={() => setIsCalendarOpen(false)}
                      >
                        Close ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isToday && (
              <button
                type="button"
                className="btn-jump-today text-xxs font-mono"
                onClick={() => onSelectDate(todayStr)}
              >
                Jump to Today
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn-date-step"
            onClick={() => onSelectDate(addDays(selectedDate, 1))}
            title="Next Day"
          >
            →
          </button>
        </div>

        {/* Day Quick Summary Metrics */}
        <div className="day-quick-metrics">
          <div className="quick-metric">
            <span className="metric-label">Distance</span>
            <span className="metric-val font-mono">
              {totalDayDist.toFixed(2)} {distanceUnit.toUpperCase()}
            </span>
          </div>
          <div className="quick-metric">
            <span className="metric-label">Workload</span>
            <span className="metric-val font-mono text-primary font-bold">
              {totalDayLoad.toFixed(1)}
            </span>
          </div>
          <div className="quick-metric">
            <span className="metric-label">Week Acute</span>
            <span className="metric-val font-mono text-white">
              {currentWeek ? currentWeek.acuteWorkload.toFixed(1) : '0.0'}
            </span>
          </div>
          <div className="quick-metric">
            <span className="metric-label">Week ACR</span>
            <span
              className={`metric-val font-mono font-bold ${
                currentWeek?.acr && currentWeek.acr > 1.2
                  ? 'text-danger'
                  : currentWeek?.acr && currentWeek.acr >= 0.8
                  ? 'text-success'
                  : 'text-secondary'
              }`}
            >
              {currentWeek?.acr !== null && currentWeek?.acr !== undefined ? currentWeek.acr.toFixed(2) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Runs Logged for This Day */}
      <div className="day-runs-container">
        <div className="day-runs-header">
          <h3 className="section-title">
            Workouts · {getDayName(selectedDate)}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-add-primary"
              onClick={handleAddRun}
            >
              + Add Run
            </button>
          </div>
        </div>

        {runsForSelectedDate.length === 0 ? (
          <div className="empty-day-box">
            <p className="text-secondary font-medium text-sm">
              No runs recorded for this date.
            </p>
            <button
              type="button"
              className="btn-add-primary mt-3"
              onClick={handleAddRun}
            >
              + Add Run
            </button>
          </div>
        ) : (
          <div className="runs-input-list">
            {runsForSelectedDate.map((run, idx) => {
              const runColor = getRunTypeColor(run.runType);

              return (
                <div
                  key={run.id}
                  className={`run-card ${!run.completed ? 'run-card-planned' : ''}`}
                  style={{ borderLeftColor: runColor }}
                >
                  <div className="run-card-header">
                    <div className="flex items-center gap-2">
                      <span className="run-badge-tag font-mono">Run #{idx + 1}</span>
                      <span
                        className="run-type-pill text-xs font-mono"
                        style={{ color: runColor, borderColor: runColor }}
                      >
                        {run.runType.replace('_', ' ').toUpperCase()}
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

                    <div className="flex items-center gap-2">
                      {/* Status toggle */}
                      <label className="status-toggle-label">
                        <input
                          type="checkbox"
                          checked={run.completed}
                          onChange={(e) =>
                            handleUpdateField(run, { completed: e.target.checked })
                          }
                        />
                        <span className="text-xs font-mono">
                          {run.completed ? 'Completed' : 'Planned'}
                        </span>
                      </label>

                      {/* Delete */}
                      <button
                        type="button"
                        className="btn-delete-run"
                        onClick={() => onDeleteRun(run.id)}
                        title="Delete run"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Modern Streamlined Hero Distance & Load Row */}
                  <div className="run-card-hero-row">
                    <div className="hero-distance-control">
                      <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                        Distance
                      </label>
                      <div className="hero-distance-input-box">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="hero-distance-input font-mono"
                          value={run.distance || ''}
                          placeholder="0.00"
                          onChange={(e) =>
                            handleUpdateField(run, {
                              distance: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="btn-unit-pill font-mono"
                          onClick={() => {
                            const newUnit = run.distanceUnit === 'mi' ? 'km' : 'mi';
                            handleUpdateField(run, { distanceUnit: newUnit });
                          }}
                          title="Click to toggle between Miles and Kilometers"
                        >
                          {run.distanceUnit.toUpperCase()}
                        </button>
                      </div>
                    </div>

                    <div className="hero-load-display">
                      <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                        Workload
                      </span>
                      <div className="hero-load-pill font-mono">
                        <span className="hero-load-val">{run.load.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick-Tap Workout Category Chips */}
                  <div className="workout-chips-section mt-3">
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1.5">
                      Run Type
                    </label>
                    <div className="workout-chips-grid">
                      {DEFAULT_RUN_TYPES.map((t) => {
                        const isSelected = run.runType === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={`btn-type-chip ${isSelected ? 'btn-type-chip-active' : ''}`}
                            style={{
                              borderColor: isSelected ? t.color : undefined,
                              backgroundColor: isSelected ? `${t.color}18` : undefined,
                            }}
                            onClick={() => handleUpdateField(run, { runType: t.id })}
                          >
                            <span
                              className="chip-color-dot"
                              style={{ backgroundColor: t.color }}
                            />
                            <span className="chip-name-text">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Workout Comments / Feelings (Clean & Collapsible) */}
                  <div className="run-card-notes-section mt-3">
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      className="textarea-notes"
                      placeholder="Add run notes..."
                      value={run.comments || ''}
                      onChange={(e) =>
                        handleUpdateField(run, { comments: e.target.value })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
