import React, { useState, useEffect, useRef } from 'react';
import type { UserProfile, AppSettings, WorkoutRun } from '../types/acr';
import {
  DEFAULT_MASTER_STRAVA_CLIENT_ID,
  fetchMasterStravaClientId,
  fetchAllStravaActivitiesSince,
  parseDateToEpochSeconds,
  normalizeStravaActivity,
  buildStravaAuthUrl,
  exchangeStravaCode,
  encodeStravaOAuthState,
  decodeStravaOAuthState,
  extractCodeFromUrlOrInput,
  parseDroppedActivityFiles,
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

  // Mode state: 'oauth' (1-click free connect), 'archive' (ZIP / FIT / GPX dropzone), 'token' (manual PAT)
  const [activeMode, setActiveMode] = useState<'oauth' | 'archive' | 'token'>('oauth');
  const [masterClientId, setMasterClientId] = useState<string>(DEFAULT_MASTER_STRAVA_CLIENT_ID);

  // Form / OAuth state
  const [clientId, setClientId] = useState(settings.stravaClientId || '');
  const [clientSecret, setClientSecret] = useState(settings.stravaClientSecret || '');
  const [accessToken, setAccessToken] = useState(settings.stravaAccessToken || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  // File Dropzone / Archive Import state
  const [isDragging, setIsDragging] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch master app credentials on modal mount
  useEffect(() => {
    let cancelled = false;
    void fetchMasterStravaClientId().then((id) => {
      if (!cancelled && id) {
        setMasterClientId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    callbackDomainMode === 'localhost' || currentHostname === 'localhost'
      ? 'http://localhost:5173/'
      : 'https://hoprun.app/';

  const selectedCallbackHostname =
    callbackDomainMode === 'localhost' || currentHostname === 'localhost'
      ? 'localhost'
      : 'hoprun.app';

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(selectedCallbackHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  // 1. Centralized 1-Click Strava Connect (Works for 100% Free Strava Accounts)
  const handleCentralizedConnect = () => {
    setErrorMessage('');
    const rawId = showAdvanced ? clientId.trim() : '';
    const effectiveId = /^\d+$/.test(rawId)
      ? rawId
      : (masterClientId || DEFAULT_MASTER_STRAVA_CLIENT_ID);
    const effectiveSecret = showAdvanced ? clientSecret.trim() : '';
    const effectiveStartDate = customStartDate || ytdDateString;

    // Save timeline preference
    const currentStored = loadStoredSettings();
    saveStoredSettings({
      ...currentStored,
      stravaClientId: effectiveId,
      stravaClientSecret: effectiveSecret || undefined,
      stravaSyncStartDate: effectiveStartDate,
    });
    onUpdateSettings({
      stravaClientId: effectiveId,
      stravaClientSecret: effectiveSecret || undefined,
      stravaSyncStartDate: effectiveStartDate,
    });

    const state = encodeStravaOAuthState({
      clientId: effectiveId,
      clientSecret: effectiveSecret || undefined,
      origin: currentOrigin,
    });

    const authUrl = buildStravaAuthUrl(effectiveId, selectedRedirectUri, state);
    window.location.href = authUrl;
  };

  // 1b. Direct Access Token Connect (Optional manual token fallback)
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

  // 1c. Manual Callback URL / Code Completion (Fallback for localhost or redirect bounces)
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
      clientId.trim() || decoded?.clientId || settings.stravaClientId || masterClientId;
    const effectiveSecret =
      clientSecret.trim() || decoded?.clientSecret || settings.stravaClientSecret || '';

    setIsSyncing(true);
    try {
      const tokenData = await exchangeStravaCode(effectiveId, effectiveSecret, extractedCode, {
        athleteEmail: currentUser.email,
        athleteName: currentUser.name,
      });
      const athleteName = tokenData.athlete
        ? `${tokenData.athlete.firstname || ''} ${tokenData.athlete.lastname || ''}`.trim()
        : currentUser.name || 'Strava Athlete';

      const effectiveStartDate = customStartDate || ytdDateString;
      const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);
      const activities = await fetchAllStravaActivitiesSince(
        tokenData.access_token,
        afterEpoch,
        {
          clientId: effectiveId,
          clientSecret: effectiveSecret,
          refreshToken: tokenData.refresh_token,
          athleteEmail: currentUser.email,
          onTokenRefreshed: (refreshed) => {
            onUpdateSettings({
              stravaAccessToken: refreshed.access_token,
              stravaRefreshToken: refreshed.refresh_token,
              stravaExpiresAt: refreshed.expires_at,
            });
          },
        },
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
        stravaClientSecret: effectiveSecret || undefined,
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
        err.message || 'Failed to exchange authorization code. Please verify the code and try again.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // 2. Archive ZIP / Files Dropzone Processor
  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsSyncing(true);
    setErrorMessage('');
    setArchiveProgress({ processed: 0, total: fileArray.length });
    const defaultShoe = (settings.shoes || []).find((s) => !s.isRetired && s.isDefault);
    const unit = settings.distanceUnit || 'mi';

    try {
      const importedRuns = await parseDroppedActivityFiles(
        fileArray,
        unit,
        currentUser.id,
        currentUser.name,
        defaultShoe?.id,
        defaultShoe?.name,
        (processed, total) => {
          setArchiveProgress({ processed, total });
        }
      );

      if (importedRuns.length === 0) {
        setErrorMessage(
          'No valid running activities were found in the uploaded file(s). Please verify the ZIP contains activities.csv or .fit/.tcx/.gpx files.'
        );
      } else {
        if (onImportRuns) {
          onImportRuns(importedRuns);
        }
        setToastMessage(
          `✓ Success! Imported and calculated ${importedRuns.length} runs across your training history.`
        );
        setTimeout(() => setToastMessage(''), 5000);
      }
    } catch (err: any) {
      console.error('File import error:', err);
      setErrorMessage(err.message || 'Failed to process activity files.');
    } finally {
      setIsSyncing(false);
      setArchiveProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 3. Sync timeline activities starting from a specific date forward
  const handleSyncTimeline = async (targetStartDate?: string) => {
    if (!settings.stravaAccessToken && !settings.stravaRefreshToken) {
      setErrorMessage('No active Strava connection found. Please connect with Strava first.');
      return;
    }

    const effectiveStartDate = (targetStartDate || customStartDate || ytdDateString).trim();
    const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);

    setIsSyncing(true);
    setErrorMessage('');
    setSyncProgressMessage(`Starting timeline sync from ${effectiveStartDate}...`);

    try {
      let activeToken = settings.stravaAccessToken || '';
      const refreshConfig = {
        clientId: settings.stravaClientId || masterClientId,
        clientSecret: settings.stravaClientSecret,
        refreshToken: settings.stravaRefreshToken,
        athleteEmail: currentUser.email,
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
                  Choose a starting date (e.g. <strong>1/1/2026</strong>) to pull all activities from that date forward. Hop Run automatically reconciles workouts to avoid duplicates.
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
                      className="btn-strava-primary py-2 px-3 text-xs font-bold font-mono whitespace-nowrap cursor-pointer"
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

              {/* Archive ZIP / Bulk File Importer Section (Available when connected too) */}
              <div className="p-3.5 rounded-xl bg-surface border border-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <strong className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>📦</span>
                    <span>Backfill with Strava Archive ZIP / Files</span>
                  </strong>
                  <button
                    type="button"
                    className="btn-filter-pill text-xxs font-mono"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Files
                  </button>
                </div>
                <p className="text-xxs text-secondary">
                  Have a Strava export archive ZIP or watch files (.FIT / .TCX / .GPX)? Drop them here to load years of past runs instantly.
                </p>
                <div
                  className={`border-2 border-dashed rounded-lg p-3 text-center transition-all cursor-pointer ${
                    isDragging ? 'border-accent bg-accent/10' : 'border-subtle bg-surface-elevated/50 hover:bg-surface-elevated'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) void handleFilesSelected(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="text-xs text-muted font-mono block">
                    {archiveProgress
                      ? `⏳ Parsing ${archiveProgress.processed} / ${archiveProgress.total} activities...`
                      : 'Drag & Drop Strava Archive ZIP or .FIT / .TCX / .GPX files'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-strava-primary flex-1 font-mono text-xs font-bold cursor-pointer"
                  onClick={handleSyncLatest}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Pulling Runs...' : 'Sync Latest Runs Now 🔄'}
                </button>
                <button
                  type="button"
                  className="btn-settings-pill text-xs cursor-pointer"
                  style={{ color: 'var(--color-critical)' }}
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Setup Guide & Connect View */
            <div className="space-y-4">
              {/* Relay explanation */}
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

              {/* Mode Switcher Tabs */}
              <div className="login-tab-pills">
                <button
                  type="button"
                  className={`login-tab-pill ${activeMode === 'oauth' ? 'active' : ''}`}
                  onClick={() => setActiveMode('oauth')}
                >
                  1. 1-Click Connect 🟠
                </button>
                <button
                  type="button"
                  className={`login-tab-pill ${activeMode === 'archive' ? 'active' : ''}`}
                  onClick={() => setActiveMode('archive')}
                >
                  2. Archive ZIP / Files 📦
                </button>
                <button
                  type="button"
                  className={`login-tab-pill ${activeMode === 'token' ? 'active' : ''}`}
                  onClick={() => setActiveMode('token')}
                >
                  3. Access Token 🔑
                </button>
              </div>

              {activeMode === 'oauth' && (
                /* Centralized 1-Click OAuth Mode */
                <div className="space-y-3.5">
                  {/* Free Account Guarantee Banner */}
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold text-sm">✓</span>
                      <strong className="text-emerald-400 text-xs font-bold">
                        Works with 100% Free Strava Accounts
                      </strong>
                    </div>
                    <p className="text-xxs text-secondary leading-relaxed pl-5">
                      No Strava subscription or developer API app needed! Hop Run connects securely through Coach Michael Carey's verified application relay.
                    </p>
                  </div>

                  {/* Timeline Start Date selection */}
                  <div className="p-3 rounded-xl bg-surface border border-subtle space-y-2">
                    <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                      Sync Timeline: Pull runs starting from date forward
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={`btn-filter-pill text-xxs font-mono ${customStartDate === ytdDateString ? 'active' : ''}`}
                        onClick={() => setCustomStartDate(ytdDateString)}
                      >
                        Jan 1, 2026 (YTD)
                      </button>
                      <button
                        type="button"
                        className={`btn-filter-pill text-xxs font-mono ${customStartDate === getDaysAgoDateString(90) ? 'active' : ''}`}
                        onClick={() => setCustomStartDate(getDaysAgoDateString(90))}
                      >
                        Last 3 Months (90d)
                      </button>
                      <button
                        type="button"
                        className={`btn-filter-pill text-xxs font-mono ${customStartDate === getDaysAgoDateString(180) ? 'active' : ''}`}
                        onClick={() => setCustomStartDate(getDaysAgoDateString(180))}
                      >
                        Last 6 Months (180d)
                      </button>
                    </div>
                    <input
                      type="date"
                      className="input-field text-xs font-mono w-full"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>

                  {/* The Big 1-Click Connect Button */}
                  <button
                    type="button"
                    onClick={handleCentralizedConnect}
                    className="btn-strava-primary w-full py-3 font-mono text-sm font-bold text-center flex items-center justify-center gap-2 shadow-lg hover:shadow-orange-500/20 transition-all cursor-pointer"
                    disabled={isSyncing}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="#FFFFFF"
                      style={{ width: '18px', height: '18px' }}
                      aria-hidden="true"
                    >
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.01 13.828h4.172" />
                    </svg>
                    <span>Connect with Strava ➔</span>
                  </button>

                  <p className="text-center text-xxs text-muted font-mono">
                    You'll be directed to Strava's login page to authorize Hop Run to view your activities.
                  </p>

                  {/* Expandable Advanced Options for Custom API Keys or Callback Bounce */}
                  <div className="pt-2 border-t border-subtle">
                    <button
                      type="button"
                      className="text-xxs font-mono text-muted hover:text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      <span>{showAdvanced ? '▾ Hide' : '▸ Show'} Advanced API &amp; Manual Callback Options</span>
                    </button>

                    {showAdvanced && (
                      <div className="mt-3 p-3 rounded-xl bg-surface border border-subtle space-y-3 animate-in">
                        <div className="space-y-1.5">
                          <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                            Callback Domain Mode
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
                              localhost
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyDomain}
                              className="btn-filter-pill text-xxs font-mono"
                            >
                              {copiedDomain ? '✓ Copied' : '📋 Copy'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                            Custom Client ID (Optional override)
                          </label>
                          <input
                            type="text"
                            className="input font-mono text-xs w-full"
                            placeholder={masterClientId}
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="text-xxs uppercase tracking-wider text-muted font-mono block mb-1">
                            Custom Client Secret (Optional override)
                          </label>
                          <input
                            type="password"
                            className="input font-mono text-xs w-full"
                            placeholder="Optional master secret override"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                          />
                        </div>

                        {/* Manual Callback URL / Code Paste Fallback */}
                        <div className="pt-2 border-t border-subtle/50 space-y-2">
                          <label className="text-xxs uppercase tracking-wider text-muted font-mono block">
                            Redirected to localhost? Paste the URL or code:
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="input font-mono text-xs flex-1"
                              placeholder="Paste ?code=... URL or code"
                              value={callbackInput}
                              onChange={(e) => setCallbackInput(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={handleCompleteManualCallback}
                              disabled={isSyncing || !callbackInput.trim()}
                              className="btn-strava-primary px-3 py-2 font-mono text-xxs font-bold whitespace-nowrap cursor-pointer"
                            >
                              {isSyncing ? 'Connecting...' : 'Complete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeMode === 'archive' && (
                /* Strava Archive ZIP & Activity Files Importer */
                <div className="space-y-3.5">
                  <div className="p-3.5 rounded-xl bg-surface border border-subtle text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-bold text-base">📦</span>
                      <strong className="text-primary text-xs">
                        Instant Archive &amp; Activity File Importer
                      </strong>
                    </div>
                    <p className="text-secondary text-xxs leading-relaxed">
                      Download your complete Strava history or export files from Garmin, Coros, or Apple Watch. No API rate limits and zero subscriptions required!
                    </p>
                    <ol className="list-decimal list-inside text-secondary text-xxs space-y-1 pt-1">
                      <li>
                        In Strava, go to{' '}
                        <a
                          href="https://www.strava.com/settings/account"
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline font-bold"
                        >
                          strava.com/settings/account ↗
                        </a>
                      </li>
                      <li>
                        Scroll down to <strong>"Download or Delete Your Account"</strong> and click <strong>"Download Request (your archive)"</strong>.
                      </li>
                      <li>
                        Strava will email you a <strong>.zip</strong> file containing all your historical runs.
                      </li>
                      <li>
                        Drop that <strong>.zip</strong> (or raw <strong>.fit</strong>, <strong>.tcx</strong>, <strong>.gpx</strong> files) right below!
                      </li>
                    </ol>
                  </div>

                  {/* Dropzone */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                      isDragging
                        ? 'border-accent bg-accent/15 scale-[1.01]'
                        : 'border-subtle bg-surface-elevated/40 hover:bg-surface-elevated hover:border-accent/50'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files) void handleFilesSelected(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="text-3xl">📁</span>
                      <strong className="text-xs font-bold text-primary font-mono">
                        {isDragging ? 'Drop Files Now' : 'Click or Drag & Drop Strava Archive ZIP here'}
                      </strong>
                      <span className="text-xxs text-muted font-mono">
                        Supports Strava Archive .ZIP, .FIT, .TCX, .GPX
                      </span>
                    </div>
                  </div>

                  {archiveProgress && (
                    <div className="p-3 rounded-lg bg-surface border border-accent text-xs font-mono text-accent animate-pulse text-center">
                      ⏳ Processing activity files... {archiveProgress.processed} / {archiveProgress.total} parsed
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".zip,.fit,.tcx,.gpx"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) void handleFilesSelected(e.target.files);
                    }}
                  />
                </div>
              )}

              {activeMode === 'token' && (
                /* Manual Personal Access Token Form */
                <form onSubmit={handleConnectWithToken} className="space-y-3">
                  <div className="p-3 rounded-lg bg-surface border border-subtle text-xs space-y-2">
                    <strong className="text-primary text-xs block">Manual Token Connect:</strong>
                    <p className="text-secondary text-xxs leading-relaxed">
                      Enter a Personal Access Token that has been granted the{' '}
                      <code className="text-accent font-mono">activity:read_all</code> scope.
                    </p>
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
                    className="btn-strava-primary w-full py-2.5 font-mono text-xs font-bold text-center mt-2 cursor-pointer"
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
