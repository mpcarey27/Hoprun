import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode';
import type {
  TrainingPlan,
  PlanDayItem,
  DistanceUnit,
  UserProfile,
  WorkoutRun,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  calculateRunLoad,
  formatDate,
  addDays,
  convertDistance,
} from '../utils/calculations';
import {
  compressPlan,
  getPlanWeeksCount,
  getPlanWeekChunk,
} from '../utils/planShare';
import { ROSTER_USERS } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  plans: TrainingPlan[];
  onSavePlan: (plan: TrainingPlan) => void;
  distanceUnit: DistanceUnit;
  onOpenAsAthlete: (plan: TrainingPlan) => void;
  onOpenAssignRun?: () => void;
  onAssignRuns?: (newRuns: WorkoutRun[], notificationText: string) => void;
}

export const AdminPlanModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  plans,
  onSavePlan,
  distanceUnit,
  onOpenAsAthlete,
  onOpenAssignRun,
  onAssignRuns,
}) => {
  const isCoach = currentUser.role === 'coach';

  // Target Athlete Selection State
  const [targetAthleteId, setTargetAthleteId] = useState<string>(() => {
    const rob = ROSTER_USERS.find((u) => u.name.toLowerCase().includes('rob'));
    return rob ? rob.id : currentUser.id;
  });

  const targetAthlete = useMemo(() => {
    return ROSTER_USERS.find((u) => u.id === targetAthleteId) || currentUser;
  }, [targetAthleteId, currentUser]);

  const [assignDirectSuccess, setAssignDirectSuccess] = useState<string>('');

  // Plan duration in weeks (1, 2, 3, 4, etc.)
  const [weeksCount, setWeeksCount] = useState<number>(() => {
    return plans[0]?.weeksCount || (plans[0]?.days ? getPlanWeeksCount(plans[0].days) : 1);
  });

  const [activePlan, setActivePlan] = useState<TrainingPlan>(() => {
    const totalDays = (plans[0]?.weeksCount || 1) * 7;
    return (
      plans[0] || {
        id: `plan_${Date.now()}`,
        title: 'Training Plan',
        coachId: currentUser.id,
        coachName: currentUser.name,
        startDate: formatDate(new Date()),
        weeksCount: 1,
        code: `RUN-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date().toISOString(),
        days: Array.from({ length: totalDays }, (_, i) => ({
          dayIndex: i,
          runType: 'easy',
          targetDistance: 0,
          distanceUnit,
          instructions: '',
        })),
      }
    );
  });

  // Active viewing week within the plan builder (0 = Week 1, 1 = Week 2, etc.)
  const [activeWeekTab, setActiveWeekTab] = useState<number>(0);

  const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
  // Default to Wi-Fi IP so phones scanning on the same local network can connect
  const [targetHost, setTargetHost] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `http://192.168.88.15:${window.location.port || '5173'}`;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  });
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Synchronize days count whenever weeksCount changes
  const handleSetDurationWeeks = (count: number) => {
    const totalDaysNeeded = count * 7;
    const currentDays = [...activePlan.days];

    let newDays: PlanDayItem[];
    if (currentDays.length < totalDaysNeeded) {
      const extraDays = Array.from({ length: totalDaysNeeded - currentDays.length }, (_, i) => ({
        dayIndex: currentDays.length + i,
        runType: 'easy',
        targetDistance: 0,
        distanceUnit,
        instructions: '',
      }));
      newDays = [...currentDays, ...extraDays];
    } else {
      newDays = currentDays.slice(0, totalDaysNeeded);
    }

    setWeeksCount(count);
    setActivePlan({
      ...activePlan,
      weeksCount: count,
      days: newDays,
    });
    if (activeWeekTab >= count) {
      setActiveWeekTab(count - 1);
    }
  };

  const handleAddExtraWeek = () => {
    handleSetDurationWeeks(weeksCount + 1);
  };

  // Planned totals across entire plan
  const totalPlanMiles = useMemo(() => {
    return activePlan.days.reduce((acc, d) => {
      return acc + convertDistance(d.targetDistance, d.distanceUnit, 'mi');
    }, 0);
  }, [activePlan.days]);

  const totalPlanAcuteLoad = useMemo(() => {
    return activePlan.days.reduce((acc, d) => {
      const mi = convertDistance(d.targetDistance, d.distanceUnit, 'mi');
      const mult = getRunTypeMultiplier(d.runType);
      return acc + mi * mult;
    }, 0);
  }, [activePlan.days]);

  // Days for the currently selected week tab (7 days)
  const currentTabDays = useMemo(() => {
    return getPlanWeekChunk(activePlan.days, activeWeekTab);
  }, [activePlan.days, activeWeekTab]);

  const currentTabMiles = useMemo(() => {
    return currentTabDays.reduce((acc, d) => {
      return acc + convertDistance(d.targetDistance, d.distanceUnit, 'mi');
    }, 0);
  }, [currentTabDays]);

  const currentTabAcuteLoad = currentTabDays.reduce((acc, d) => {
    const mi = d.distanceUnit === 'mi' ? d.targetDistance : d.targetDistance / 1.609344;
    const mult = getRunTypeMultiplier(d.runType);
    return acc + mi * mult;
  }, 0);

  const handleUpdateDay = (globalIndex: number, updates: Partial<PlanDayItem>) => {
    const newDays = [...activePlan.days];
    newDays[globalIndex] = { ...newDays[globalIndex], ...updates };
    setActivePlan({ ...activePlan, days: newDays });
  };

  const generateQrForPlan = async () => {
    try {
      const compressedPayload = await compressPlan(activePlan);
      const cleanHost = targetHost.trim().replace(/\/+$/, '');
      const shareUrl = `${cleanHost}${window.location.pathname}?p=${compressedPayload}&code=${activePlan.code}`;

      // High-contrast, easy-to-scan QR code settings
      const url = await QRCode.toDataURL(shareUrl, {
        width: 320,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      setQrDataUrl(url);
      setGeneratedShareUrl(shareUrl);
      setShowQr(true);
      onSavePlan(activePlan);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const handleCopyLink = () => {
    const toCopy = generatedShareUrl || `${targetHost}${window.location.pathname}?code=${activePlan.code}`;
    navigator.clipboard.writeText(toCopy);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleAssignPlanDirectly = () => {
    if (!onAssignRuns) return;
    const plannedDays = activePlan.days.filter((d) => d.targetDistance > 0);
    if (plannedDays.length === 0) {
      alert('Please configure at least one day with distance > 0 in the plan before assigning.');
      return;
    }

    const baseTime = Date.now();
    const newRuns: WorkoutRun[] = plannedDays.map((dayItem, idx) => {
      const dateStr = addDays(activePlan.startDate, dayItem.dayIndex);
      const mult = getRunTypeMultiplier(dayItem.runType);
      const load = calculateRunLoad(dayItem.targetDistance, dayItem.distanceUnit, mult);
      return {
        id: `run_plan_${activePlan.id}_${dayItem.dayIndex}_${baseTime}_${idx}`,
        workoutDate: dateStr,
        runOrder: 1,
        distance: dayItem.targetDistance,
        distanceUnit: dayItem.distanceUnit,
        runType: dayItem.runType,
        multiplier: mult,
        load,
        comments: dayItem.instructions ? `${dayItem.instructions} (${activePlan.title})` : `Prescribed from ${activePlan.title} by Coach ${currentUser.name || 'Michael Carey'}`,
        completed: false,
        isPlanAssigned: true,
        planId: activePlan.id,
        planDayIndex: dayItem.dayIndex,
        athleteId: targetAthlete.id,
        athleteName: targetAthlete.name,
        assignedByCoachId: currentUser.id,
        assignedByCoachName: currentUser.name,
        updatedAt: new Date().toISOString(),
      };
    });

    const notifMsg = `Coach ${currentUser.name || 'Michael Carey'} assigned ${activePlan.title} (${newRuns.length} workouts) directly to ${targetAthlete.name}'s schedule starting ${activePlan.startDate}`;
    onAssignRuns(newRuns, notifMsg);
    onSavePlan({
      ...activePlan,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
    });
    setAssignDirectSuccess(`✓ Successfully assigned "${activePlan.title}" (${newRuns.length} workouts) directly to ${targetAthlete.name}!`);
    setTimeout(() => setAssignDirectSuccess(''), 3500);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-card-xl">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">Coach</span>
              <h2 className="modal-title">Training Plan Builder</h2>
            </div>
            {currentUser.role === 'coach' && onOpenAssignRun && (
              <button
                type="button"
                className="btn-assign-run-admin"
                onClick={onOpenAssignRun}
                title="Schedule recurring runs for athlete"
              >
                Assign Run
              </button>
            )}
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {assignDirectSuccess && (
            <div className="inweek-ribbon inweek-ribbon-optimal mb-3">
              <span className="font-mono text-sm font-bold text-success">
                {assignDirectSuccess}
              </span>
            </div>
          )}

          {!isCoach && (
            <div className="inweek-banner inweek-critical mb-3">
              <p className="text-sm font-bold text-danger mb-1">
                ⚠️ Coach Access Required
              </p>
              <p className="text-xs text-secondary">
                Only coaches can assign training plans. You are currently logged in as <strong>{currentUser.name}</strong> ({currentUser.role}).
              </p>
            </div>
          )}

          {/* Target Athlete Selection for the Training Plan */}
          <div className="mb-3 p-3 rounded" style={{ backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xxs uppercase font-mono font-bold text-accent">
                Athlete
              </span>
              <span className="text-xxs font-mono text-primary font-bold">
                For: {targetAthlete.name} ({targetAthlete.role === 'coach' ? 'Coach' : 'Athlete'})
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {ROSTER_USERS.map((user) => {
                const isSelected = targetAthleteId === user.id;
                const isSelf = user.id === currentUser.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    className={`p-2 rounded text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent text-white font-bold'
                        : 'bg-surface hover:border-accent text-primary'
                    }`}
                    style={{
                      border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                    }}
                    onClick={() => setTargetAthleteId(user.id)}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-xxs"
                        style={{
                          backgroundColor: isSelected ? '#ffffff' : 'var(--color-accent)',
                          color: isSelected ? '#15803d' : '#ffffff',
                        }}
                      >
                        {user.name.charAt(0)}
                      </span>
                      <span className="text-xs font-bold truncate">
                        {user.name} {isSelf ? '(You)' : ''}
                      </span>
                    </div>
                    <span className="text-xxs font-mono block opacity-80 uppercase">
                      {user.role === 'coach' ? 'Coach' : 'Athlete'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan Meta Inputs */}
          <div className="plan-meta-row">
            <div className="plan-meta-field flex-1">
              <label className="text-xs text-muted">Plan Title</label>
              <input
                type="text"
                className="input-text font-semibold"
                value={activePlan.title}
                onChange={(e) => setActivePlan({ ...activePlan, title: e.target.value })}
                placeholder="Enter plan title"
              />
            </div>

            <div className="plan-meta-field w-36">
              <label className="text-xs text-muted">Start Date</label>
              <input
                type="date"
                className="input-date font-mono"
                value={activePlan.startDate}
                onChange={(e) => setActivePlan({ ...activePlan, startDate: e.target.value })}
              />
            </div>

            <div className="plan-meta-field w-28">
              <label className="text-xs text-muted">Plan Code</label>
              <span className="font-mono text-sm text-primary font-bold">{activePlan.code}</span>
            </div>
          </div>

          {/* Plan Duration Selector (1 Week, 2 Weeks, 3 Weeks, 4 Weeks / Month) */}
          <div className="plan-duration-strip">
            <span className="text-xxs text-muted uppercase font-mono mr-2">Duration:</span>
            <div className="duration-pills">
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 1 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(1)}
              >
                1 Week
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 2 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(2)}
              >
                2 Weeks
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 3 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(3)}
              >
                3 Weeks
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 4 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(4)}
              >
                4 Weeks
              </button>
              <button
                type="button"
                className="btn-duration-add font-mono"
                onClick={handleAddExtraWeek}
                title="Add another week"
              >
                + Add Week
              </button>
            </div>
          </div>

          {/* Multi-Week Workload Stats Summary */}
          <div className="plan-stats-strip">
            <div className="plan-stat">
              <span className="plan-stat-label">Total Distance</span>
              <span className="plan-stat-val font-mono">
                {totalPlanMiles.toFixed(1)} mi ({weeksCount}w)
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Total Workload</span>
              <span className="plan-stat-val font-mono text-primary font-bold">
                {totalPlanAcuteLoad.toFixed(1)}
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Week {activeWeekTab + 1} Workload</span>
              <span className="plan-stat-val font-mono text-white">
                {currentTabAcuteLoad.toFixed(1)} ({currentTabMiles.toFixed(1)} mi)
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Coach</span>
              <span className="plan-stat-val text-white">{activePlan.coachName}</span>
            </div>
          </div>

          {/* Week Tab Navigation if Multi-Week */}
          {weeksCount > 1 && (
            <div className="plan-week-tabs">
              {Array.from({ length: weeksCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn-plan-week-tab ${activeWeekTab === i ? 'active' : ''}`}
                  onClick={() => setActiveWeekTab(i)}
                >
                  Week {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* 7 Days Grid for Active Week */}
          <div className="plan-days-container">
            <div className="plan-days-header-strip">
              <span className="text-xs font-mono font-bold text-white uppercase">
                Week {activeWeekTab + 1}
              </span>
              <span className="text-xxs text-muted font-mono">
                Days {activeWeekTab * 7 + 1}–{activeWeekTab * 7 + 7}
              </span>
            </div>

            <div className="plan-days-list">
              {currentTabDays.map((day, offsetIdx) => {
                const globalIdx = activeWeekTab * 7 + offsetIdx;
                const dayDate = addDays(activePlan.startDate, globalIdx);

                return (
                  <div key={globalIdx} className="plan-day-card">
                    {/* Top Row: Day Number, Date, Run Type, Distance */}
                    <div className="plan-day-top-row">
                      <div className="flex items-center gap-2">
                        <span className="plan-day-badge font-mono">Day {globalIdx + 1}</span>
                        <span className="font-mono text-xs text-muted">{dayDate}</span>
                      </div>

                      <div className="plan-day-inputs-cluster">
                        <select
                          className="select-field text-xs font-mono"
                          value={day.runType}
                          onChange={(e) => handleUpdateDay(globalIdx, { runType: e.target.value })}
                        >
                          {DEFAULT_RUN_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} (×{t.multiplier})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="input-field input-field-sm font-mono"
                            value={day.targetDistance}
                            onChange={(e) =>
                              handleUpdateDay(globalIdx, {
                                targetDistance: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                          <span className="btn-unit-tag font-mono text-xxs">
                            {day.distanceUnit.toUpperCase()}
                          </span>
                        </div>

                        <span className="plan-day-load-tag font-mono text-xs text-primary">
                          Workload: {(day.targetDistance * getRunTypeMultiplier(day.runType)).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Full-Width Textarea for Notes to Guarantee Zero Horizontal Overflow */}
                    <div className="plan-day-notes-wrapper">
                      <textarea
                        rows={2}
                        className="plan-day-textarea"
                        placeholder="Workout instructions..."
                        value={day.instructions}
                        onChange={(e) =>
                          handleUpdateDay(globalIdx, { instructions: e.target.value })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* QR Code Presentation */}
          {showQr && (
            <div className="qr-reveal-card">
              <div className="qr-box">
                {qrDataUrl && <img src={qrDataUrl} alt="Plan QR Code" className="qr-image" />}
                <p className="qr-caption font-mono">
                  Scan to load plan on mobile
                </p>
              </div>

              <div className="qr-actions">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-safe text-xxs font-mono font-bold">READY TO SCAN</span>
                  <span className="text-xxs text-muted font-mono">Code: {activePlan.code}</span>
                </div>

                {isLocalHost && (
                  <div className="mb-2">
                    <label className="text-xxs text-secondary font-mono block mb-1">
                      Phone Wi-Fi URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input-field text-xs font-mono flex-1"
                        value={targetHost}
                        onChange={(e) => setTargetHost(e.target.value)}
                        placeholder="e.g. http://192.168.88.15:5173"
                      />
                      <button
                        type="button"
                        className="btn-duration-pill active"
                        onClick={generateQrForPlan}
                        title="Regenerate QR code with this address"
                      >
                        Update QR
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-action-primary"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? '✓ Link Copied to Clipboard' : 'Copy Plan URL'}
                </button>

                <button
                  type="button"
                  className="btn-action-secondary mt-1"
                  onClick={() => onOpenAsAthlete(activePlan)}
                >
                  Open Athlete View →
                </button>
              </div>
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
          
          <div className="flex items-center gap-2">
            {isCoach && onAssignRuns && (
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleAssignPlanDirectly}
                title={`Assign all workouts in this plan directly to ${targetAthlete.name}'s calendar`}
              >
                Assign Plan to {targetAthlete.name} →
              </button>
            )}
            <button
              type="button"
              className="btn-save-plan"
              onClick={generateQrForPlan}
            >
              Generate QR Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
