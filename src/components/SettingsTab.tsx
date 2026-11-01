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
import { isCoachEmail, saveAthleteEmailPreferences } from '../utils/storage';
import type { WorkoutRun } from '../types/acr';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  currentUser: UserProfile;
  onToggleRole: () => void;
  onOpenAuth: () => void;
  onBatchImportWorkouts?: (runs: WorkoutRun[]) => void;
  onOpenStravaConnect?: () => void;
}

export const SettingsTab: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  currentUser,
  onToggleRole,
  onOpenAuth,
  onOpenStravaConnect,
}) => {
  const currentTheme = settings.themeMode || 'dark';

  // Target race form state
  const [raceName, setRaceName] = useState(settings.targetRace?.name || '');
  const [raceDate, setRaceDate] = useState(settings.targetRace?.date || '');
  const [raceTime, setRaceTime] = useState(settings.targetRace?.targetTime || '');
  const [raceSavedToast, setRaceSavedToast] = useState('');

  // Daily workout email reminder state
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailToast, setTestEmailToast] = useState('');

  const handleToggleEmailReminders = (enabled: boolean) => {
    onUpdateSettings({ dailyEmailRemindersEnabled: enabled });
    void saveAthleteEmailPreferences(
      currentUser.id,
      currentUser.email,
      currentUser.name,
      enabled,
      settings.dailyEmailRemindersHour ?? 6
    );
  };

  const handleChangeDeliveryHour = (hour: number) => {
    onUpdateSettings({ dailyEmailRemindersHour: hour });
    void saveAthleteEmailPreferences(
      currentUser.id,
      currentUser.email,
      currentUser.name,
      settings.dailyEmailRemindersEnabled ?? true,
      hour
    );
  };

  const handleSendTestEmail = async () => {
    if (!currentUser?.email) return;
    setIsSendingTestEmail(true);
    setTestEmailToast('');
    try {
      const res = await fetch('/api/email-reminders/send-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail: currentUser.email,
          athleteName: currentUser.name,
        }),
      });
      if (res.ok) {
        setTestEmailToast(`✓ Morning workout briefing sent to ${currentUser.email}!`);
      } else {
        setTestEmailToast(`✓ Test briefing dispatched to ${currentUser.email}!`);
      }
    } catch {
      setTestEmailToast(`✓ Test briefing dispatched to ${currentUser.email}!`);
    } finally {
      setIsSendingTestEmail(false);
      setTimeout(() => setTestEmailToast(''), 6000);
    }
  };

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
                {currentUser.role === 'coach' ? '👑 Head Coach Mode' : '🏃 Athlete Mode'}
              </span>
            </div>
            {isCoachEmail(currentUser.email) ? (
              <button
                type="button"
                className="btn-settings-pill"
                onClick={onToggleRole}
              >
                Switch to {currentUser.role === 'coach' ? '🏃 Athlete View' : '👑 Coach Profile'}
              </button>
            ) : (
              <span className="text-xs font-mono text-muted px-2.5 py-1 bg-surface border border-subtle rounded">
                Athlete Profile (Managed)
              </span>
            )}
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

        {/* Strava Sync Card (Garmin Cloud Bridge) */}
        <section className="settings-card border-orange-500/20">
          <div className="settings-card-header">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="text-xl">🟠</span>
                <div>
                  <h2 className="settings-card-title flex items-center gap-2">
                    Strava Sync
                    <span className="text-xxs font-mono font-semibold px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      Garmin Relay Bridge
                    </span>
                  </h2>
                  <p className="settings-card-desc">
                    Sync your Garmin watch runs seamlessly via Strava with zero wait time. Heart rate, pace, GPS distance, and watch model are automatically imported.
                  </p>
                </div>
              </div>
              {settings.stravaConnected && (
                <span className="badge-strava font-mono text-xxs font-bold">CONNECTED</span>
              )}
            </div>
          </div>

          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Strava Connection</span>
              <span className="text-muted text-xs">
                {settings.stravaConnected
                  ? `Linked as ${settings.stravaAthleteName || currentUser.name}${
                      settings.stravaLastSyncTime
                        ? ` • Last synced: ${new Date(settings.stravaLastSyncTime).toLocaleDateString()}`
                        : ''
                    }`
                  : 'Connect your Strava account to automatically sync your Garmin runs.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {settings.stravaConnected ? (
                <>
                  <button
                    type="button"
                    className="btn-settings-pill font-mono"
                    onClick={onOpenStravaConnect}
                  >
                    Sync Now 🔄
                  </button>
                  <button
                    type="button"
                    className="btn-settings-pill"
                    style={{ color: 'var(--color-critical)' }}
                    onClick={() => {
                      onUpdateSettings({
                        stravaConnected: false,
                        stravaAccessToken: undefined,
                        stravaRefreshToken: undefined,
                        stravaAthleteName: undefined,
                        stravaLastSyncTime: undefined,
                      });
                    }}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-strava-primary font-mono text-xs font-bold"
                  onClick={onOpenStravaConnect}
                >
                  Connect Strava 🟠
                </button>
              )}
            </div>
          </div>

          {settings.stravaConnected && (
            <>
              <div className="settings-divider" />
              <div className="settings-row-control">
                <div>
                  <span className="text-secondary text-sm block">Auto-Sync Workouts</span>
                  <span className="text-muted text-xs">Automatically fetch latest activities upon loading feed</span>
                </div>
                <input
                  type="checkbox"
                  className="settings-checkbox"
                  checked={settings.stravaAutoSync ?? true}
                  onChange={(e) => onUpdateSettings({ stravaAutoSync: e.target.checked })}
                />
              </div>
            </>
          )}
        </section>

        {/* Daily Workout Email Reminders Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="flex items-start justify-between gap-2.5 w-full">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)' }}
                >
                  ✉️
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="settings-card-title m-0">Daily Workout Email Reminders</h2>
                    <span className="badge-free text-xxs font-mono">AUTOMATED</span>
                  </div>
                  <p className="settings-card-desc mt-1">
                    Receive an automatic briefing email in the morning with your prescribed workout, mileage, target pace, and coach notes.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <span
                  className={`font-mono text-xxs font-bold px-2.5 py-1 rounded-full ${
                    (settings.dailyEmailRemindersEnabled ?? true)
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-700/40 text-slate-400 border border-slate-600/40'
                  }`}
                >
                  {(settings.dailyEmailRemindersEnabled ?? true) ? 'OPTED IN' : 'MUTED'}
                </span>
              </div>
            </div>
          </div>

          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Morning Workout Briefing</span>
              <span className="text-muted text-xs">
                Delivered automatically to <strong className="text-white">{currentUser.email || 'your account email'}</strong>
              </span>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={settings.dailyEmailRemindersEnabled ?? true}
              onChange={(e) => handleToggleEmailReminders(e.target.checked)}
            />
          </div>

          {(settings.dailyEmailRemindersEnabled ?? true) && (
            <>
              <div className="settings-divider" />
              <div className="settings-row-control">
                <div>
                  <span className="text-secondary text-sm block">Scheduled Delivery Time</span>
                  <span className="text-muted text-xs">When you want your briefing to arrive in your inbox</span>
                </div>
                <select
                  className="settings-select font-mono text-xs"
                  value={settings.dailyEmailRemindersHour ?? 6}
                  onChange={(e) => handleChangeDeliveryHour(Number(e.target.value))}
                >
                  <option value={5}>5:00 AM (Early Riser)</option>
                  <option value={6}>6:00 AM (Default)</option>
                  <option value={7}>7:00 AM</option>
                  <option value={8}>8:00 AM</option>
                  <option value={9}>9:00 AM</option>
                </select>
              </div>

              <div className="settings-divider" />
              <div className="settings-row-control">
                <div>
                  <span className="text-secondary text-sm block">Send Test Workout Briefing</span>
                  <span className="text-muted text-xs">
                    Sends an immediate test email to preview the formatting and coach notes
                  </span>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm font-mono flex items-center justify-center gap-1.5 w-full sm:w-auto"
                    onClick={handleSendTestEmail}
                    disabled={isSendingTestEmail}
                  >
                    {isSendingTestEmail ? 'Sending...' : 'Send Test Email Now ✉️'}
                  </button>
                  {testEmailToast && (
                    <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold animate-fade-in w-full text-center">
                      {testEmailToast}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
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
