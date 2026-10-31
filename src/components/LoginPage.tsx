import React, { useState } from 'react';
import type { UserProfile, RegisteredUser } from '../types/acr';
import {
  COACH_EMAIL,
  COACH_PROFILE,
  COACH_ATHLETE_PROFILE,
  isCoachEmail,
  determineUserRole,
  loadStoredAuthUsers,
  saveStoredAuthUser,
  addAthleteToRoster,
  saveStoredUser,
  loadLastRememberedUser,
} from '../utils/storage';

interface Props {
  onLoginSuccess: (user: UserProfile) => void;
  inviteCoachEmail?: string | null;
}

export const LoginPage: React.FC<Props> = ({
  onLoginSuccess,
  inviteCoachEmail,
}) => {
  const [lastRememberedUser] = useState<UserProfile | null>(() => loadLastRememberedUser());
  const [mode, setMode] = useState<'signin' | 'signup'>(inviteCoachEmail ? 'signup' : 'signin');
  const [email, setEmail] = useState(() => lastRememberedUser?.email || '');
  const [name, setName] = useState(() => lastRememberedUser?.name || '');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

  // Google Modal specific inputs
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');
  const [googlePassword, setGooglePassword] = useState('');

  const isInvited = Boolean(inviteCoachEmail);

  // Sign In / Sign Up handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    // "Make no restrictions for the password"
    // Password is accepted as is without any complexity restrictions

    const role = determineUserRole(cleanEmail);
    const authUsers = loadStoredAuthUsers();
    const existing = authUsers.find((u) => u.email.toLowerCase() === cleanEmail.toLowerCase());

    if (mode === 'signin') {
      if (existing) {
        // Authenticated successfully
        const loggedInUser: UserProfile = {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          role: determineUserRole(existing.email),
          avatarUrl: existing.avatarUrl || '',
        };
        saveStoredUser(loggedInUser, keepSignedIn);
        onLoginSuccess(loggedInUser);
      } else {
        // First-time sign in with this email: create their profile on the fly
        const autoName = name.trim() || (isCoachEmail(cleanEmail) ? 'Michael Carey' : cleanEmail.split('@')[0]);
        const newUser: RegisteredUser = {
          id: isCoachEmail(cleanEmail) ? COACH_PROFILE.id : `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          email: cleanEmail,
          name: autoName,
          role,
          password,
          invitedBy: inviteCoachEmail || undefined,
          createdAt: new Date().toISOString(),
        };
        saveStoredAuthUser(newUser);
        if (role === 'runner') {
          addAthleteToRoster(newUser);
        }
        saveStoredUser(newUser, keepSignedIn);
        onLoginSuccess(newUser);
      }
    } else {
      // Sign Up mode
      const displayName = name.trim() || (isCoachEmail(cleanEmail) ? 'Michael Carey' : cleanEmail.split('@')[0]);
      const newUser: RegisteredUser = {
        id: isCoachEmail(cleanEmail) ? COACH_PROFILE.id : `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        email: cleanEmail,
        name: displayName,
        role,
        password,
        invitedBy: inviteCoachEmail || undefined,
        createdAt: new Date().toISOString(),
      };

      saveStoredAuthUser(newUser);
      if (role === 'runner') {
        addAthleteToRoster(newUser);
      }
      saveStoredUser(newUser, keepSignedIn);
      onLoginSuccess(newUser);
    }
  };

  // Google sign in simulation handler
  const handleGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = googleEmail.trim();
    if (!cleanEmail) return;

    const role = determineUserRole(cleanEmail);
    const displayName = googleName.trim() || (isCoachEmail(cleanEmail) ? 'Michael Carey' : cleanEmail.split('@')[0]);

    const newUser: RegisteredUser = {
      id: isCoachEmail(cleanEmail) ? COACH_PROFILE.id : `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: cleanEmail,
      name: displayName,
      role,
      password: googlePassword, // Password stored with no restrictions
      googleId: `google_${Date.now()}`,
      invitedBy: inviteCoachEmail || undefined,
      createdAt: new Date().toISOString(),
    };

    saveStoredAuthUser(newUser);
    if (role === 'runner') {
      addAthleteToRoster(newUser);
    }
    saveStoredUser(newUser, keepSignedIn);
    setIsGoogleModalOpen(false);
    onLoginSuccess(newUser);
  };

  const handleQuickLogin = (user: UserProfile) => {
    saveStoredUser(user, keepSignedIn);
    onLoginSuccess(user);
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card-container animate-in">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="login-brand-logo" title="Hop Run">
            <svg
              className="shoe-icon-svg"
              viewBox="0 0 54 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '42px', height: '28px' }}
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
            </svg>
            <span className="brand-logo-text" style={{ fontSize: '0.85rem' }}>HOP</span>
          </div>

          <div>
            <h1 className="login-app-title">Hop Run</h1>
            <p className="login-app-subtitle">Workload &amp; Injury Prevention</p>
          </div>
        </div>

        {/* Coach Invitation Banner (If Accessed via Invite Link) */}
        {isInvited && (
          <div className="login-invite-banner animate-in">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">✉️</span>
              <strong className="text-xs font-bold text-accent">Team Invitation</strong>
            </div>
            <p className="text-xs text-primary leading-normal">
              Coach Michael Carey (<span className="font-mono text-accent">{COACH_EMAIL}</span>) has invited you to join the team! Sign in or create your profile below to join the roster.
            </p>
          </div>
        )}

        {/* 1-Click Returning User Welcome Back Button */}
        {lastRememberedUser && (
          <div className="mb-3">
            <button
              type="button"
              className="btn-action-primary w-full py-2.5 px-3 text-xs font-bold rounded-lg flex items-center justify-between shadow-sm"
              onClick={() => handleQuickLogin(lastRememberedUser)}
            >
              <span>Welcome back — Continue as {lastRememberedUser.name}</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* Google Sign In Primary CTA */}
        <div className="mb-4">
          <button
            type="button"
            className="btn-google-login-hero"
            onClick={() => {
              setGoogleEmail(isInvited ? '' : 'careyer1234@gmail.com');
              setGoogleName(isInvited ? '' : 'Michael Carey');
              setIsGoogleModalOpen(true);
            }}
          >
            <svg className="google-g-icon" viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="font-semibold text-sm">
              {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
            </span>
          </button>
        </div>

        <div className="login-divider-row">
          <span className="login-divider-line" />
          <span className="login-divider-text font-mono text-xxs">OR WITH EMAIL</span>
          <span className="login-divider-line" />
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="login-tab-pills mb-4">
          <button
            type="button"
            className={`login-tab-pill ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setErrorMessage('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-tab-pill ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setErrorMessage('');
            }}
          >
            Create Profile
          </button>
        </div>

        {errorMessage && (
          <div className="login-error-alert mb-3">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                Full Name
              </label>
              <input
                type="text"
                className="input-field text-xs w-full"
                placeholder="e.g. Alex River"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
              Email Address
            </label>
            <input
              type="email"
              className="input-field text-xs w-full"
              placeholder="e.g. runner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {isCoachEmail(email) && (
              <span className="text-xxs font-mono text-accent font-semibold block mt-1">
                ★ Head Coach Profile Detected ({COACH_EMAIL})
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                Password
              </label>
              <span className="text-xxs font-mono text-muted">
                No restrictions
              </span>
            </div>
            <input
              type="password"
              className="input-field text-xs w-full"
              placeholder="Enter password (no restrictions)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="text-xxs text-muted block mt-1">
              Any password is accepted with no length or symbol restrictions.
            </span>
          </div>

          <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-subtle border border-subtle cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 accent-emerald-500"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
            />
            <span className="flex flex-col">
              <span className="text-xs font-semibold text-primary">
                Keep me signed in on this device
              </span>
              <span className="text-xxs text-muted">
                Stays logged in and auto-syncs Strava every time you open Hop Run
              </span>
            </span>
          </label>

          <button
            type="submit"
            className="btn-action-primary w-full py-2.5 text-xs font-bold rounded-lg shadow-sm mt-2"
          >
            {mode === 'signup' ? 'Create Account & Enter' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Switcher Section */}
        <div className="login-demo-section mt-5 pt-4 border-t border-subtle">
          <span className="text-xxs uppercase tracking-wider text-muted font-mono block mb-2 text-center">
            One-Click Quick Sign In (For Testing):
          </span>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="btn-quick-login-chip flex items-center justify-between py-1.5 px-3 rounded text-xs"
              onClick={() => handleQuickLogin(COACH_PROFILE)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">👑</span>
                <span className="font-bold text-primary">Michael Carey</span>
                <span className="text-muted text-xxs font-mono">({COACH_EMAIL})</span>
              </div>
              <span className="badge-safe text-xxs font-mono uppercase font-bold">Coach</span>
            </button>

            <button
              type="button"
              className="btn-quick-login-chip flex items-center justify-between py-1.5 px-3 rounded text-xs"
              onClick={() => handleQuickLogin(COACH_ATHLETE_PROFILE)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">🏃</span>
                <span className="font-bold text-primary">Michael Carey</span>
                <span className="text-muted text-xxs font-mono">(Athlete Account)</span>
              </div>
              <span className="badge-muted text-xxs font-mono uppercase font-bold">Athlete</span>
            </button>

            <button
              type="button"
              className="btn-quick-login-chip flex items-center justify-between py-1.5 px-3 rounded text-xs"
              onClick={() =>
                handleQuickLogin({
                  id: 'user_rob',
                  email: 'rob.athlete@example.com',
                  name: 'Rob',
                  role: 'runner',
                  avatarUrl: '',
                })
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">🏃</span>
                <span className="font-bold text-primary">Rob</span>
                <span className="text-muted text-xxs font-mono">(rob.athlete@example.com)</span>
              </div>
              <span className="badge-muted text-xxs font-mono uppercase font-bold">Athlete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Account Creation / Sign-In Modal */}
      {isGoogleModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsGoogleModalOpen(false)}>
          <div
            className="modal-card modal-card-sm animate-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <svg className="google-g-icon" viewBox="0 0 24 24" width="20" height="20">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <h3 className="modal-title text-sm">Sign in with Google</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsGoogleModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGoogleSubmit} className="modal-body space-y-3">
              <p className="text-xs text-secondary leading-normal">
                Enter your Google account details and set your password to authenticate with Hop Run:
              </p>

              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Google Email
                </label>
                <input
                  type="email"
                  className="input-field text-xs w-full"
                  placeholder="your.email@gmail.com"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-field text-xs w-full"
                  placeholder="e.g. Michael Carey"
                  value={googleName}
                  onChange={(e) => setGoogleName(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Password
                  </label>
                  <span className="text-xxs font-mono text-muted">
                    No restrictions
                  </span>
                </div>
                <input
                  type="password"
                  className="input-field text-xs w-full"
                  placeholder="Create your password"
                  value={googlePassword}
                  onChange={(e) => setGooglePassword(e.target.value)}
                />
                <span className="text-xxs text-muted block mt-1">
                  Set any password you prefer. No length or symbol requirements.
                </span>
              </div>

              <div className="p-2 rounded bg-surface-subtle border border-subtle text-xxs font-mono">
                {isCoachEmail(googleEmail) ? (
                  <span className="text-success font-bold">
                    ✓ Recognized Head Coach Account ({COACH_EMAIL})
                  </span>
                ) : (
                  <span className="text-muted">
                    Role: Athlete (All accounts other than {COACH_EMAIL} are athletes)
                  </span>
                )}
              </div>

              <label className="flex items-start gap-2 p-2 rounded bg-surface-subtle border border-subtle cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-emerald-500"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                <span className="flex flex-col">
                  <span className="text-xs font-semibold text-primary">
                    Keep me signed in on this device
                  </span>
                  <span className="text-xxs text-muted">
                    Stays logged in and auto-syncs Strava every time you open Hop Run
                  </span>
                </span>
              </label>

              <div className="modal-footer flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setIsGoogleModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action-primary py-2 px-4 text-xs font-bold rounded-lg"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
