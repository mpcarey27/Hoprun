import React, { useState } from 'react';
import type { UserProfile } from '../types/acr';

import { ROSTER_USERS } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onSwitchUser: (user: UserProfile) => void;
}

const STORAGE_KEY_CLIENT_ID = 'acr_google_oauth_client_id';

export const GoogleAuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onSwitchUser,
}) => {
  const [googleClientId, setGoogleClientId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || '';
  });
  const [showConfig, setShowConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const mockUsers: UserProfile[] = ROSTER_USERS;

  const handleSaveClientId = () => {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, googleClientId.trim());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  /**
   * Directly initiates real Google OAuth flow
   */
  const handleRealGoogleLogin = () => {
    const trimmedId = googleClientId.trim();

    if (trimmedId) {
      // Standard Google OAuth 2.0 Implicit / Authorization Code flow
      const redirectUri = window.location.origin;
      const scope = 'openid email profile';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        trimmedId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token%20id_token&scope=${encodeURIComponent(
        scope
      )}&nonce=${Date.now()}`;

      window.location.href = authUrl;
    } else {
      // If client ID is not yet saved, directly open Google's canonical account sign-in page
      const googleLoginUrl = 'https://accounts.google.com/ServiceLogin';
      const newWin = window.open(googleLoginUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        window.location.href = googleLoginUrl;
      }
      setShowConfig(true);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <span className="text-xxs uppercase tracking-wider text-muted font-mono">Authentication</span>
            <h2 className="modal-title">Sign in with Google</h2>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Current Profile Display */}
          <div className="current-user-card">
            <div className="user-avatar-circle">
              {currentUser.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{currentUser.name}</p>
              <p className="text-xs text-secondary font-mono">{currentUser.email}</p>
              <span className="badge-xs badge-safe mt-1 inline-block uppercase font-mono">
                {currentUser.role} Account
              </span>
            </div>
          </div>

          <div className="google-auth-options">
            <span className="text-xxs text-muted uppercase font-mono block mb-2">Google Account Access</span>

            {/* Real Google Sign In Button */}
            <button
              type="button"
              className="btn-google-signin"
              onClick={handleRealGoogleLogin}
            >
              <svg className="google-g-icon" viewBox="0 0 24 24" width="18" height="18">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google Account</span>
            </button>

            {/* Sleek Dark Mode Client ID Config Toggle */}
            <div className="oauth-config-box mt-3">
              <button
                type="button"
                className="oauth-toggle-header"
                onClick={() => setShowConfig(!showConfig)}
              >
                <span className="text-xs text-secondary font-mono">
                  {showConfig ? '▾ Google Cloud OAuth Client ID' : '▸ Google Cloud OAuth Client ID (Configure)'}
                </span>
                <span className="text-xxs text-muted font-mono">
                  {googleClientId ? 'Configured' : 'Not set'}
                </span>
              </button>

              {showConfig && (
                <div className="oauth-config-body">
                  <p className="text-xxs text-secondary mb-2">
                    Paste your Google Cloud OAuth 2.0 Web Client ID to connect your deployed Cloudflare website directly to Google accounts:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-field text-xs font-mono flex-1"
                      placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-save-client-id"
                      onClick={handleSaveClientId}
                    >
                      {saveSuccess ? '✓ Saved' : 'Save ID'}
                    </button>
                  </div>
                  <p className="text-xxs text-muted mt-2">
                    Remember to authorize your Cloudflare domain (e.g. <code>https://your-app.pages.dev</code>) under "Authorized JavaScript origins" in Google Cloud Console.
                  </p>
                </div>
              )}
            </div>

            {/* Offline Test Profiles */}
            <div className="demo-accounts-list mt-4">
              <span className="text-xxs text-muted uppercase font-mono block mb-1">
                Local Testing Profiles (Pair Testing)
              </span>
              {mockUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`btn-account-switch ${currentUser.id === u.id ? 'active' : ''}`}
                  onClick={() => {
                    onSwitchUser(u);
                    onClose();
                  }}
                >
                  <span className="text-xs font-semibold text-white">{u.name}</span>
                  <span className="text-xxs text-secondary font-mono">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
