import React from 'react';
import type {
  DistanceUnit,
  DayOfWeek,
  UserProfile,
  CoachNotification,
  ThemeMode,
} from '../types/acr';
import { NotificationCenter } from './NotificationCenter';
import { isCoachEmail } from '../utils/storage';

export type ActiveNavTab = 'workouts' | 'training_log' | 'analytics' | 'settings';

interface Props {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  distanceUnit: DistanceUnit;
  onUnitChange: (unit: DistanceUnit) => void;
  firstDayOfWeek: DayOfWeek;
  onFirstDayChange: (day: DayOfWeek) => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  currentUser: UserProfile;
  onOpenAuth: () => void;
  onOpenPlanBuilder: () => void;
  notifications: CoachNotification[];
  onMarkAllRead: () => void;
  onClearAllNotifications: () => void;
  onToggleRole: () => void;
  onOpenAssignRun?: () => void;
  onOpenQuickLog?: () => void;
  onOpenAssignedRuns?: () => void;
  pendingAssignedCount?: number;
  onOpenInvite?: () => void;
  onSignOut?: () => void;
  onOpenStravaConnect?: () => void;
  stravaConnected?: boolean;
  isStravaAutoSyncing?: boolean;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onTabChange,
  distanceUnit,
  onUnitChange,
  firstDayOfWeek,
  onFirstDayChange,
  themeMode,
  onThemeChange,
  currentUser,
  onOpenAuth,
  onOpenPlanBuilder,
  notifications,
  onMarkAllRead,
  onClearAllNotifications,
  onToggleRole,
  onOpenAssignRun,
  onOpenQuickLog,
  onOpenAssignedRuns,
  pendingAssignedCount = 0,
  onOpenInvite,
  onSignOut,
  onOpenStravaConnect,
  stravaConnected = false,
  isStravaAutoSyncing = false,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const settingsMenuRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSettingsOpen]);

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand with Running Shoe Logo */}
        <div className="brand-section">
          <div className="brand-shoe-logo" title="Hop Run — Workload & Injury Prevention">
            <svg
              className="shoe-icon-svg"
              viewBox="0 0 54 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="1" y1="17" x2="5" y2="17" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
              <line x1="0" y1="21" x2="4" y2="21" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
              <line x1="2" y1="25" x2="5" y2="25" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
              <path
                d="M5 27C8 27 13 28.5 19 28.5C29 28.5 39 27.5 49 23C50 22.5 50.5 21 48 21C43 21 35 22 29 22C20 22 11 20.5 6 24C4.5 25 4.5 27 5 27Z"
                fill="var(--color-accent)"
              />
              <path
                d="M7 28C11 29 17 29.5 23 29.5C33 29.5 41 28.5 49 24.5C50 26 48 27.5 45 28.5C37 30.5 23 30.5 13 30C8 30 6 28.8 7 28Z"
                fill="var(--color-accent-hover)"
              />
              <path
                d="M9 23C12 19 17 14.5 25 14.5C29 14.5 31 17 35 14C38 11.5 40 8.5 44 8.5C46.5 8.5 47.5 11 46 14C44.5 17 44.5 19.5 47 21.5C40 22.5 29 22.5 21 22.5C15 22.5 11 22 9 23Z"
                fill="var(--text-primary)"
              />
              <path
                d="M44 8.5C40 8.5 38 11.5 35 14C31 17 29 14.5 25 14.5C22 14.5 19 16 16 18.5L19 21.5C23 18.5 27 17.5 31 17.5C35 17.5 38 15 40 13L44 8.5Z"
                fill="var(--text-muted)"
              />
              <path
                d="M18 21.5C25 20 33 18.5 41 15.5C38 18 33 20.5 25 22C21 22.5 19 22 18 21.5Z"
                fill="var(--color-accent)"
              />
              <line x1="27" y1="14" x2="32" y2="17" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="30" y1="12" x2="35" y2="15" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="34" y1="10" x2="39" y2="13" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="brand-logo-text">HOP</span>
          </div>
          <div>
            <span className="brand-title">Hop Run</span>
            <span className="brand-subtitle desktop-only-text">Workload & Injury Prevention</span>
          </div>
        </div>

        {/* Center Main Tab Navigation (Desktop Pill Navigation) */}
        <nav className="header-tabs-nav desktop-tabs-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`tab-pill ${activeTab === 'workouts' ? 'tab-pill-active' : ''}`}
            onClick={() => onTabChange('workouts')}
          >
            Workouts
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'training_log' ? 'tab-pill-active' : ''}`}
            onClick={() => onTabChange('training_log')}
          >
            Training Log
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'analytics' ? 'tab-pill-active' : ''}`}
            onClick={() => onTabChange('analytics')}
          >
            Analytics
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'settings' ? 'tab-pill-active' : ''}`}
            onClick={() => onTabChange('settings')}
          >
            Settings
          </button>
        </nav>

        {/* Mobile View Dropdown Navigation */}
        <div className="mobile-tab-selector-container">
          <select
            className="mobile-tab-select font-mono"
            value={activeTab}
            onChange={(e) => onTabChange(e.target.value as ActiveNavTab)}
            aria-label="Navigation View"
          >
            <option value="workouts">Workouts</option>
            <option value="training_log">Training Log</option>
            <option value="analytics">Analytics</option>
            <option value="settings">Settings</option>
          </select>
        </div>

        {/* Right Actions: Plan Builder, Notifications & Profile/Settings Drawer */}
        <div className="header-actions">
          {/* Coach Assign Run Button (Only visible for Coach on desktop) */}
          {currentUser.role === 'coach' && onOpenAssignRun && (
            <button
              type="button"
              className="btn-assign-run-header header-btn-desktop-only"
              onClick={onOpenAssignRun}
              title="Assign recurring runs to athlete calendar"
            >
              <span className="desktop-only-text">Assign Run</span>
              <span className="mobile-only-text">Assign</span>
            </button>
          )}

          {/* Plan Builder & Google Sheet Integration (Strictly Coach Admin Only on desktop) */}
          {currentUser.role === 'coach' && isCoachEmail(currentUser.email) && (
            <button
              type="button"
              className="btn-plan-header header-btn-desktop-only"
              onClick={onOpenPlanBuilder}
              title="Coach Only: Select athlete & link their color-coded Google Sheet plan"
            >
              <span className="desktop-only-text">📊 Sheet / Plan</span>
              <span className="mobile-only-text">📊 Plans</span>
            </button>
          )}

          {/* Coach Invite Athletes Button (desktop) */}
          {currentUser.role === 'coach' && onOpenInvite && (
            <button
              type="button"
              className="btn-invite-header header-btn-desktop-only"
              onClick={onOpenInvite}
              title="Invite athletes to your roster"
            >
              <span className="invite-mail-icon">✉️</span>
              <span className="desktop-only-text">Invite</span>
            </button>
          )}

          {/* Ambient Athlete Mode badge for Michael Carey to easily toggle back */}
          {isCoachEmail(currentUser.email) && currentUser.role === 'runner' && (
            <button
              type="button"
              className="btn-coach-view-pill header-btn-desktop-only"
              onClick={onToggleRole}
              title="Currently testing as Athlete. Click to return to Coach Michael Carey."
            >
              <span className="athlete-dot">●</span>
              <span className="desktop-only-text">Athlete View → <strong>Coach</strong></span>
              <span className="mobile-only-text">→ Coach</span>
            </button>
          )}

          {/* Strava Cloud Sync Header Pill (desktop) */}
          {onOpenStravaConnect && (
            <button
              type="button"
              className={`btn-header-strava header-btn-desktop-only ${stravaConnected ? 'connected' : ''}`}
              onClick={onOpenStravaConnect}
              title={stravaConnected ? 'Strava Sync Active — Click to manage sync' : 'Connect Strava to sync runs automatically'}
              aria-label="Strava Sync"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '13px', height: '13px' }} aria-hidden="true">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.01 13.828h4.172" />
              </svg>
              <span className="desktop-only-text font-bold">
                {isStravaAutoSyncing
                  ? 'Syncing Strava...'
                  : stravaConnected
                    ? 'Strava Synced'
                    : 'Sync Strava'}
              </span>
              {stravaConnected && <span className="strava-dot-live">●</span>}
            </button>
          )}

          {/* Global + Symbol: Log a run on ANY page (Athlete or Coach Admin) */}
          {onOpenQuickLog && (
            <button
              type="button"
              className="btn-header-quick-log"
              onClick={onOpenQuickLog}
              title="Log a run"
              aria-label="Log Run"
            >
              <span className="quick-log-plus-icon">+</span>
              <span className="desktop-only-text font-bold">Log Run</span>
            </button>
          )}

          {/* Checkmark Icon: For athletes to view and check off today's assigned runs */}
          {currentUser.role === 'runner' && onOpenAssignedRuns && (
            <button
              type="button"
              className="btn-header-check-assigned"
              onClick={onOpenAssignedRuns}
              title="Today's assigned workouts"
              aria-label="Today's Assigned Workouts"
            >
              <span className="check-assigned-icon">✓</span>
              {pendingAssignedCount > 0 && (
                <span className="check-assigned-badge" title={`${pendingAssignedCount} assigned workouts pending today`}>
                  {pendingAssignedCount}
                </span>
              )}
            </button>
          )}

          {/* Coach Notifications Bell */}
          <NotificationCenter
            notifications={notifications}
            onMarkAllRead={onMarkAllRead}
            onClearAll={onClearAllNotifications}
          />

          {/* User Profile & Preferences Popover */}
          <div className="settings-popover-wrapper" ref={settingsMenuRef}>
            <button
              type="button"
              className={`btn-user-avatar ${isSettingsOpen ? 'btn-user-avatar-active' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Account & preferences"
              aria-expanded={isSettingsOpen}
            >
              <span className="user-avatar-initial">
                {currentUser.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="user-role-badge">
                {currentUser.role === 'coach' ? 'Coach' : 'Athlete'}
              </span>
              <span className="dropdown-caret">▾</span>
            </button>

            {isSettingsOpen && (
              <div className="settings-menu-dropdown animate-in">
                {/* User identity card */}
                <div className="settings-user-info">
                  <div className="user-avatar-initial large">
                    {currentUser.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong className="text-primary text-sm block">{currentUser.name}</strong>
                    <span className="text-muted text-xs">{currentUser.email}</span>
                  </div>
                </div>

                <div className="settings-divider" />

                {/* Role Switcher (Exclusively available for coach careyer1234@gmail.com) */}
                <div className="settings-item">
                  <div className="settings-item-label">
                    <span className="text-xs font-medium text-primary">Active Mode</span>
                  </div>
                  {isCoachEmail(currentUser.email) ? (
                    <button
                      type="button"
                      className="btn-settings-pill"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        onToggleRole();
                      }}
                      title="Switch between Coach and Athlete profile"
                    >
                      Switch to {currentUser.role === 'coach' ? '🏃 Athlete View' : '👑 Coach Profile'}
                    </button>
                  ) : (
                    <span className="text-xs font-mono text-muted px-2 py-1 bg-surface rounded">
                      Athlete (Roster)
                    </span>
                  )}
                </div>

                {/* Coach Invite Roster Link */}
                {currentUser.role === 'coach' && onOpenInvite && (
                  <div className="settings-item">
                    <div className="settings-item-label">
                      <span className="text-xs font-medium text-primary">Team Management</span>
                    </div>
                    <button
                      type="button"
                      className="btn-settings-pill"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        onOpenInvite();
                      }}
                    >
                      ✉️ Invite Athletes
                    </button>
                  </div>
                )}

                {/* Coach Mobile Quick Tools */}
                {currentUser.role === 'coach' && (
                  <div className="coach-dropdown-tools p-2 rounded-lg bg-surface border border-subtle mb-3 space-y-1.5">
                    <span className="text-xxs uppercase tracking-wider text-muted font-mono block">
                      Coach Tools
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {onOpenAssignRun && (
                        <button
                          type="button"
                          className="btn-settings-pill text-xs py-1.5 px-2 text-center"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            onOpenAssignRun();
                          }}
                        >
                          ⚡ Assign Run
                        </button>
                      )}
                      {onOpenPlanBuilder && isCoachEmail(currentUser.email) && (
                        <button
                          type="button"
                          className="btn-settings-pill text-xs py-1.5 px-2 text-center"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            onOpenPlanBuilder();
                          }}
                        >
                          📊 Sheet / Plan
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Theme Mode Switcher */}
                <div className="settings-item">
                  <div className="settings-item-label">
                    <span className="text-xs font-medium text-primary">Appearance</span>
                  </div>
                  <div className="segmented-unit-control">
                    <button
                      type="button"
                      className={`seg-btn ${themeMode === 'dark' ? 'active' : ''}`}
                      onClick={() => onThemeChange('dark')}
                    >
                      DARK
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${themeMode === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                    >
                      LIGHT
                    </button>
                  </div>
                </div>

                {/* Distance Units Switcher */}
                <div className="settings-item">
                  <div className="settings-item-label">
                    <span className="text-xs font-medium text-primary">Distance Unit</span>
                  </div>
                  <div className="segmented-unit-control">
                    <button
                      type="button"
                      className={`seg-btn ${distanceUnit === 'mi' ? 'active' : ''}`}
                      onClick={() => onUnitChange('mi')}
                    >
                      MILES
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${distanceUnit === 'km' ? 'active' : ''}`}
                      onClick={() => onUnitChange('km')}
                    >
                      KM
                    </button>
                  </div>
                </div>

                {/* Training Week Start */}
                <div className="settings-item">
                  <div className="settings-item-label">
                    <span className="text-xs font-medium text-primary">Week Starts On</span>
                  </div>
                  <select
                    className="settings-select"
                    value={firstDayOfWeek}
                    onChange={(e) => onFirstDayChange(Number(e.target.value) as DayOfWeek)}
                  >
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>

                <div className="settings-divider" />

                {/* Open Full Settings Tab */}
                <button
                  type="button"
                  className="btn-settings-pill full-width"
                  style={{ width: '100%', marginBottom: '0.5rem', textAlign: 'center' }}
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onTabChange('settings');
                  }}
                >
                  Settings →
                </button>

                {/* Strava Sync Shortcut */}
                {onOpenStravaConnect && (
                  <button
                    type="button"
                    className="btn-settings-auth"
                    style={{ marginBottom: '0.25rem' }}
                    onClick={() => {
                      setIsSettingsOpen(false);
                      onOpenStravaConnect();
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span style={{ color: '#FC4C02', fontWeight: 800 }}>🟠</span>
                      <span>Strava Sync</span>
                    </span>
                    <span className="text-xs font-mono font-bold" style={{ color: stravaConnected ? 'var(--color-success)' : '#FC4C02' }}>
                      {stravaConnected ? 'Linked ✓' : 'Connect →'}
                    </span>
                  </button>
                )}

                {/* Account Settings / Switch */}
                <button
                  type="button"
                  className="btn-settings-auth"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onOpenAuth();
                  }}
                >
                  <span>Google Account Profile</span>
                  <span className="text-accent text-xs">→</span>
                </button>

                {/* Sign Out Button */}
                {onSignOut && (
                  <button
                    type="button"
                    className="btn-settings-auth"
                    style={{ color: 'var(--color-critical)', marginTop: '0.25rem' }}
                    onClick={() => {
                      setIsSettingsOpen(false);
                      onSignOut();
                    }}
                  >
                    <span>Sign Out</span>
                    <span className="text-xs">🚪</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
