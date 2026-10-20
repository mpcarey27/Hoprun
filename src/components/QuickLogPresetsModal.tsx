import React, { useState } from 'react';
import type { DistanceUnit, QuickLogStaple, UserProfile } from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeColor,
  getQuickLogStaples,
  getUserQuickStaples,
  formatStapleLabel,
} from '../utils/calculations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  distanceUnit: DistanceUnit;
  userQuickStaplesMap?: Record<string, QuickLogStaple[]>;
  onSaveUserStaples: (userId: string, staples: QuickLogStaple[]) => void;
}

export const QuickLogPresetsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  distanceUnit,
  userQuickStaplesMap,
  onSaveUserStaples,
}) => {
  // Initialize with current user's existing staples, or sensible defaults
  const [staples, setStaples] = useState<QuickLogStaple[]>(() => {
    return getUserQuickStaples(currentUser.id, userQuickStaplesMap, distanceUnit);
  });

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDistance, setDraftDistance] = useState(5.0);
  const [draftUnit, setDraftUnit] = useState<DistanceUnit>(distanceUnit);
  const [draftRunType, setDraftRunType] = useState('easy');

  // New staple drafting state
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDistance, setNewDistance] = useState(5.0);
  const [newUnit, setNewUnit] = useState<DistanceUnit>(distanceUnit);
  const [newRunType, setNewRunType] = useState('easy');

  const [toastMessage, setToastMessage] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (idx: number) => {
    const s = staples[idx];
    setEditingIndex(idx);
    setDraftLabel(s.label || '');
    setDraftDistance(s.distance);
    setDraftUnit(s.unit);
    setDraftRunType(s.runType);
  };

  const handleSaveEdit = (idx: number) => {
    if (draftDistance <= 0) return;
    const updated = [...staples];
    updated[idx] = {
      ...updated[idx],
      label: draftLabel.trim() || undefined,
      distance: draftDistance,
      unit: draftUnit,
      runType: draftRunType,
      userId: currentUser.id,
    };
    setStaples(updated);
    setEditingIndex(null);
  };

  const handleDelete = (idx: number) => {
    const updated = staples.filter((_, i) => i !== idx);
    setStaples(updated);
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const updated = [...staples];
    const temp = updated[idx - 1];
    updated[idx - 1] = updated[idx];
    updated[idx] = temp;
    setStaples(updated);
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= staples.length - 1) return;
    const updated = [...staples];
    const temp = updated[idx + 1];
    updated[idx + 1] = updated[idx];
    updated[idx] = temp;
    setStaples(updated);
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (staples.length >= 7) return;
    if (newDistance <= 0) return;

    const newOption: QuickLogStaple = {
      id: `staple_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: newLabel.trim() || undefined,
      distance: newDistance,
      unit: newUnit,
      runType: newRunType,
      userId: currentUser.id,
    };

    setStaples([...staples, newOption]);
    setNewLabel('');
    setNewDistance(5.0);
    setIsAdding(false);
  };

  const handleResetDefaults = () => {
    const defaults = getQuickLogStaples(distanceUnit);
    setStaples(defaults);
    setToastMessage('Reset to standard presets');
    setTimeout(() => setToastMessage(''), 2000);
  };

  const handleSaveAndClose = () => {
    onSaveUserStaples(currentUser.id, staples);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-md animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="presets-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                1-Tap Quick-Log Customizer
              </span>
              <h2 id="presets-modal-title" className="modal-title">
                Presets for {currentUser.name}
              </h2>
            </div>
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

        {/* Content Body */}
        <div className="modal-body log-run-body space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-secondary m-0">
              Customize up to <strong>7 quick-log buttons</strong> for your regular routes and staple workouts.
            </p>
            <span className="text-xs font-mono font-bold text-accent">
              {staples.length} / 7 active
            </span>
          </div>

          {toastMessage && (
            <div className="p-2 rounded bg-surface-elevated text-xs font-mono text-accent text-center border border-subtle">
              {toastMessage}
            </div>
          )}

          {/* List of current presets */}
          <div className="space-y-2">
            {staples.map((staple, idx) => {
              const isEditing = editingIndex === idx;
              const runColor = getRunTypeColor(staple.runType);
              const labelText = formatStapleLabel(staple);

              if (isEditing) {
                return (
                  <div
                    key={staple.id}
                    className="p-3 rounded bg-surface-elevated border border-accent space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xxs font-mono font-bold text-accent">
                        Editing Option #{idx + 1}
                      </span>
                      <button
                        type="button"
                        className="text-xxs text-muted hover:text-primary transition-colors cursor-pointer"
                        onClick={() => setEditingIndex(null)}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xxs uppercase text-muted block mb-0.5">
                          Custom Label (Optional)
                        </label>
                        <input
                          type="text"
                          className="input text-xs"
                          placeholder="e.g. Easy 10 Miler"
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xxs uppercase text-muted block mb-0.5">
                          Distance & Unit
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            className="input font-mono text-xs flex-1"
                            value={draftDistance}
                            onChange={(e) => setDraftDistance(parseFloat(e.target.value) || 0)}
                          />
                          <button
                            type="button"
                            className="btn-filter-pill py-1 px-2 text-xs font-mono"
                            onClick={() => setDraftUnit(draftUnit === 'mi' ? 'km' : 'mi')}
                          >
                            {draftUnit.toUpperCase()}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xxs uppercase text-muted block mb-1">Run Type</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_RUN_TYPES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className={`btn-type-chip ${draftRunType === t.id ? 'btn-type-chip-active' : ''}`}
                            style={{
                              borderColor: draftRunType === t.id ? t.color : undefined,
                              backgroundColor: draftRunType === t.id ? `${t.color}22` : undefined,
                            }}
                            onClick={() => setDraftRunType(t.id)}
                          >
                            <span className="chip-color-dot" style={{ backgroundColor: t.color }} />
                            <span className="chip-name-text text-xxs">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        className="btn btn-primary btn-xs font-mono"
                        onClick={() => handleSaveEdit(idx)}
                      >
                        Apply Edit ✓
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={staple.id}
                  className="flex items-center justify-between p-2.5 rounded bg-surface border border-subtle hover:border-muted transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-muted w-5">
                      #{idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: runColor }}
                    />
                    <div>
                      <span className="text-xs font-bold text-primary block">
                        {labelText}
                      </span>
                      <span className="text-xxs font-mono text-muted">
                        {staple.distance} {staple.unit.toUpperCase()} · {staple.runType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Move Up / Down */}
                    <button
                      type="button"
                      className="btn-filter-pill py-0.5 px-1.5 text-xxs font-mono"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn-filter-pill py-0.5 px-1.5 text-xxs font-mono"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === staples.length - 1}
                      title="Move Down"
                    >
                      ▼
                    </button>
                    {/* Edit */}
                    <button
                      type="button"
                      className="btn-filter-pill py-0.5 px-2 text-xxs font-mono"
                      onClick={() => handleStartEdit(idx)}
                      title="Edit this preset"
                    >
                      Edit
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      className="btn-delete-run"
                      onClick={() => handleDelete(idx)}
                      title="Remove option"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Option Form */}
          {isAdding ? (
            <form onSubmit={handleAddNew} className="p-3 rounded bg-surface-elevated border border-accent space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xxs font-mono font-bold text-accent">
                  New Quick-Log Option (#{staples.length + 1})
                </span>
                <button
                  type="button"
                  className="text-xxs text-muted hover:text-primary transition-colors cursor-pointer"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xxs uppercase text-muted block mb-0.5">
                    Custom Label (e.g. 18 Mile Long Run)
                  </label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="e.g. 18 Mile Long Run"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xxs uppercase text-muted block mb-0.5">
                    Distance & Unit
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className="input font-mono text-xs flex-1"
                      value={newDistance}
                      onChange={(e) => setNewDistance(parseFloat(e.target.value) || 0)}
                      required
                    />
                    <button
                      type="button"
                      className="btn-filter-pill py-1 px-2 text-xs font-mono"
                      onClick={() => setNewUnit(newUnit === 'mi' ? 'km' : 'mi')}
                    >
                      {newUnit.toUpperCase()}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xxs uppercase text-muted block mb-1">Run Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_RUN_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`btn-type-chip ${newRunType === t.id ? 'btn-type-chip-active' : ''}`}
                      style={{
                        borderColor: newRunType === t.id ? t.color : undefined,
                        backgroundColor: newRunType === t.id ? `${t.color}22` : undefined,
                      }}
                      onClick={() => setNewRunType(t.id)}
                    >
                      <span className="chip-color-dot" style={{ backgroundColor: t.color }} />
                      <span className="chip-name-text text-xxs">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="submit" className="btn btn-primary btn-xs font-mono">
                  + Add to Presets
                </button>
              </div>
            </form>
          ) : (
            staples.length < 7 && (
              <button
                type="button"
                className="btn-add-preset-dashed"
                onClick={() => setIsAdding(true)}
              >
                + Add Preset Option ({staples.length}/7 used)
              </button>
            )
          )}

          {staples.length >= 7 && (
            <p className="text-xxs text-muted text-center font-mono italic">
              Maximum 7 preset options reached. Delete or edit an existing option to add another.
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-muted hover:text-primary underline bg-transparent border-0 cursor-pointer font-mono transition-colors"
            onClick={handleResetDefaults}
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-modal-save font-mono"
              onClick={handleSaveAndClose}
            >
              Save Presets ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
