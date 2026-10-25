import React, { useState } from 'react';
import type {
  AppSettings,
  UserProfile,
  TargetRace,
  RunningShoe,
  QuickLogStaple,
} from '../types/acr';
import { ShoeMileageTracker } from './ShoeMileageTracker';
import { QuickLogPresetsModal } from './QuickLogPresetsModal';
import { getUserQuickStaples, formatStapleLabel, getRunTypeColor } from '../utils/calculations';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  currentUser: UserProfile;
  onToggleRole: () => void;
  onOpenAuth: () => void;
}

export const SettingsTab: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  currentUser,
  onToggleRole,
  onOpenAuth,
}) => {
  const currentTheme = settings.themeMode || 'dark';

  // Target race form state
  const [raceName, setRaceName] = useState(settings.targetRace?.name || '');
  const [raceDate, setRaceDate] = useState(settings.targetRace?.date || '');
  const [raceTime, setRaceTime] = useState(settings.targetRace?.targetTime || '');
  const [raceSavedToast, setRaceSavedToast] = useState('');

  const handleSaveRace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!raceName.trim() || !raceDate) return;
    const targetRace: TargetRace = {
      name: raceName.trim(),
      date: raceDate,
      targetTime: raceTime.trim() || undefined,
    };
    onUpdateSettings({ targetRace });
    setRaceSavedToast('✓ Target race saved!');
    setTimeout(() => setRaceSavedToast(''), 2500);
  };

  const handleClearRace = () => {
    setRaceName('');
    setRaceDate('');
    setRaceTime('');
    onUpdateSettings({ targetRace: undefined });
    setRaceSavedToast('✓ Target race cleared');
    setTimeout(() => setRaceSavedToast(''), 2500);
  };

  const handleAddShoe = (newShoe: RunningShoe) => {
    const currentShoes = settings.shoes || [];
    onUpdateSettings({ shoes: [...currentShoes, newShoe] });
  };

  const handleRetireShoe = (shoeId: string) => {
    const currentShoes = settings.shoes || [];
    const updated = currentShoes.map((s) => (s.id === shoeId ? { ...s, isRetired: true } : s));
    onUpdateSettings({ shoes: updated });
  };

  const handleSetDefaultShoe = (shoeId: string) => {
    const currentShoes = settings.shoes || [];
    const updated = currentShoes.map((s) => ({
      ...s,
      isDefault: s.id === shoeId,
    }));
    onUpdateSettings({ shoes: updated });
  };

  // Quick log presets modal state
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);

  const handleSaveUserStaples = (userId: string, staples: QuickLogStaple[]) => {
    const currentMap = settings.userQuickStaples || {};
    const updatedMap = {
      ...currentMap,
      [userId]: staples,
    };
    onUpdateSettings({ userQuickStaples: updatedMap });
  };

  return (
    <div className="settings-tab-view animate-fade-in">
      <div className="tab-header-row">
        <div>
          <h1 className="tab-main-title">Settings</h1>
        </div>
      </div>

      <div className="settings-cards-grid">
        {/* Appearance & Color Scheme Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Theme</h2>
            </div>
          </div>

          <div className="theme-options-grid">
            {/* Dark Mode Option */}
            <button
              type="button"
              className={`theme-selection-card ${currentTheme === 'dark' ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ themeMode: 'dark' })}
              aria-pressed={currentTheme === 'dark'}
            >
              <div className="theme-card-preview theme-preview-dark">
                <div className="theme-sample-bar sample-bar-dark" />
                <div className="theme-sample-dots">
                  <span className="dot dot-cyan" />
                  <span className="dot dot-slate" />
                </div>
              </div>
              <div className="theme-card-info">
                <div className="theme-title-row">
                  <span className="theme-name">Dark Mode</span>
                  {currentTheme === 'dark' && <span className="theme-check-badge">Active</span>}
                </div>
              </div>
            </button>

            {/* Light Mode Option */}
            <button
              type="button"
              className={`theme-selection-card ${currentTheme === 'light' ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ themeMode: 'light' })}
              aria-pressed={currentTheme === 'light'}
            >
              <div className="theme-card-preview theme-preview-light">
                <div className="theme-sample-bar sample-bar-light" />
                <div className="theme-sample-dots">
                  <span className="dot dot-darkgreen" />
                  <span className="dot dot-black" />
                </div>
              </div>
              <div className="theme-card-info">
                <div className="theme-title-row">
                  <span className="theme-name">Light Mode</span>
                  {currentTheme === 'light' && <span className="theme-check-badge">Active</span>}
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Measurement Units */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Distance Units</h2>
            </div>
          </div>
          <div className="settings-row-control">
            <span className="text-secondary text-sm">Preferred Unit</span>
            <div className="segmented-unit-control large">
              <button
                type="button"
                className={`seg-btn ${settings.distanceUnit === 'mi' ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ distanceUnit: 'mi' })}
              >
                Miles (mi)
              </button>
              <button
                type="button"
                className={`seg-btn ${settings.distanceUnit === 'km' ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ distanceUnit: 'km' })}
              >
                Kilometers (km)
              </button>
            </div>
          </div>
        </section>

        {/* Training Schedule */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Week Starts On</h2>
            </div>
          </div>
          <div className="settings-row-control">
            <span className="text-secondary text-sm">First Day of Week</span>
            <div className="segmented-unit-control large">
              <button
                type="button"
                className={`seg-btn ${settings.firstDayOfWeek === 1 ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ firstDayOfWeek: 1 })}
              >
                Monday
              </button>
              <button
                type="button"
                className={`seg-btn ${settings.firstDayOfWeek === 0 ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ firstDayOfWeek: 0 })}
              >
                Sunday
              </button>
              <button
                type="button"
                className={`seg-btn ${settings.firstDayOfWeek === 6 ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ firstDayOfWeek: 6 })}
              >
                Saturday
              </button>
            </div>
          </div>
        </section>

        {/* ACR Safety Threshold */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">ACR Warning Threshold</h2>
            </div>
          </div>
          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Threshold</span>
              <span className="text-muted text-xs">Optimal: 0.8 – 1.3</span>
            </div>
            <div className="segmented-unit-control large">
              {[1.2, 1.3, 1.4, 1.5].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`seg-btn ${settings.warningThreshold === val ? 'active' : ''}`}
                  onClick={() => onUpdateSettings({ warningThreshold: val })}
                >
                  {val.toFixed(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Weekly Mileage Target (Strava Benchmark) */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Weekly Mileage Target</h2>
              <p className="settings-card-desc">
                Set your weekly goal distance to track progress in the athletic progress ring.
              </p>
            </div>
          </div>
          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Weekly Target</span>
              <span className="text-muted text-xs">Current unit: {settings.distanceUnit.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="250"
                step="5"
                className="input font-mono w-24 text-center"
                value={settings.weeklyMileageTarget ?? 35}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateSettings({ weeklyMileageTarget: isNaN(val) ? 0 : val });
                }}
              />
              <span className="font-mono text-sm font-semibold text-primary">{settings.distanceUnit.toUpperCase()} / wk</span>
            </div>
          </div>
        </section>

        {/* User Role & Profile */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Account & Role</h2>
            </div>
          </div>

          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Active Mode</span>
              <span className="text-muted text-xs">
                {currentUser.role === 'coach' ? 'Coach Mode' : 'Athlete Mode'}
              </span>
            </div>
            <button
              type="button"
              className="btn-settings-pill"
              onClick={onToggleRole}
            >
              Switch to {currentUser.role === 'coach' ? 'Athlete' : 'Coach'}
            </button>
          </div>

          <div className="settings-divider" />

          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">{currentUser.name}</span>
              <span className="text-muted text-xs">{currentUser.email}</span>
            </div>
            <button
              type="button"
              className="btn-plan-header"
              onClick={onOpenAuth}
            >
              Account & Sync
            </button>
          </div>
        </section>

        {/* Target Race & Periodization Goal */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Target Race &amp; Goal Event</h2>
              <p className="settings-card-desc">
                Sets up the countdown widget and training macro-cycle phase (Base, Peak, Taper, Race Week).
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveRace} className="space-y-3">
            <div className="shoe-form-grid">
              <div className="shoe-input-group">
                <label className="text-xs text-muted">Race / Event Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Boston Marathon, Local 5K"
                  value={raceName}
                  onChange={(e) => setRaceName(e.target.value)}
                  required
                />
              </div>
              <div className="shoe-input-group">
                <label className="text-xs text-muted">Race Date</label>
                <input
                  type="date"
                  className="input font-mono"
                  value={raceDate}
                  onChange={(e) => setRaceDate(e.target.value)}
                  required
                />
              </div>
              <div className="shoe-input-group">
                <label className="text-xs text-muted">Goal Time (Optional)</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. 3:15:00 or 19:45"
                  value={raceTime}
                  onChange={(e) => setRaceTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <button type="submit" className="btn btn-primary btn-sm">
                  Save Target Race
                </button>
                {settings.targetRace && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleClearRace}
                  >
                    Clear Race
                  </button>
                )}
              </div>
              {raceSavedToast && (
                <span className="text-xs font-mono font-bold text-success animate-fade-in">
                  {raceSavedToast}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* 1-Tap Quick-Log Presets Customization */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">1-Tap Quick-Log Presets</h2>
              <p className="settings-card-desc">
                Pre-set up to 7 custom shortcut buttons for {currentUser.name}&apos;s staple runs (e.g. Easy 10 Miler, 10 Mile Moderate, 18 Mile Long Run).
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm font-mono"
              onClick={() => setIsPresetsModalOpen(true)}
            >
              Customize Presets ⚙️
            </button>
          </div>

          <div className="quick-relog-chips mt-3">
            {getUserQuickStaples(currentUser.id, settings.userQuickStaples, settings.distanceUnit).map((staple, idx) => {
              const runColor = getRunTypeColor(staple.runType);
              return (
                <div
                  key={staple.id}
                  className="quick-staple-btn flex items-center gap-1.5 py-1 px-2.5"
                  style={{ borderColor: runColor }}
                >
                  <span className="font-mono text-muted text-xxs">#{idx + 1}</span>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: runColor }} />
                  <span>{formatStapleLabel(staple)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Running Shoes & Gear Lifespan Tracker */}
        <section className="settings-card">
          <ShoeMileageTracker
            shoes={settings.shoes || []}
            onAddShoe={handleAddShoe}
            onRetireShoe={handleRetireShoe}
            onSetDefaultShoe={handleSetDefaultShoe}
          />
        </section>
      </div>

      {/* Quick-Log Presets Customizer Modal */}
      {isPresetsModalOpen && (
        <QuickLogPresetsModal
          isOpen={isPresetsModalOpen}
          onClose={() => setIsPresetsModalOpen(false)}
          currentUser={currentUser}
          distanceUnit={settings.distanceUnit}
          userQuickStaplesMap={settings.userQuickStaples}
          onSaveUserStaples={handleSaveUserStaples}
        />
      )}
    </div>
  );
};
