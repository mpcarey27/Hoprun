import React from 'react';
import type { ActiveNavTab } from './Header';

interface Props {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  pendingAssignedCount?: number;
}

export const MobileBottomNav: React.FC<Props> = ({
  activeTab,
  onTabChange,
  pendingAssignedCount = 0,
}) => {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {/* Tab 1: Workouts (Feed) */}
      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'workouts' ? 'active' : ''}`}
        onClick={() => onTabChange('workouts')}
        aria-label="Workouts Feed"
      >
        <span className="mobile-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 4v6l4-2-4 12V8l-4 2 4-6z" fill="currentColor" fillOpacity="0.2" />
            <circle cx="12" cy="4" r="2" />
            <path d="M15 8a5 5 0 0 0-6 0l-2 5 3-1 2 8 3-7-3-2 3-3z" />
          </svg>
        </span>
        <span className="mobile-nav-label">Workouts</span>
      </button>

      {/* Tab 2: Training Log / Calendar */}
      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'training_log' ? 'active' : ''}`}
        onClick={() => onTabChange('training_log')}
        aria-label="Training Calendar"
      >
        <span className="mobile-nav-icon relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeWidth="2.5" />
          </svg>
          {pendingAssignedCount > 0 && (
            <span className="mobile-nav-badge">{pendingAssignedCount}</span>
          )}
        </span>
        <span className="mobile-nav-label">Calendar</span>
      </button>

      {/* Tab 3: Analytics / ACWR */}
      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
        onClick={() => onTabChange('analytics')}
        aria-label="Analytics & Workload"
      >
        <span className="mobile-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
            <path d="M3 20h18" />
          </svg>
        </span>
        <span className="mobile-nav-label">Analytics</span>
      </button>

      {/* Tab 4: Settings */}
      <button
        type="button"
        className={`mobile-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        aria-label="Settings & Profile"
      >
        <span className="mobile-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <span className="mobile-nav-label">Settings</span>
      </button>
    </nav>
  );
};
