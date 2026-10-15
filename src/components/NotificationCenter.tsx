import React, { useState } from 'react';
import type { CoachNotification } from '../types/acr';

interface Props {
  notifications: CoachNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export const NotificationCenter: React.FC<Props> = ({
  notifications,
  onMarkAllRead,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTimeAgo = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="notif-wrapper">
      <button
        type="button"
        className="btn-notif-bell"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            onMarkAllRead();
          }
        }}
        title="Coach Notification Center"
      >
        <span className="notif-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notif-count-badge font-mono">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <div>
              <h4 className="text-xs uppercase font-mono font-bold text-white">Athlete Activity Alerts</h4>
              <span className="text-xxs text-muted">Completed & edited workout notices</span>
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                className="text-xxs text-secondary hover:text-white underline"
                onClick={onClearAll}
              >
                Clear all
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <span className="text-xs text-muted">No athlete notifications yet</span>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-card ${n.type === 'edited' ? 'notif-edited' : 'notif-completed'}`}
                >
                  <div className="notif-card-header">
                    <span className={`notif-badge ${n.type === 'edited' ? 'badge-caution' : 'badge-safe'}`}>
                      {n.type === 'edited' ? '✏️ EDITED WORKOUT' : '✓ COMPLETED WORKOUT'}
                    </span>
                    <span className="text-xxs text-muted font-mono">{formatTimeAgo(n.timestamp)}</span>
                  </div>

                  <p className="notif-title">
                    <strong>{n.athleteName}</strong>{' '}
                    {n.type === 'edited' ? 'modified' : 'finished'} <strong>{n.runType}</strong> ({n.distance} {n.unit}) on {n.date}
                  </p>

                  {n.comment && (
                    <p className="notif-comment">
                      "{n.comment}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
