import React, { useState } from 'react';
import { COACH_EMAIL } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coachEmail?: string;
  coachName?: string;
}

export const InviteAthletesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  coachEmail = COACH_EMAIL,
  coachName = 'Michael Carey',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Build the invitation link with coach parameter
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const inviteUrl = `${origin}/?invite=${encodeURIComponent(coachEmail)}`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const input = document.getElementById('invite-url-input') as HTMLInputElement;
        if (input) {
          input.select();
          document.execCommand('copy');
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy invite link:', e);
    }
  };

  const emailSubject = encodeURIComponent(`Invitation to join Hop Run with Coach ${coachName}`);
  const emailBody = encodeURIComponent(
    `Hi,\n\nCoach ${coachName} has invited you to join the Hop Run training roster for injury prevention and workload tracking.\n\nClick the link below to sign in with your Google account and set your password to activate your athlete profile:\n\n${inviteUrl}\n\nSee you on the roads!`
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-md animate-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
      >
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span className="quick-add-plus-badge">✉️</span>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Coach Roster Expansion
              </span>
              <h2 id="invite-modal-title" className="modal-title">
                Invite Athletes to Hop Run
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

        <div className="modal-body space-y-4">
          <div className="p-3 rounded bg-surface border border-subtle">
            <p className="text-xs text-secondary leading-relaxed mb-2">
              Send this invitation link to athletes you coach. When they open the link, they will sign in with their Google account, set their password (with no restrictions), and will automatically join your athlete roster.
            </p>
            <div className="flex items-center gap-2 text-xxs font-mono text-muted">
              <span>Coach:</span>
              <span className="text-primary font-bold">{coachName}</span>
              <span>•</span>
              <span className="text-accent">{coachEmail}</span>
            </div>
          </div>

          <div>
            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
              Your Shareable Invite Link
            </label>
            <div className="flex items-center gap-2">
              <input
                id="invite-url-input"
                type="text"
                readOnly
                value={inviteUrl}
                className="input-field text-xs font-mono flex-1 bg-surface-subtle"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                className={`btn-action-primary py-2 px-3 text-xs font-bold rounded-lg ${
                  copied ? 'btn-success' : ''
                }`}
                onClick={handleCopyLink}
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <a
              href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
              className="btn btn-secondary text-xs flex items-center justify-center gap-2 py-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>✉️</span>
              <span>Send via Email</span>
            </a>

            <button
              type="button"
              className="btn btn-secondary text-xs flex items-center justify-center gap-2 py-2"
              onClick={handleCopyLink}
            >
              <span>🔗</span>
              <span>{copied ? '✓ Link in Clipboard' : 'Copy for Message / SMS'}</span>
            </button>
          </div>

          <div className="p-2.5 rounded bg-surface-subtle border border-subtle">
            <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
              Invited Athlete Experience Preview:
            </span>
            <p className="text-xs text-muted font-mono">
              1. Runner opens link → Welcomed by &quot;Coach {coachName} has invited you!&quot;<br />
              2. Signs in with Google &amp; creates password (no restrictions).<br />
              3. Their profile is instantly created with Runner permissions and added to your roster.
            </p>
          </div>
        </div>

        <div className="modal-footer flex items-center justify-end">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
