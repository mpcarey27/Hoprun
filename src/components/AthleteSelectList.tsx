import React from 'react';
import type { UserProfile } from '../types/acr';

interface Props {
  roster: UserProfile[];
  selectedId: string;
  currentUserId: string;
  onSelect: (user: UserProfile) => void;
  /** Show the athlete's linked Google Sheet status as the subtitle (Sheet / Plan builder). */
  showSheetStatus?: boolean;
  /** Opens the coach's invite-link modal. Shown as a dashed "Invite athlete" card. */
  onInviteAthletes?: () => void;
}

/**
 * Clean athlete picker for the coach: name + one-line subtitle on the left,
 * a check indicator on the right. The coach (you) is always listed first so
 * plans and runs can be assigned to yourself.
 */
export const AthleteSelectList: React.FC<Props> = ({
  roster,
  selectedId,
  currentUserId,
  onSelect,
  showSheetStatus = false,
  onInviteAthletes,
}) => {
  const sorted = [...roster].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="athlete-picker" role="group" aria-label="Select athlete">
      {sorted.map((user) => {
        const isSelected = selectedId === user.id;
        const isSelf = user.id === currentUserId;
        const subtitle = showSheetStatus
          ? user.googleSheetUrl
            ? `${user.googleSheetTab || 'Sheet'} sheet linked`
            : 'No sheet linked'
          : isSelf
            ? 'Coach · assign to yourself'
            : user.email || 'Athlete';
        return (
          <button
            key={user.id}
            type="button"
            className={`athlete-picker-card ${isSelected ? 'is-selected' : ''}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(user)}
          >
            <span className="athlete-picker-text">
              <span className="athlete-picker-name">
                {user.name}
                {isSelf && <span className="athlete-picker-you">You</span>}
              </span>
              <span className="athlete-picker-sub">{subtitle}</span>
            </span>
            <span className="athlete-picker-check" aria-hidden="true">
              {isSelected ? '✓' : ''}
            </span>
          </button>
        );
      })}

      {onInviteAthletes && (
        <button type="button" className="athlete-picker-card athlete-picker-invite" onClick={onInviteAthletes}>
          <span className="athlete-picker-text">
            <span className="athlete-picker-name">+ Invite athlete</span>
            <span className="athlete-picker-sub">
              {sorted.length <= 1
                ? 'Athletes appear here after joining via your link'
                : 'Send your invite link'}
            </span>
          </span>
        </button>
      )}
    </div>
  );
};
