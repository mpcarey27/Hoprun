import React, { useState } from 'react';
import type { UserProfile, AppSettings, WorkoutRun } from '../types/acr';
import {
  fetchStravaActivities,
  normalizeStravaActivity,
  buildStravaAuthUrl,
} from '../utils/stravaSync';
import { loadStoredSettings, saveStoredSettings } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onImportRuns?: (runs: WorkoutRun[]) => void;
}

export const StravaConnectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  onUpdateSettings,
  onImportRuns,
}) => {
  const isConnected = Boolean(settings.stravaConnected && (settings.stravaAccessToken || settings.stravaClientId));
  
  // Form state
  const [clientId, setClientId] = useState(settings.stravaClientId || '');
  const [clientSecret, setClientSecret] = useState(settings.stravaClientSecret || '');
  const [accessToken, setAccessToken] = useState(settings.stravaAccessToken || '');
  const [activeMode, setActiveMode] = useState<'token' | 'oauth'>('oauth');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // 1. Direct Access Token Connect (Fastest, zero OAuth callback redirect needed)
  const handleConnectWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanToken = accessToken.trim();
    if (!cleanToken) {
      setErrorMessage('Please enter your Strava Personal Access Token.');
      return;
    }

    setIsSyncing(true);
    try {
      const activities = await fetchStravaActivities(cleanToken, 1, 30);
      const defaultShoe = (settings.shoes || []).find((s) => !s.isRetired && s.isDefault);
      const unit = settings.distanceUnit || 'mi';

      const normalizedWorkouts = activities.map((act) =>
        normalizeStravaActivity(
          act,
          unit,
          currentUser.id,
          currentUser.name,
          defaultShoe?.id,
          defaultShoe?.name
        )
      );

      if (onImportRuns && normalizedWorkouts.length > 0) {
        onImportRuns(normalizedWorkouts);
      }

      onUpdateSettings({
        stravaConnected: true,
        stravaAccessToken: cleanToken,
        stravaAthleteName: currentUser.name || 'Strava Athlete',
        stravaAutoSync: true,
        stravaLastSyncTime: new Date().toISOString(),
      });

      setToastMessage(`✓ Connected! Synced ${normalizedWorkouts.length} Garmin/Strava runs.`);
      setTimeout(() => {
        setToastMessage('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate with Strava. Check your token.');
    } finally {
      setIsSyncing(false);
    }
  };

  // 2. Full OAuth Connect (Redirects to Strava authorization page with activity:read_all scope)
  const handleOAuthConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanId = clientId.trim();
    const cleanSecret = clientSecret.trim();

    if (!cleanId) {
      setErrorMessage('Please enter your Strava Client ID.');
      return;
    }
    if (!cleanSecret) {
      setErrorMessage('Please enter your Strava Client Secret (from strava.com/settings/api).');
      return;
    }

    // Persist synchronously to localStorage so App.tsx can read them immediately on callback
    const currentStored = loadStoredSettings();
    saveStoredSettings({
      ...currentStored,
      stravaClientId: cleanId,
      stravaClientSecret: cleanSecret,
    });
    onUpdateSettings({
      stravaClientId: cleanId,
      stravaClientSecret: cleanSecret,
    });

    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/';
    const authUrl = buildStravaAuthUrl(cleanId, redirectUri);
    window.location.href = authUrl;
  };

  // 3. Sync recent activities now
  const handleSyncLatest = async () => {
    if (!settings.stravaAccessToken) {
      setErrorMessage('No active Strava token found. Please re-enter your access token.');
      return;
    }

    setIsSyncing(true);
    setErrorMessage('');
    try {
      const activities = await fetchStravaActivities(settings.stravaAccessToken, 1, 30);
      const defaultShoe = (settings.shoes || []).find((s) => !s.isRetired && s.isDefault);
      const unit = settings.distanceUnit || 'mi';

      const normalizedWorkouts = activities.map((act) =>
        normalizeStravaActivity(
          act,
          unit,
          currentUser.id,
          currentUser.name,
          defaultShoe?.id,
          defaultShoe?.name
        )
      );

      if (onImportRuns && normalizedWorkouts.length > 0) {
        onImportRuns(normalizedWorkouts);
      }

      onUpdateSettings({
        stravaLastSyncTime: new Date().toISOString(),
      });

      setToastMessage(`✓ Synced ${normalizedWorkouts.length} activities from Strava/Garmin!`);
      setTimeout(() => setToastMessage(''), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to pull runs from Strava.');
    } finally {
      setIsSyncing(false);
    }
  };

  // 4. Disconnect
  const handleDisconnect = () => {
    onUpdateSettings({
      stravaConnected: false,
      stravaAccessToken: undefined,
      stravaRefreshToken: undefined,
      stravaAthleteName: undefined,
      stravaAutoSync: false,
    });
    setToastMessage('Strava disconnected.');
    setTimeout(() => setToastMessage(''), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-md animate-in strava-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="strava-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2.5">
            <div className="strava-badge-icon-box">
              <svg
                viewBox="0 0 24 24"
                fill="#FC4C02"
                style={{ width: '22px', height: '22px' }}
                aria-hidden="true"
              >
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.01 13.828h4.172" />
              </svg>
            </div>
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Garmin Cloud Sync Relay
              </span>
              <h2 id="strava-modal-title" className="modal-title flex items-center gap-2">
                <span>Sync with Strava</span>
                {isConnected && (
                  <span className="badge-safe font-mono text-xxs font-bold">
                    CONNECTED
                  </span>
                )}
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
          {toastMessage && (
            <div className="inweek-ribbon inweek-ribbon-optimal animate-in">
              <span className="font-mono text-xs font-bold text-success">
                {toastMessage}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="inweek-ribbon inweek-ribbon-critical animate-in">
              <span className="font-mono text-xs font-bold text-danger">
                {errorMessage}
              </span>
            </div>
          )}

          {isConnected ? (
            /* Connected View */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-elevated border border-subtle">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-sm">●</span>
                    <strong className="text-sm text-primary">Connected to Strava</strong>
                  </div>
                  <span className="badge-strava font-mono text-xxs font-bold">ACTIVE RELAY</span>
                </div>
                <p className="text-xs text-secondary leading-normal mb-2">
                  When you save a run on your Garmin watch, it syncs to Strava in seconds and flows right into Hop Run.
                </p>
                <div className="text-xs font-mono text-muted space-y-1">
                  <div>
                    <span>Athlete: </span>
                    <span className="text-primary font-bold">
                      {settings.stravaAthleteName || currentUser.name}
                    </span>
                  </div>
                  {settings.stravaLastSyncTime && (
                    <div>
                      <span>Last Synced: </span>
                      <span className="text-accent">
                        {new Date(settings.stravaLastSyncTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-strava-primary flex-1 font-mono text-xs font-bold"
                  onClick={handleSyncLatest}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Pulling Latest Runs...' : 'Sync Latest Runs Now 🔄'}
                </button>
                <button
                  type="button"
                  className="btn-settings-pill text-xs"
                  style={{ color: 'var(--color-critical)' }}
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Setup Guide & Connect Form */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-elevated border border-subtle">
                <div className="flex items-center gap-2 mb-1.5">
                  <strong className="text-xs font-bold text-primary">How This Syncs Your Garmin Watch</strong>
                </div>
                <p className="text-xs text-secondary leading-relaxed mb-2.5">
                  Garmin pushes your runs to Strava automatically in 3 seconds. By connecting Strava, your real GPS distance, moving pace, heart rate, and elevation are pulled directly into Hop Run.
                </p>
                <div className="flex items-center gap-2 text-xxs font-mono text-accent">
                  <span>Watch</span>
                  <span>➔</span>
                  <span>Garmin Connect</span>
                  <span>➔</span>
                  <span>Strava</span>
                  <span>➔</span>
                  <span className="text-primary font-bold">Hop Run (ACWR)</span>
                </div>
              </div>

              {/* Mode Switcher: OAuth vs Token */}
              <div className="login-tab-pills">
                <button
                  type="button"
                  className={`login-tab-pill ${activeMode === 'oauth' ? 'active' : ''}`}
                  onClick={() => setActiveMode('oauth')}
                >
                  1. 1-Click Strava Connect (Recommended)
                </button>
                <button
                  type="button"
                  className={`login-tab-pill ${activeMode === 'token' ? 'active' : ''}`}
                  onClick={() => setActiveMode('token')}
                >
                  2. Manual Access Token
                </button>
              </div>

              {activeMode === 'oauth' ? (
                /* OAuth Mode: Client ID + Secret */
                <form onSubmit={handleOAuthConnect} className="space-y-3">
                  <div className="p-3 rounded-lg bg-surface border border-subtle text-xs space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <strong className="text-primary text-xs">Easy 2-Minute Setup:</strong>
                      <span className="badge-strava font-mono text-xxs font-bold">ACTIVITY ACCESS</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-secondary text-xxs leading-relaxed">
                      <li>
                        Open your free Strava API page:{' '}
                        <a
                          href="https://www.strava.com/settings/api"
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline font-bold"
                        >
                          strava.com/settings/api ↗
                        </a>
                      </li>
                      <li>
                        If creating your app, enter:
                        <ul className="list-disc list-inside pl-3 pt-1 space-y-0.5 text-muted font-mono">
                          <li>Application Name: <strong className="text-primary">Hop Run</strong></li>
                          <li>Website: <strong className="text-primary">{typeof window !== 'undefined' ? window.location.origin : 'https://hoprun.app'}</strong></li>
                          <li>
                            Authorization Callback Domain:{' '}
                            <strong className="text-emerald-400 bg-surface px-1 py-0.5 rounded border border-emerald-500/30">
                              {typeof window !== 'undefined' ? window.location.hostname : 'hoprun.app'}
                            </strong>
                          </li>
                        </ul>
                        <span className="text-amber-400 block pt-1 text-xxs">
                          ⚠️ Important: In Strava settings, enter just the domain{' '}
                          <strong>{typeof window !== 'undefined' ? window.location.hostname : 'hoprun.app'}</strong>{' '}
                          (no http:// or port).
                        </span>
                      </li>
                      <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below.</li>
                    </ol>
                  </div>

                  <div>
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      className="input font-mono text-xs w-full"
                      placeholder="e.g. 123456"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      className="input font-mono text-xs w-full"
                      placeholder="e.g. 8a7b6c5d4e..."
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-strava-primary w-full py-2.5 font-mono text-xs font-bold text-center mt-2 flex items-center justify-center gap-2"
                  >
                    <span>Connect &amp; Authorize on Strava →</span>
                  </button>
                  <p className="text-center text-xxs text-muted font-mono">
                    Directs you to Strava to approve activity permissions, then syncs automatically.
                  </p>
                </form>
              ) : (
                /* Fast Mode: Personal Access Token */
                <form onSubmit={handleConnectWithToken} className="space-y-3">
                  <div className="p-3 rounded-lg bg-surface border border-subtle text-xs space-y-2">
                    <strong className="text-primary text-xs block">Manual Token Connect:</strong>
                    <p className="text-secondary text-xxs leading-relaxed">
                      Enter a Personal Access Token that has been granted the{' '}
                      <code className="text-accent font-mono">activity:read_all</code> scope.
                    </p>
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xxs leading-normal">
                      ⚠️ Note: The default token on <em>strava.com/settings/api</em> only grants public profile read and will return 0 activities. If you have not created custom scopes, use the <strong>1-Click Strava Connect</strong> tab above instead.
                    </div>
                  </div>

                  <div>
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                      Strava Access Token
                    </label>
                    <input
                      type="text"
                      className="input font-mono text-xs w-full"
                      placeholder="e.g. 7f3a8b9c2d1e0f..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-strava-primary w-full py-2.5 font-mono text-xs font-bold text-center mt-2"
                    disabled={isSyncing}
                  >
                    {isSyncing ? 'Connecting & Pulling Runs...' : 'Connect Strava Token →'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
