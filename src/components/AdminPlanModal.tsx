import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode';
import type {
  TrainingPlan,
  PlanDayItem,
  DistanceUnit,
  UserProfile,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  formatDate,
  addDays,
  convertDistance,
} from '../utils/calculations';
import {
  compressPlan,
  getPlanWeeksCount,
  getPlanWeekChunk,
} from '../utils/planShare';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  plans: TrainingPlan[];
  onSavePlan: (plan: TrainingPlan) => void;
  distanceUnit: DistanceUnit;
  onOpenAsAthlete: (plan: TrainingPlan) => void;
  onOpenAssignRun?: () => void;
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
}) => {
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

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-card-xl">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">Coach Level</span>
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
            <span className="text-xxs text-muted uppercase font-mono mr-2">Plan Duration:</span>
            <div className="duration-pills">
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 1 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(1)}
              >
                1 Week (7 Days)
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 2 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(2)}
              >
                2 Weeks (14 Days)
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 3 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(3)}
              >
                3 Weeks (21 Days)
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 4 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(4)}
              >
                4 Weeks / 1 Month (28 Days)
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
              <span className="plan-stat-label">Total Plan Volume</span>
              <span className="plan-stat-val font-mono">
                {totalPlanMiles.toFixed(1)} mi ({weeksCount} {weeksCount === 1 ? 'week' : 'weeks'})
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Total Acute Workload</span>
              <span className="plan-stat-val font-mono text-primary font-bold">
                {totalPlanAcuteLoad.toFixed(1)}
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Week {activeWeekTab + 1} Acute Load</span>
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
                Week {activeWeekTab + 1} Daily Prescription
              </span>
              <span className="text-xxs text-muted font-mono">
                Days {activeWeekTab * 7 + 1} to {activeWeekTab * 7 + 7}
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
                          Load: {(day.targetDistance * getRunTypeMultiplier(day.runType)).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Full-Width Textarea for Notes to Guarantee Zero Horizontal Overflow */}
                    <div className="plan-day-notes-wrapper">
                      <textarea
                        rows={2}
                        className="plan-day-textarea"
                        placeholder="Workout instructions (e.g. 5x1mi tempo repeats with 90s recovery, keep heart rate in Zone 2)..."
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
                  Scan with camera to load {weeksCount}-week plan on phone
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
                      Phone Wi-Fi URL (for phones on local Wi-Fi):
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
                  Open Athlete View On This Screen →
                </button>

                <p className="text-xxs text-muted mt-2">
                  When the athlete confirms or edits any workout on their phone, an instant notification is dispatched to your coach dashboard.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn-save-plan"
            onClick={generateQrForPlan}
          >
            Generate QR Code & Send to Phone
          </button>
        </div>
      </div>
    </div>
  );
};
