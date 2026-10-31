import React, { useState, useEffect } from 'react';
import type { UserProfile, AppSettings, WorkoutRun } from '../types/acr';
import {
  fetchAllStravaActivitiesSince,
  parseDateToEpochSeconds,
  normalizeStravaActivity,
  buildStravaAuthUrl,
  exchangeStravaCode,
  encodeStravaOAuthState,
  decodeStravaOAuthState,
  extractCodeFromUrlOrInput,
} from '../utils/stravaSync';
import { loadStoredSettings, saveStoredSettings } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onImportRuns?: (runs: WorkoutRun[]) => void;
  oauthStatus?: { type: 'success' | 'error'; message: string } | null;
}

const getDaysAgoDateString = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const ytdDateString = `${new Date().getFullYear()}-01-01`;

export const StravaConnectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  onUpdateSettings,
  onImportRuns,
  oauthStatus,
}) => {
  const isConnected = Boolean(
    settings.stravaConnected && (settings.stravaAccessToken || settings.stravaClientId)
  );

  // Form state
  const [clientId, setClientId] = useState(settings.stravaClientId || '');
  const [clientSecret, setClientSecret] = useState(settings.stravaClientSecret || '');
  const [accessToken, setAccessToken] = useState(settings.stravaAccessToken || '');
  const [activeMode, setActiveMode] = useState<'token' | 'oauth'>('oauth');
  const [callbackDomainMode, setCallbackDomainMode] = useState<
    'current' | 'hoprun' | 'localhost'
  >('current');
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [callbackInput, setCallbackInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Timeline / Date Range Sync state (defaults to Jan 1, 2026 / YTD as requested)
  const [customStartDate, setCustomStartDate] = useState<string>(
    () => settings.stravaSyncStartDate || ytdDateString
  );
  const [syncProgressMessage, setSyncProgressMessage] = useState<string>('');

  useEffect(() => {
    if (settings.stravaClientId && !clientId) setClientId(settings.stravaClientId);
    if (settings.stravaClientSecret && !clientSecret) setClientSecret(settings.stravaClientSecret);
    if (settings.stravaAccessToken && !accessToken) setAccessToken(settings.stravaAccessToken);
  }, [settings.stravaClientId, settings.stravaClientSecret, settings.stravaAccessToken]);

  if (!isOpen) return null;

  const currentHostname =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'hoprun.app';
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://hoprun.app';

  const selectedRedirectUri =
    callbackDomainMode === 'hoprun'
      ? 'https://hoprun.app/'
      : callbackDomainMode === 'localhost'
        ? 'http://localhost:5173/'
        : `${currentOrigin}/`;

  const selectedCallbackHostname =
    callbackDomainMode === 'hoprun'
      ? 'hoprun.app'
      : callbackDomainMode === 'localhost'
        ? 'localhost'
        : currentHostname;

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(selectedCallbackHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

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
      const effectiveStartDate = customStartDate || ytdDateString;
      const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);
      const activities = await fetchAllStravaActivitiesSince(
        cleanToken,
        afterEpoch,
        undefined,
        (count, page) => {
          setSyncProgressMessage(
            `Importing runs from ${effectiveStartDate}... (Page ${page}, ${count} runs)`
          );
        }
      );
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
        stravaSyncStartDate: effectiveStartDate,
      });

      setToastMessage(
        `✓ Connected! Synced ${normalizedWorkouts.length} runs starting from ${effectiveStartDate} forward.`
      );
      setSyncProgressMessage('');
      setTimeout(() => {
        setToastMessage('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate with Strava. Check your token.');
      setSyncProgressMessage('');
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
    const effectiveStartDate = customStartDate || ytdDateString;
    const currentStored = loadStoredSettings();
    saveStoredSettings({
      ...currentStored,
      stravaClientId: cleanId,
      stravaClientSecret: cleanSecret,
      stravaSyncStartDate: effectiveStartDate,
    });
    onUpdateSettings({
      stravaClientId: cleanId,
      stravaClientSecret: cleanSecret,
      stravaSyncStartDate: effectiveStartDate,
    });

    const state = encodeStravaOAuthState({
      clientId: cleanId,
      clientSecret: cleanSecret,
      origin: currentOrigin,
    });
    const authUrl = buildStravaAuthUrl(cleanId, selectedRedirectUri, state);
    window.location.href = authUrl;
  };

  // 2b. Manual Callback URL or Authorization Code Completion (Fallback for localhost / cross-origin redirects)
  const handleCompleteManualCallback = async () => {
    setErrorMessage('');
    const { code: extractedCode, state: extractedState } = extractCodeFromUrlOrInput(callbackInput);
    if (!extractedCode) {
      setErrorMessage(
        'Please paste the callback URL (containing ?code=...) or authorization code from your browser address bar.'
      );
      return;
    }

    const decoded = decodeStravaOAuthState(extractedState);
    const effectiveId =
      clientId.trim() || decoded?.clientId || settings.stravaClientId || '';
    const effectiveSecret =
      clientSecret.trim() || decoded?.clientSecret || settings.stravaClientSecret || '';

    if (!effectiveId || !effectiveSecret) {
      setErrorMessage(
        'Please enter your Strava Client ID and Client Secret above so Hop Run can exchange the authorization code.'
      );
      return;
    }

    setIsSyncing(true);
    try {
      const tokenData = await exchangeStravaCode(effectiveId, effectiveSecret, extractedCode);
      const athleteName = tokenData.athlete
        ? `${tokenData.athlete.firstname || ''} ${tokenData.athlete.lastname || ''}`.trim()
        : currentUser.name || 'Strava Athlete';

      const effectiveStartDate = customStartDate || ytdDateString;
      const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);
      const activities = await fetchAllStravaActivitiesSince(
        tokenData.access_token,
        afterEpoch,
        undefined,
        (count, page) => {
          setSyncProgressMessage(
            `Pulling activities from ${effectiveStartDate}... (Page ${page}, ${count} runs found)`
          );
        }
      );
      const defaultShoe = (settings.shoes || []).find((s) => !s.isRetired && s.isDefault);
      const unit = settings.distanceUnit || 'mi';

      const normalizedWorkouts = activities.map((act) =>
        normalizeStravaActivity(
          act,
          unit,
          currentUser.id,
          currentUser.name || athleteName,
          defaultShoe?.id,
          defaultShoe?.name
        )
      );

      if (onImportRuns && normalizedWorkouts.length > 0) {
        onImportRuns(normalizedWorkouts);
      }

      onUpdateSettings({
        stravaClientId: effectiveId,
        stravaClientSecret: effectiveSecret,
        stravaConnected: true,
        stravaAccessToken: tokenData.access_token,
        stravaRefreshToken: tokenData.refresh_token,
        stravaExpiresAt: tokenData.expires_at,
        stravaAthleteName: athleteName,
        stravaAutoSync: true,
        stravaLastSyncTime: new Date().toISOString(),
        stravaSyncStartDate: effectiveStartDate,
      });

      setCallbackInput('');
      setSyncProgressMessage('');
      setToastMessage(
        `✓ Strava Connected! Synced ${normalizedWorkouts.length} runs starting from ${effectiveStartDate} forward.`
      );
    } catch (err: any) {
      setSyncProgressMessage('');
      setErrorMessage(
        err.message || 'Failed to exchange authorization code. Please check your Client ID, Secret, and pasted URL.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Sync timeline activities starting from a specific date forward
  const handleSyncTimeline = async (targetStartDate?: string) => {
    if (!settings.stravaAccessToken) {
      setErrorMessage('No active Strava token found. Please re-enter your access token.');
      return;
    }

    const effectiveStartDate = (targetStartDate || customStartDate || ytdDateString).trim();
    const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);

    setIsSyncing(true);
    setErrorMessage('');
    setSyncProgressMessage(`Starting timeline sync from ${effectiveStartDate}...`);

    try {
      let activeToken = settings.stravaAccessToken;
      const refreshConfig = {
        clientId: settings.stravaClientId,
        clientSecret: settings.stravaClientSecret,
        refreshToken: settings.stravaRefreshToken,
        onTokenRefreshed: (tokenData: any) => {
          activeToken = tokenData.access_token;
          onUpdateSettings({
            stravaAccessToken: tokenData.access_token,
            stravaRefreshToken: tokenData.refresh_token,
            stravaExpiresAt: tokenData.expires_at,
          });
        },
      };

      const activities = await fetchAllStravaActivitiesSince(
        activeToken,
        afterEpoch,
        refreshConfig,
        (count, page) => {
          setSyncProgressMessage(
            `Pulling activities from ${effectiveStartDate}... (Page ${page}, ${count} runs found)`
          );
        }
      );

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
        stravaSyncStartDate: effectiveStartDate,
      });

      setToastMessage(
        `✓ Timeline sync complete! Synced ${normalizedWorkouts.length} runs starting from ${effectiveStartDate} forward.`
      );
      setSyncProgressMessage('');
      setTimeout(() => setToastMessage(''), 4500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to pull runs from Strava timeline.');
      setSyncProgressMessage('');
    } finally {
      setIsSyncing(false);
    }
  };

  // 4. Quick sync recent activities
  const handleSyncLatest = async () => {
    await handleSyncTimeline(settings.stravaSyncStartDate || customStartDate || ytdDateString);
  };

  // 5. Disconnect
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
          {oauthStatus && (
            <div
              className={`inweek-ribbon ${
                oauthStatus.type === 'success'
                  ? 'inweek-ribbon-optimal'
                  : 'inweek-ribbon-critical'
              } animate-in`}
            >
              <span
                className={`font-mono text-xs font-bold ${
                  oauthStatus.type === 'success' ? 'text-success' : 'text-danger'
                }`}
              >
                {oauthStatus.message}
              </span>
            </div>
          )}

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
                  <div>
                    <span>Timeline: </span>
                    <span className="text-primary font-bold">
                      All runs from {customStartDate || settings.stravaSyncStartDate || ytdDateString} forward
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

              {/* Timeline Start Date Sync Card */}
              <div className="p-3.5 rounded-xl bg-surface-elevated border border-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📅</span>
                    <strong className="text-xs font-bold text-primary font-mono uppercase tracking-wider">
                      Sync by Timeline / Start Date
                    </strong>
                  </div>
                  <span className="badge-safe font-mono text-xxs font-bold">
                    START DATE FORWARD
                  </span>
                </div>

                <p className="text-xs text-secondary leading-relaxed">
                  Choose a starting date (e.g. <strong>1/1/2026</strong>) to pull all activities from that date forward. Hop Run will automatically pull and reconcile all runs from this date forward.
                </p>

                {/* Preset Timeline Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`btn-filter-pill text-xs font-mono ${customStartDate === ytdDateString ? 'active' : ''}`}
                    onClick={() => setCustomStartDate(ytdDateString)}
                  >
                    Jan 1, 2026 (YTD)
                  </button>
                  <button
                    type="button"
                    className={`btn-filter-pill text-xs font-mono ${customStartDate === getDaysAgoDateString(90) ? 'active' : ''}`}
                    onClick={() => setCustomStartDate(getDaysAgoDateString(90))}
                  >
                    Last 3 Months (90d)
                  </button>
                  <button
                    type="button"
                    className={`btn-filter-pill text-xs font-mono ${customStartDate === getDaysAgoDateString(180) ? 'active' : ''}`}
                    onClick={() => setCustomStartDate(getDaysAgoDateString(180))}
                  >
                    Last 6 Months (180d)
                  </button>
                  <button
                    type="button"
                    className={`btn-filter-pill text-xs font-mono ${customStartDate === getDaysAgoDateString(365) ? 'active' : ''}`}
                    onClick={() => setCustomStartDate(getDaysAgoDateString(365))}
                  >
                    Last 1 Year (365d)
                  </button>
                </div>

                {/* Date Input and Action */}
                <div className="space-y-1.5">
                  <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                    Timeline Start Date (Pulls all runs from this date forward)
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="date"
                      className="input-field text-xs font-mono flex-1"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                    <button
                      type="button"
                      className="btn-strava-primary py-2 px-3 text-xs font-bold font-mono whitespace-nowrap"
                      onClick={() => handleSyncTimeline(customStartDate)}
                      disabled={isSyncing || !customStartDate}
                    >
                      {isSyncing ? 'Syncing Timeline...' : `Sync From ${customStartDate} Forward ➔`}
                    </button>
                  </div>
                </div>

                {syncProgressMessage && (
                  <div className="p-2 rounded bg-surface border border-accent text-xs font-mono text-accent animate-pulse">
                    ⏳ {syncProgressMessage}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-strava-primary flex-1 font-mono text-xs font-bold"
                  onClick={handleSyncLatest}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Pulling Runs...' : 'Sync Latest Runs Now 🔄'}
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
                /* OAuth Mode: Client ID + Secret + Callback Domain Selector + Manual Callback Fallback */
                <div className="space-y-3">
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
                          Set <strong>Authorization Callback Domain</strong> in Strava to match your choice below:
                          <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                            <code className="text-emerald-400 bg-surface-elevated px-2 py-0.5 rounded border border-emerald-500/30 font-mono font-bold">
                              {selectedCallbackHostname}
                            </code>
                            <button
                              type="button"
                              onClick={handleCopyDomain}
                              className="btn-filter-pill text-xxs font-mono py-0.5 px-2"
                            >
                              {copiedDomain ? '✓ Copied!' : '📋 Copy Domain'}
                            </button>
                          </div>
                          <span className="text-amber-400 block pt-1 text-xxs">
                            ⚠️ Important: In Strava settings, enter just the hostname{' '}
                            <strong>{selectedCallbackHostname}</strong> (no https:// or slash).
                          </span>
                        </li>
                        <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below.</li>
                      </ol>
                    </div>

                    {/* Callback Domain Selector */}
                    <div className="p-2.5 rounded-lg bg-surface-elevated border border-subtle space-y-1.5">
                      <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                        Strava Callback Domain (Match strava.com/settings/api)
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCallbackDomainMode('current')}
                          className={`btn-filter-pill text-xxs font-mono ${
                            callbackDomainMode === 'current' ? 'active' : ''
                          }`}
                        >
                          Current ({currentHostname})
                        </button>
                        {currentHostname !== 'hoprun.app' && (
                          <button
                            type="button"
                            onClick={() => setCallbackDomainMode('hoprun')}
                            className={`btn-filter-pill text-xxs font-mono ${
                              callbackDomainMode === 'hoprun' ? 'active' : ''
                            }`}
                          >
                            hoprun.app
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCallbackDomainMode('localhost')}
                          className={`btn-filter-pill text-xxs font-mono ${
                            callbackDomainMode === 'localhost' ? 'active' : ''
                          }`}
                        >
                          localhost Compatibility
                        </button>
                      </div>
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
                      disabled={isSyncing}
                    >
                      <span>Connect &amp; Authorize on Strava →</span>
                    </button>
                    <p className="text-center text-xxs text-muted font-mono">
                      Directs you to Strava to approve activity permissions, then syncs automatically.
                    </p>
                  </form>

                  {/* Manual Callback URL / Code Paste Fallback */}
                  <div className="p-3 rounded-lg bg-surface border border-subtle space-y-2">
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                      Redirected to localhost or another URL? Paste Callback URL or Code here:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input font-mono text-xs flex-1"
                        placeholder="Paste http://localhost:5173/?state=...&code=... or raw code"
                        value={callbackInput}
                        onChange={(e) => setCallbackInput(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleCompleteManualCallback}
                        disabled={isSyncing || !callbackInput.trim()}
                        className="btn-strava-primary px-3 py-2 font-mono text-xxs font-bold whitespace-nowrap"
                      >
                        {isSyncing ? 'Connecting...' : 'Complete Connection'}
                      </button>
                    </div>
                  </div>
                </div>
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
