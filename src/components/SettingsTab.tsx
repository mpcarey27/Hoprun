import React from 'react';
import type {
  AppSettings,
  UserProfile,
} from '../types/acr';

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
      </div>
    </div>
  );
};
