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
          <h1 className="tab-main-title">App Settings</h1>
          <p className="tab-subtitle">
            Configure appearance, training schedule rules, and workload thresholds
          </p>
        </div>
      </div>

      <div className="settings-cards-grid">
        {/* Appearance & Color Scheme Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Appearance & Theme</h2>
              <p className="settings-card-desc">
                Choose between refined slate dark mode and crisp white/dark green light mode
              </p>
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
                <p className="theme-desc">
                  Softer graphite & deep slate canvas, easy on the eyes during evening workouts
                </p>
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
                <p className="theme-desc">
                  Crisp pure white background with athletic dark green accents and black typography
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Measurement Units */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2 className="settings-card-title">Distance & Units</h2>
              <p className="settings-card-desc">
                Default measurement system used across all run logs and analytics
              </p>
            </div>
          </div>
          <div className="settings-row-control">
            <span className="text-secondary text-sm">Measurement System</span>
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
              <h2 className="settings-card-title">Training Week Schedule</h2>
              <p className="settings-card-desc">
                Determines which day begins your 7-day rolling acute workload window
              </p>
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
              <h2 className="settings-card-title">ACR Injury Risk Threshold</h2>
              <p className="settings-card-desc">
                Triggers visual warning banners when Acute:Chronic ratio projects beyond this value
              </p>
            </div>
          </div>
          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Warning Ratio</span>
              <span className="text-muted text-xs">Dr. Tim Gabbett Sweet Spot: 0.8 – 1.30</span>
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
              <h2 className="settings-card-title">User Role & Account</h2>
              <p className="settings-card-desc">
                Toggle athlete logging vs coach multi-athlete prescription tools
              </p>
            </div>
          </div>

          <div className="settings-row-control">
            <div>
              <span className="text-secondary text-sm block">Current Mode</span>
              <span className="text-muted text-xs">
                {currentUser.role === 'coach'
                  ? 'Coach (Can assign recurring runs & generate plans)'
                  : 'Athlete (Self-logging & training log view)'}
              </span>
            </div>
            <button
              type="button"
              className="btn-settings-pill"
              onClick={onToggleRole}
            >
              Switch to {currentUser.role === 'coach' ? 'Athlete' : 'Coach'} Mode
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
              Google Account & Cloudflare D1
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
