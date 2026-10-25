import React, { useState } from 'react';
import type { RunningShoe } from '../types/acr';
import { calculateShoeWear } from '../utils/calculations';

interface Props {
  shoes: RunningShoe[];
  onAddShoe: (shoe: RunningShoe) => void;
  onRetireShoe: (shoeId: string) => void;
  onSetDefaultShoe?: (shoeId: string) => void;
  selectedShoeId?: string;
  onSelectShoe?: (shoeId: string | undefined) => void;
  mode?: 'manage' | 'select';
}

export const ShoeMileageTracker: React.FC<Props> = ({
  shoes = [],
  onAddShoe,
  onRetireShoe,
  onSetDefaultShoe,
  selectedShoeId,
  onSelectShoe,
  mode = 'manage',
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [shoeName, setShoeName] = useState('');
  const [shoeBrand, setShoeBrand] = useState('');
  const [maxMiles, setMaxMiles] = useState(400);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shoeName.trim()) return;

    const newShoe: RunningShoe = {
      id: `shoe_${Date.now()}`,
      name: shoeName.trim(),
      brand: shoeBrand.trim() || undefined,
      totalMiles: 0,
      maxMiles: Number(maxMiles) || 400,
      isRetired: false,
      dateAdded: new Date().toISOString().split('T')[0],
    };

    onAddShoe(newShoe);
    setShoeName('');
    setShoeBrand('');
    setIsAdding(false);
  };

  if (mode === 'select' && onSelectShoe) {
    return (
      <div className="shoe-selector-compact">
        <label className="picker-label">Running Shoes (Gear)</label>
        <select
          className="shoe-select-dropdown"
          value={selectedShoeId || ''}
          onChange={(e) => onSelectShoe(e.target.value ? e.target.value : undefined)}
        >
          <option value="">No shoe selected</option>
          {shoes
            .filter((s) => !s.isRetired)
            .map((s) => {
              const wear = calculateShoeWear(s.totalMiles, s.maxMiles);
              return (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isDefault ? '★ (Default)' : ''} ({s.totalMiles.toFixed(1)} / {s.maxMiles} mi - {wear.percent}%)
                </option>
              );
            })}
        </select>
      </div>
    );
  }

  return (
    <div className="shoe-tracker-card">
      <div className="shoe-tracker-header">
        <div>
          <h3 className="settings-card-title">Running Shoes & Gear Lifespan</h3>
          <p className="settings-card-desc">
            Monitor shoe foam degradation to prevent shin splints and Achilles strain (300–450 mi lifespan).
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsAdding(true)}
          >
            + Add Shoe
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="shoe-add-form animate-fade-in">
          <div className="shoe-form-grid">
            <div className="shoe-input-group">
              <label className="text-xs text-muted">Model Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Nike Pegasus 41, Asics Superblast"
                value={shoeName}
                onChange={(e) => setShoeName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="shoe-input-group">
              <label className="text-xs text-muted">Brand (Optional)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Nike, Hoka, Saucony"
                value={shoeBrand}
                onChange={(e) => setShoeBrand(e.target.value)}
              />
            </div>
            <div className="shoe-input-group">
              <label className="text-xs text-muted">Lifespan Target (Miles)</label>
              <input
                type="number"
                className="input font-mono"
                min="100"
                max="800"
                value={maxMiles}
                onChange={(e) => setMaxMiles(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="shoe-form-actions">
            <button type="submit" className="btn btn-primary btn-sm">
              Save Shoe
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="shoes-list">
        {shoes.length === 0 ? (
          <div className="empty-state text-sm text-secondary">
            No running shoes registered yet. Add your current training shoes to track mileage and wear.
          </div>
        ) : (
          shoes.map((shoe) => {
            const wear = calculateShoeWear(shoe.totalMiles, shoe.maxMiles);
            let barColor = '#10b981';
            if (wear.status === 'caution') barColor = '#f59e0b';
            if (wear.status === 'replace') barColor = '#ef4444';

            return (
              <div
                key={shoe.id}
                className={`shoe-row-card ${shoe.isRetired ? 'shoe-retired' : ''}`}
              >
                <div className="shoe-info-col">
                  <div className="shoe-title-line">
                    <span className="shoe-name font-bold">{shoe.name}</span>
                    {shoe.brand && (
                      <span className="shoe-brand-tag text-xs text-muted">{shoe.brand}</span>
                    )}
                    {shoe.isDefault && (
                      <span className="badge badge-accent text-xs font-semibold">★ Default Trainer</span>
                    )}
                    {shoe.isRetired ? (
                      <span className="badge badge-secondary text-xs">Retired</span>
                    ) : wear.status === 'replace' ? (
                      <span className="badge badge-danger text-xs">Retirement Recommended</span>
                    ) : wear.status === 'caution' ? (
                      <span className="badge badge-warning text-xs">High Mileage</span>
                    ) : (
                      <span className="badge badge-success text-xs">Good Condition</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="shoe-wear-bar-container">
                    <div
                      className="shoe-wear-bar-fill"
                      style={{
                        width: `${Math.min(100, wear.percent)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>

                  <div className="shoe-stats-line font-mono text-xs text-secondary">
                    <span>
                      {shoe.totalMiles.toFixed(1)} / {shoe.maxMiles} mi ({wear.percent}%)
                    </span>
                    <span>·</span>
                    <span>{wear.remainingMiles} mi remaining</span>
                  </div>
                </div>

                <div className="shoe-actions-col flex items-center gap-2">
                  {!shoe.isRetired && !shoe.isDefault && onSetDefaultShoe && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs font-mono"
                      onClick={() => onSetDefaultShoe(shoe.id)}
                      title="Set as your default shoe for all new runs"
                    >
                      Make Default
                    </button>
                  )}
                  {!shoe.isRetired && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => onRetireShoe(shoe.id)}
                      title="Retire this shoe when replaced"
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
