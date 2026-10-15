import React, { useState } from 'react';
import type {
  TrainingPlan,
  WorkoutRun,
  CoachNotification,
  UserProfile,
  DistanceUnit,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  getRunTypeColor,
  addDays,
  calculateRunLoad,
} from '../utils/calculations';
import {
  getPlanWeeksCount,
  getPlanWeekChunk,
} from '../utils/planShare';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  plan: TrainingPlan | null;
  currentUser: UserProfile;
  onConfirmDay: (run: WorkoutRun, notification: CoachNotification) => void;
  distanceUnit?: DistanceUnit;
}

export const PlanViewerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  plan,
  currentUser,
  onConfirmDay,
}) => {
  const [activeWeekTab, setActiveWeekTab] = useState<number>(0);

  if (!isOpen || !plan) return null;

  const totalWeeks = getPlanWeeksCount(plan.days);

  // Local state for each day item to allow editing before confirmation
  const [dayEdits, setDayEdits] = useState(() => {
    return plan.days.map((d) => ({
      distance: d.targetDistance,
      runType: d.runType,
      comment: '',
      completed: false,
    }));
  });

  const [confirmedDays, setConfirmedDays] = useState<Record<number, boolean>>({});

  const handleUpdate = (idx: number, updates: Partial<{ distance: number; runType: string; comment: string; completed: boolean }>) => {
    const updated = [...dayEdits];
    updated[idx] = { ...updated[idx], ...updates };
    setDayEdits(updated);
  };

  const handleConfirmAndNotify = (globalIdx: number) => {
    const dayItem = plan.days[globalIdx];
    const userEdit = dayEdits[globalIdx];
    const targetDate = addDays(plan.startDate, globalIdx);

    const mult = getRunTypeMultiplier(userEdit.runType);
    const dist = userEdit.distance;
    const load = calculateRunLoad(dist, dayItem.distanceUnit, mult);

    const isEdited = dist !== dayItem.targetDistance || userEdit.runType !== dayItem.runType;
    const notifType: 'completed' | 'edited' = isEdited ? 'edited' : 'completed';

    const workout: WorkoutRun = {
      id: `run_plan_${plan.id}_d${globalIdx}_${Date.now()}`,
      workoutDate: targetDate,
      runOrder: 1,
      distance: dist,
      distanceUnit: dayItem.distanceUnit,
      runType: userEdit.runType,
      multiplier: mult,
      load,
      comments: userEdit.comment || 'Workout completed as prescribed.',
      completed: true,
      isPlanAssigned: true,
      planId: plan.id,
      planDayIndex: globalIdx,
      updatedAt: new Date().toISOString(),
    };

    const notification: CoachNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      planId: plan.id,
      athleteId: currentUser.id,
      athleteName: currentUser.name || 'Athlete',
      type: notifType,
      date: targetDate,
      runType: userEdit.runType,
      distance: dist,
      unit: dayItem.distanceUnit,
      comment: userEdit.comment || (isEdited ? 'Workout modified by athlete' : 'Completed as scheduled'),
      timestamp: Date.now(),
      read: false,
    };

    onConfirmDay(workout, notification);
    setConfirmedDays({ ...confirmedDays, [globalIdx]: true });
  };

  // Slice days for the active week
  const startDayIdx = activeWeekTab * 7;
  const currentWeekDays = getPlanWeekChunk(plan.days, activeWeekTab);

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-card-xl">
        <div className="modal-header">
          <div>
            <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">Assigned Plan</span>
            <h2 className="modal-title">{plan.title}</h2>
            <span className="text-xs text-muted">
              Coach: {plan.coachName} · Starting {plan.startDate} ({totalWeeks} {totalWeeks === 1 ? 'Week' : 'Weeks'})
            </span>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="text-xs text-secondary mb-3">
            Review your daily workouts. You can verify or edit your actual distance, leave notes on how you felt,
            and confirm completion. Your coach will receive an instant notification.
          </p>

          {/* Week Tabs if multi-week plan */}
          {totalWeeks > 1 && (
            <div className="plan-week-tabs mb-3">
              {Array.from({ length: totalWeeks }, (_, i) => (
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

          <div className="plan-athlete-days-list">
            {currentWeekDays.map((day, offset) => {
              const globalIdx = startDayIdx + offset;
              const edit = dayEdits[globalIdx];
              const date = addDays(plan.startDate, globalIdx);
              const isConfirmed = confirmedDays[globalIdx];
              const typeColor = getRunTypeColor(edit.runType);

              return (
                <div
                  key={globalIdx}
                  className={`athlete-day-card ${isConfirmed ? 'athlete-day-confirmed' : ''}`}
                  style={{ borderLeftColor: typeColor }}
                >
                  <div className="athlete-day-header">
                    <div>
                      <span className="font-mono font-bold text-sm text-white">
                        Day {globalIdx + 1} ({date})
                      </span>
                      {day.instructions && (
                        <p className="text-xs text-secondary italic mt-1 leading-normal break-words">
                          Coach instructions: "{day.instructions}"
                        </p>
                      )}
                    </div>
                    {isConfirmed && (
                      <span className="badge-safe text-xs font-mono font-bold">
                        ✓ Confirmed & Sent to Coach
                      </span>
                    )}
                  </div>

                  <div className="athlete-day-inputs">
                    {/* Run Type Edit */}
                    <div className="form-group">
                      <label className="text-xxs text-muted">Workout Type</label>
                      <select
                        className="select-field text-xs font-mono"
                        value={edit.runType}
                        disabled={isConfirmed}
                        onChange={(e) => handleUpdate(globalIdx, { runType: e.target.value })}
                      >
                        {DEFAULT_RUN_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} (×{t.multiplier})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actual Distance Edit */}
                    <div className="form-group">
                      <label className="text-xxs text-muted">Distance ({day.distanceUnit.toUpperCase()})</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input-field font-mono"
                        value={edit.distance}
                        disabled={isConfirmed}
                        onChange={(e) =>
                          handleUpdate(globalIdx, { distance: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>

                    {/* Load */}
                    <div className="form-group">
                      <label className="text-xxs text-muted">Load</label>
                      <span className="readout-field font-mono font-bold text-primary">
                        {(edit.distance * getRunTypeMultiplier(edit.runType)).toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Comment Box with Text Wrapping */}
                  <div className="athlete-day-comment">
                    <label className="text-xxs text-muted">
                      How did you feel? / Workout notes
                    </label>
                    <textarea
                      rows={2}
                      className="textarea-field"
                      placeholder="e.g. Felt smooth, hit target pace on intervals, legs fresh..."
                      value={edit.comment}
                      disabled={isConfirmed}
                      onChange={(e) => handleUpdate(globalIdx, { comment: e.target.value })}
                    />
                  </div>

                  {/* Action Button */}
                  <div className="athlete-day-actions">
                    <button
                      type="button"
                      className={`btn-confirm-day ${isConfirmed ? 'btn-confirmed-done' : ''}`}
                      disabled={isConfirmed}
                      onClick={() => handleConfirmAndNotify(globalIdx)}
                    >
                      {isConfirmed ? '✓ Completed & Coach Notified' : 'Confirm Completed & Notify Coach'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
