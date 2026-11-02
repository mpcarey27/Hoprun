import type { DistanceUnit, WorkoutRun } from '../types/acr';
import JSZip from 'jszip';
import {
  convertDistance,
  calculateRunLoad,
  formatDurationStrava,
  calculatePaceSeconds,
  formatPace,
  formatDate,
  getRunTypeMultiplier,
} from './calculations';
import {
  parseTCXContent,
  parseGPXContent,
  parseFITBinary,
} from './garminParser';

export interface StravaSummaryActivity {
  id: number;
  name: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain?: number; // in meters
  type: string; // 'Run', 'TrailRun', 'Walk', etc.
  sport_type?: string;
  start_date: string; // UTC ISO 8601
  start_date_local: string; // Local ISO 8601 e.g. "2026-10-25T07:15:00Z"
  timezone?: string;
  utc_offset?: number;
  average_speed?: number; // m/s
  max_speed?: number;
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  device_name?: string; // e.g. "Garmin Forerunner 265"
  suffer_score?: number;
  gear_id?: string;
  description?: string;
}

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: {
    id: number;
    username?: string;
    firstname?: string;
    lastname?: string;
    profile?: string;
  };
}

export interface StravaOAuthStatePayload {
  clientId?: string;
  clientSecret?: string;
  origin?: string;
  athleteId?: string;
  athleteName?: string;
  athleteEmail?: string;
}

/**
 * Encodes OAuth state payload as base64url so Strava credentials, origin, and athlete
 * survive cross-domain redirects (www.hoprun.app <-> hoprun.app <-> localhost).
 */
export function encodeStravaOAuthState(payload: StravaOAuthStatePayload): string {
  try {
    const json = JSON.stringify(payload);
    const base64 =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(json)))
        : Buffer.from(json, 'utf-8').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

/**
 * Safely decodes a base64url Strava OAuth state parameter.
 */
export function decodeStravaOAuthState(
  stateParam: string | null | undefined
): StravaOAuthStatePayload | null {
  if (!stateParam || typeof stateParam !== 'string') return null;
  try {
    const base64 = stateParam.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(escape(atob(padded)))
        : Buffer.from(padded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return {
        clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
        clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
        origin: typeof parsed.origin === 'string' ? parsed.origin : undefined,
        athleteId: typeof parsed.athleteId === 'string' ? parsed.athleteId : undefined,
        athleteName: typeof parsed.athleteName === 'string' ? parsed.athleteName : undefined,
        athleteEmail: typeof parsed.athleteEmail === 'string' ? parsed.athleteEmail : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a clean Strava authorization code (and optional state) whether the user
 * passes a raw code or a full callback URL (e.g. http://localhost:5173/?state=...&code=abc&scope=...).
 */
export function extractCodeFromUrlOrInput(input: string): {
  code: string;
  state?: string | null;
} {
  const trimmed = (input || '').trim();
  if (!trimmed) return { code: '', state: null };

  if (
    trimmed.includes('code=') ||
    trimmed.includes('?') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    try {
      const url =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? new URL(trimmed)
          : new URL(
              trimmed.startsWith('?')
                ? `http://localhost/${trimmed}`
                : `http://localhost/?${trimmed}`
            );
      const codeParam = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state');
      if (codeParam) {
        return { code: codeParam.trim(), state: stateParam };
      }
    } catch {
      const codeMatch = trimmed.match(/[?&]code=([^&#\s]+)/);
      const stateMatch = trimmed.match(/[?&]state=([^&#\s]+)/);
      if (codeMatch?.[1]) {
        return {
          code: decodeURIComponent(codeMatch[1]).trim(),
          state: stateMatch?.[1] ? decodeURIComponent(stateMatch[1]).trim() : null,
        };
      }
    }
  }

  return { code: trimmed, state: null };
}

/**
 * Normalizes a raw Strava activity into a full Hop Run WorkoutRun.
 */
export function normalizeStravaActivity(
  act: StravaSummaryActivity,
  preferredUnit: DistanceUnit = 'mi',
  athleteId: string,
  athleteName: string,
  shoeId?: string,
  shoeName?: string
): WorkoutRun {
  // Extract local date and time from start_date_local (which is already in the athlete's local timezone)
  let workoutDate = act.start_date_local.slice(0, 10); // YYYY-MM-DD
  let startTime = '08:00';
  if (act.start_date_local.length >= 16) {
    startTime = act.start_date_local.slice(11, 16); // HH:MM
  } else {
    try {
      const d = new Date(act.start_date_local);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        startTime = `${hours}:${mins}`;
      }
    } catch {
      // Fallback
    }
  }

  // Convert distance from meters to miles/km
  const distanceMiles = act.distance / 1609.344;
  const targetDistance = Number(
    convertDistance(distanceMiles, 'mi', preferredUnit).toFixed(2)
  );

  const durationSec = act.moving_time || act.elapsed_time || 0;
  const paceSec =
    targetDistance > 0 && durationSec > 0
      ? calculatePaceSeconds(durationSec, targetDistance) || 0
      : 0;

  // Default all synced Strava runs to 'easy' unless overridden by a same-day planned workout or manual user edit
  const avgHr = act.has_heartrate && act.average_heartrate ? Math.round(act.average_heartrate) : undefined;
  const maxHr = act.has_heartrate && act.max_heartrate ? Math.round(act.max_heartrate) : undefined;

  const runType = 'easy';
  const multiplier = getRunTypeMultiplier('easy');
  const load = calculateRunLoad(targetDistance, preferredUnit, multiplier);

  // Elevation in feet and meters
  const elevationMeters = act.total_elevation_gain || 0;
  const elevationFeet = Math.round(elevationMeters * 3.28084);

  // Device model from Strava (often "Garmin Forerunner 265", "Garmin Fenix", etc.)
  const deviceModel = act.device_name || 'Garmin Connect';

  return {
    id: `strava_${act.id}`,
    workoutDate,
    runOrder: 1,
    distance: targetDistance,
    distanceUnit: preferredUnit,
    runType,
    multiplier,
    load,
    comments: act.description ? `${act.description} (Synced via Strava)` : `Synced via Strava (${deviceModel})`,
    completed: true,
    title: act.name || `Garmin Run`,
    startTime,
    athleteId,
    athleteName,
    durationSeconds: durationSec,
    durationFormatted: formatDurationStrava(durationSec),
    paceSeconds: paceSec,
    paceFormatted: formatPace(paceSec, preferredUnit),
    averageHeartRate: avgHr,
    maxHeartRate: maxHr,
    elevationGainMeters: Math.round(elevationMeters),
    elevationGainFeet: elevationFeet,
    source: 'strava',
    externalActivityId: String(act.id),
    deviceModel,
    shoeId,
    shoeName,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Universal helper that routes Strava API calls through local Vite proxy
 * (/api/strava) to bypass browser CORS restrictions, with fallback to direct Strava.
 */
async function callStravaEndpoint(path: string, options: RequestInit): Promise<Response> {
  const isBrowser = typeof window !== 'undefined' && Boolean(window.location?.origin);
  if (isBrowser) {
    try {
      const res = await fetch(`/api/strava${path}`, options);
      if (res.status !== 404) {
        return res;
      }
    } catch {
      // Local proxy not reachable, try direct fallback
    }
  }
  return fetch(`https://www.strava.com${path}`, options);
}

export const DEFAULT_MASTER_STRAVA_CLIENT_ID = '291001';

/**
 * Fetches the centralized master Strava Client ID configured on Cloudflare
 */
export async function fetchMasterStravaClientId(): Promise<string> {
  if (typeof fetch === 'function') {
    try {
      const res = await fetch('/api/strava/config');
      if (res.ok) {
        const data = await res.json();
        if (data?.clientId) return String(data.clientId).trim();
      }
    } catch {
      // Fallback to default
    }
  }
  return DEFAULT_MASTER_STRAVA_CLIENT_ID;
}

/**
 * Exchanges Strava OAuth authorization code for Access & Refresh tokens.
 * Supports both centralized backend exchange (when clientSecret is omitted or handled via server)
 * and direct client-side exchange.
 */
export async function exchangeStravaCode(
  clientId?: string,
  clientSecret?: string,
  code?: string,
  extra?: { athleteEmail?: string; athleteName?: string }
): Promise<StravaTokenResponse> {
  const { code: cleanCode } = extractCodeFromUrlOrInput(code || '');
  if (!cleanCode) throw new Error('Missing Strava authorization code');

  const effClientId = (clientId || '').trim();
  const effClientSecret = (clientSecret || '').trim();

  // If clientSecret is not present on client, use the secure Cloudflare backend endpoint
  if (!effClientSecret && typeof fetch === 'function') {
    try {
      const response = await fetch('/api/strava/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          clientId: effClientId || undefined,
          athleteEmail: extra?.athleteEmail,
          athleteName: extra?.athleteName,
        }),
      });

      if (response.ok) {
        return response.json();
      }
      const err = await response.json().catch(() => ({}));
      if (err.message) {
        throw new Error(err.message);
      }
    } catch (e: any) {
      if (e.message && !e.message.includes('fetch')) {
        throw e;
      }
      // If endpoint unreachable, fall through to direct attempt
    }
  }

  // Fallback direct endpoint
  const response = await callStravaEndpoint('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: effClientId || DEFAULT_MASTER_STRAVA_CLIENT_ID,
      client_secret: effClientSecret,
      code: cleanCode,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const err = await response.json();
      if (err.message) errorDetail = err.message;
      if (err.errors && Array.isArray(err.errors)) {
        errorDetail += `: ${err.errors.map((e: any) => `${e.field || ''} ${e.code || ''}`).join(', ')}`;
      }
    } catch {
      // Ignore json parse error
    }
    throw new Error(errorDetail || `Failed to exchange Strava token (${response.status})`);
  }

  return response.json();
}

/**
 * Refreshes an expired Strava access token using the refresh token.
 */
export async function refreshStravaToken(
  clientId?: string,
  clientSecret?: string,
  refreshToken?: string,
  athleteEmail?: string
): Promise<StravaTokenResponse> {
  const cleanRefresh = (refreshToken || '').trim();
  if (!cleanRefresh) throw new Error('Missing refresh token');

  const effClientId = (clientId || '').trim();
  const effClientSecret = (clientSecret || '').trim();

  // If clientSecret is omitted, refresh via server endpoint
  if (!effClientSecret && typeof fetch === 'function') {
    try {
      const res = await fetch('/api/strava/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: cleanRefresh,
          clientId: effClientId || undefined,
          athleteEmail,
        }),
      });
      if (res.ok) {
        return res.json();
      }
    } catch {
      // Fallback to direct attempt
    }
  }

  const response = await callStravaEndpoint('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: effClientId || DEFAULT_MASTER_STRAVA_CLIENT_ID,
      client_secret: effClientSecret,
      refresh_token: cleanRefresh,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Failed to refresh Strava token (${response.status})`);
  }

  return response.json();
}

/**
 * Converts a timeline date string (e.g. '2026-01-01', '1/1/26', '2025-10-15')
 * to an epoch timestamp in seconds for Strava's `after` parameter.
 * Uses a 12-hour buffer before midnight UTC to ensure no runs in any timezone
 * on that start date are excluded.
 */
export function parseDateToEpochSeconds(dateStr: string): number {
  if (!dateStr || dateStr.trim() === '') {
    // Default to 90 days ago
    return Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  }
  const clean = dateStr.trim();
  // Support YYYY-MM-DD
  const ymd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const utcMidnight = Date.UTC(y, m, d, 0, 0, 0);
    return Math.max(0, Math.floor((utcMidnight - 12 * 3600 * 1000) / 1000));
  }
  // Support M/D/YY or M/D/YYYY (e.g. '1/1/26' or '1/1/2026')
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const m = parseInt(mdy[1], 10) - 1;
    const d = parseInt(mdy[2], 10);
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    const utcMidnight = Date.UTC(y, m, d, 0, 0, 0);
    return Math.max(0, Math.floor((utcMidnight - 12 * 3600 * 1000) / 1000));
  }
  const parsed = new Date(clean).getTime();
  if (!isNaN(parsed)) {
    return Math.max(0, Math.floor((parsed - 12 * 3600 * 1000) / 1000));
  }
  return Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
}

/**
 * Fetches ALL activities from Strava starting at a specific epoch timestamp forward.
 * Automatically paginates through Strava's 200 items/page API until all activities
 * from that timeline date forward have been collected.
 */
export async function fetchAllStravaActivitiesSince(
  accessToken: string,
  afterEpochSeconds: number,
  refreshConfig?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    athleteEmail?: string;
    onTokenRefreshed?: (tokenData: StravaTokenResponse) => void;
  },
  onProgress?: (totalFetched: number, page: number) => void
): Promise<StravaSummaryActivity[]> {
  const allActivities: StravaSummaryActivity[] = [];
  let page = 1;
  const perPage = 200;
  const maxPages = 30; // Up to 6,000 activities
  let currentToken = accessToken;

  while (page <= maxPages) {
    const { runs, rawCount } = await fetchStravaActivitiesPage(
      currentToken,
      page,
      perPage,
      refreshConfig
        ? {
            ...refreshConfig,
            onTokenRefreshed: (tokenData) => {
              currentToken = tokenData.access_token;
              if (refreshConfig.onTokenRefreshed) {
                refreshConfig.onTokenRefreshed(tokenData);
              }
            },
          }
        : undefined,
      afterEpochSeconds
    );

    if (rawCount === 0) {
      break;
    }

    allActivities.push(...runs);

    if (onProgress) {
      onProgress(allActivities.length, page);
    }

    // Break ONLY when rawCount < perPage (or rawCount === 0).
    // This ensures that if page 1 returns 200 items (e.g. 188 runs and 12 hikes/rides),
    // the loop proceeds to page 2, page 3, etc., until all items up to the current date are collected.
    if (rawCount < perPage) {
      break; // Reached the most recent activities
    }

    page++;
  }

  // Sort all collected activities by start_date descending (newest first) before returning
  allActivities.sort((a, b) => {
    const timeA = new Date(a.start_date).getTime();
    const timeB = new Date(b.start_date).getTime();
    return timeB - timeA;
  });

  return allActivities;
}

/**
 * Fetches a single page of activities from Strava, tracking raw activity count before filtering.
 * Returns both the filtered runs and the rawCount from Strava's response to preserve pagination.
 */
export async function fetchStravaActivitiesPage(
  accessToken: string,
  page: number = 1,
  perPage: number = 200,
  refreshConfig?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    athleteEmail?: string;
    onTokenRefreshed?: (tokenData: StravaTokenResponse) => void;
  },
  afterEpochSeconds?: number
): Promise<{ runs: StravaSummaryActivity[]; rawCount: number }> {
  const effectiveAfter =
    afterEpochSeconds ?? Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const path = `/api/v3/athlete/activities?after=${effectiveAfter}&page=${page}&per_page=${perPage}`;
  let activeAccessToken = accessToken.trim();
  let response = await callStravaEndpoint(path, {
    headers: {
      Authorization: `Bearer ${activeAccessToken}`,
    },
  });

  if (response.status === 401 && refreshConfig?.refreshToken) {
    try {
      const refreshed = await refreshStravaToken(
        refreshConfig.clientId || DEFAULT_MASTER_STRAVA_CLIENT_ID,
        refreshConfig.clientSecret,
        refreshConfig.refreshToken,
        refreshConfig.athleteEmail
      );
      if (refreshConfig.onTokenRefreshed) {
        refreshConfig.onTokenRefreshed(refreshed);
      }
      activeAccessToken = refreshed.access_token.trim();
      response = await callStravaEndpoint(path, {
        headers: {
          Authorization: `Bearer ${activeAccessToken}`,
        },
      });
    } catch {
      // Fall through to standard 401 error below if refresh fails
    }
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      if (errJson.message) errorDetail = errJson.message;
    } catch {
      //
    }
    if (response.status === 401) {
      throw new Error(
        `Strava token unauthorized or expired${errorDetail ? ` (${errorDetail})` : ''}. Please re-authenticate with "activity:read_all" scope.`
      );
    }
    if (response.status === 403) {
      throw new Error(
        `Strava permission denied${errorDetail ? ` (${errorDetail})` : ''}. Your token does not have permission to read activities. Please use 1-Click Connect to authorize with activity scope.`
      );
    }
    throw new Error(`Failed to fetch Strava activities (HTTP ${response.status}${errorDetail ? ` - ${errorDetail}` : ''})`);
  }

  const list: StravaSummaryActivity[] = await response.json();
  const rawList = Array.isArray(list) ? list : [];
  const rawCount = rawList.length;

  // Filter for runs (Run, TrailRun, VirtualRun)
  const runs = rawList.filter(
    (act) =>
      act.type === 'Run' ||
      act.sport_type === 'Run' ||
      act.sport_type === 'TrailRun' ||
      act.sport_type === 'VirtualRun'
  );

  return { runs, rawCount };
}

/**
 * Fetches recent activities from Strava for the authenticated athlete.
 * Defaults to importing the last 3 months (90 days) of runs automatically.
 * Automatically refreshes an expired token if refreshConfig is provided.
 */
export async function fetchStravaActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 200,
  refreshConfig?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    athleteEmail?: string;
    onTokenRefreshed?: (tokenData: StravaTokenResponse) => void;
  },
  afterEpochSeconds?: number
): Promise<StravaSummaryActivity[]> {
  const { runs } = await fetchStravaActivitiesPage(
    accessToken,
    page,
    perPage,
    refreshConfig,
    afterEpochSeconds
  );
  return runs;
}

/**
 * Builds the Strava OAuth 2.0 authorization URL.
 */
export function buildStravaAuthUrl(
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const cleanId = (clientId || '').trim();
  const validId = /^\d+$/.test(cleanId) ? cleanId : DEFAULT_MASTER_STRAVA_CLIENT_ID;
  const scope = 'read,activity:read,activity:read_all';
  const base = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(
    validId
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&approval_prompt=auto&scope=${encodeURIComponent(scope)}`;
  if (state) {
    return `${base}&state=${encodeURIComponent(state)}`;
  }
  return base;
}

const MICHAEL_ATHLETE_IDS = new Set(['user_michael_carey', 'user_michael_athlete']);

function isSameRunner(a: WorkoutRun, b: WorkoutRun): boolean {
  if (a.athleteId && b.athleteId) {
    if (a.athleteId === b.athleteId) return true;
    if (MICHAEL_ATHLETE_IDS.has(a.athleteId) && MICHAEL_ATHLETE_IDS.has(b.athleteId)) return true;
    return false;
  }
  if (a.athleteName && b.athleteName) {
    const nameA = a.athleteName.trim().toLowerCase();
    const nameB = b.athleteName.trim().toLowerCase();
    if (nameA === nameB) return true;
    if (nameA.includes('michael carey') && nameB.includes('michael carey')) return true;
    return false;
  }
  if (!a.athleteId && !b.athleteId && !a.athleteName && !b.athleteName) {
    return true;
  }
  return false;
}

function isSameStravaActivity(a: WorkoutRun, b: WorkoutRun): boolean {
  if (a.id === b.id) return true;
  if (
    a.externalActivityId &&
    b.externalActivityId &&
    a.externalActivityId === b.externalActivityId
  ) {
    return true;
  }
  if (
    a.source === 'strava' &&
    b.source === 'strava' &&
    isSameRunner(a, b) &&
    a.workoutDate === b.workoutDate &&
    Math.abs(a.distance - b.distance) < 0.05 &&
    (a.startTime || '') === (b.startTime || '')
  ) {
    return true;
  }
  return false;
}

/**
 * Reconciles incoming synced Strava runs against existing calendar workouts:
 * 1. Defaults all synced Strava runs to 'easy', EXCEPT when a same-day planned/prescribed
 *    calendar workout for that runner has a non-easy runType — in which case the longest
 *    synced Strava run on that date inherits the planned workout's runType.
 * 2. Deletes any non-Strava calendar/prescribed/assigned runs on the same date for the same runner
 *    in exchange for the synced Strava run(s).
 * 3. Deduplicates already-synced Strava runs while preserving any confirmed/edited runType,
 *    multiplier, load, comments, or gear.
 */
export function reconcileStravaWorkouts(
  existingWorkouts: WorkoutRun[],
  incomingStravaWorkouts: WorkoutRun[]
): WorkoutRun[] {
  if (!incomingStravaWorkouts || incomingStravaWorkouts.length === 0) {
    return existingWorkouts;
  }

  const preparedIncoming: WorkoutRun[] = incomingStravaWorkouts.map((r) => ({ ...r }));
  const uniqueDates = Array.from(
    new Set(preparedIncoming.filter((r) => r.source === 'strava').map((r) => r.workoutDate))
  );

  // Step 1: Same-day planned workout type inheritance onto the longest synced Strava run of the day
  for (const dateStr of uniqueDates) {
    const stravaRunsOnDay = preparedIncoming.filter(
      (r) => r.source === 'strava' && r.workoutDate === dateStr
    );
    const nonStravaOnDay = existingWorkouts.filter(
      (w) => w.source !== 'strava' && w.workoutDate === dateStr
    );

    const processedIndices = new Set<number>();
    for (let i = 0; i < stravaRunsOnDay.length; i++) {
      if (processedIndices.has(i)) continue;
      const rep = stravaRunsOnDay[i];
      const runnerStravaRuns: WorkoutRun[] = [];
      for (let j = i; j < stravaRunsOnDay.length; j++) {
        if (!processedIndices.has(j) && isSameRunner(rep, stravaRunsOnDay[j])) {
          processedIndices.add(j);
          runnerStravaRuns.push(stravaRunsOnDay[j]);
        }
      }

      // Default all non-confirmed Strava runs on this day to 'easy'
      for (const sr of runnerStravaRuns) {
        if (!sr.isTypeConfirmed) {
          const easyMult = getRunTypeMultiplier('easy');
          sr.runType = 'easy';
          sr.multiplier = easyMult;
          sr.load = calculateRunLoad(sr.distance, sr.distanceUnit, easyMult);
        }
      }

      // Check if there is a non-easy planned/prescribed workout on this date for this runner
      const plannedNonEasyRuns = nonStravaOnDay
        .filter(
          (w) =>
            isSameRunner(w, rep) &&
            Boolean(w.runType) &&
            w.runType !== 'easy' &&
            w.runType !== 'day_off'
        )
        .sort(
          (a, b) => getRunTypeMultiplier(b.runType) - getRunTypeMultiplier(a.runType)
        );

      if (plannedNonEasyRuns.length > 0 && runnerStravaRuns.length > 0) {
        const sortedByDistanceDesc = [...runnerStravaRuns].sort(
          (a, b) => b.distance - a.distance
        );
        const longestRun = sortedByDistanceDesc[0];
        const inheritedType = plannedNonEasyRuns[0].runType;
        const inheritedMultiplier = getRunTypeMultiplier(inheritedType);
        longestRun.runType = inheritedType;
        longestRun.multiplier = inheritedMultiplier;
        longestRun.load = calculateRunLoad(
          longestRun.distance,
          longestRun.distanceUnit,
          inheritedMultiplier
        );
        longestRun.isTypeConfirmed = true;
      }
    }
  }

  // Step 2: Delete any existing non-Strava calendar/prescribed runs on the same date
  // for the same runner in exchange for the synced Strava run(s).
  const filteredExisting = existingWorkouts.filter((existing) => {
    if (existing.source === 'strava') {
      return true;
    }
    const replacedByStrava = preparedIncoming.some(
      (sRun) =>
        sRun.source === 'strava' &&
        existing.workoutDate === sRun.workoutDate &&
        isSameRunner(existing, sRun)
    );
    return !replacedByStrava;
  });

  // Step 3: Merge incoming Strava workouts, updating existing Strava workouts in-place
  // while preserving confirmed/edited runType, multiplier, load, comments, and gear.
  const result = [...filteredExisting];

  for (const incoming of preparedIncoming) {
    const existingIdx = result.findIndex((w) => isSameStravaActivity(w, incoming));
    if (existingIdx >= 0) {
      const prev = result[existingIdx];
      let resolvedRunType = 'easy';
      let resolvedMultiplier = getRunTypeMultiplier('easy');
      let resolvedConfirmed: boolean | undefined = undefined;

      if (incoming.isTypeConfirmed) {
        resolvedRunType = incoming.runType;
        resolvedMultiplier = incoming.multiplier;
        resolvedConfirmed = true;
      } else if (prev.isTypeConfirmed) {
        resolvedRunType = prev.runType;
        resolvedMultiplier = prev.multiplier;
        resolvedConfirmed = true;
      }

      const resolvedLoad = calculateRunLoad(
        incoming.distance,
        incoming.distanceUnit,
        resolvedMultiplier
      );

      result[existingIdx] = {
        ...incoming,
        id: prev.id,
        runType: resolvedRunType,
        multiplier: resolvedMultiplier,
        load: resolvedLoad,
        isTypeConfirmed: resolvedConfirmed,
        comments: prev.comments,
        title: prev.title || incoming.title,
        shoeId: prev.shoeId || incoming.shoeId,
        shoeName: prev.shoeName || incoming.shoeName,
        rpe: prev.rpe ?? incoming.rpe,
        feeling: prev.feeling ?? incoming.feeling,
        athleteComment: prev.athleteComment ?? incoming.athleteComment,
        editReason: prev.editReason ?? incoming.editReason,
        athleteId:
          incoming.athleteId && incoming.athleteId !== 'user_coach_1'
            ? incoming.athleteId
            : prev.athleteId && prev.athleteId !== 'user_coach_1'
            ? prev.athleteId
            : incoming.athleteId || prev.athleteId,
        athleteName:
          incoming.athleteName && incoming.athleteName !== ''
            ? incoming.athleteName
            : prev.athleteName || incoming.athleteName,
      };
    } else {
      result.push(incoming);
    }
  }

  return result;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.trim().replace(/^"(.*)"$/, '$1'));
}

/**
 * Parses activities.csv from a Strava data export archive into WorkoutRun items.
 * Sub-second client-side execution for hundreds or thousands of runs.
 */
export function parseStravaArchiveCsv(
  csvText: string,
  preferredUnit: DistanceUnit = 'mi',
  athleteId: string,
  athleteName: string,
  shoeId?: string,
  shoeName?: string
): WorkoutRun[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const colIndex = (names: string[]): number => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h === n || h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idCol = colIndex(['activity id', 'id']);
  const dateCol = colIndex(['activity date', 'date']);
  const nameCol = colIndex(['activity name', 'name', 'title']);
  const typeCol = colIndex(['activity type', 'type', 'sport']);
  const descCol = colIndex(['activity description', 'description']);
  const distCol = colIndex(['distance']);
  const movingTimeCol = colIndex(['moving time', 'moving_time']);
  const elapsedTimeCol = colIndex(['elapsed time', 'elapsed_time']);
  const maxHrCol = colIndex(['max heart rate', 'max heartrate', 'max hr']);
  const avgHrCol = colIndex(['average heart rate', 'avg heart rate', 'average heartrate', 'avg hr']);
  const elevCol = colIndex(['elevation gain', 'total elevation gain']);

  const runs: WorkoutRun[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 4) continue;

    const rawType = (typeCol >= 0 ? row[typeCol] : '').toLowerCase();
    // Only import running activities
    if (
      !rawType.includes('run') &&
      !rawType.includes('jog') &&
      !rawType.includes('treadmill')
    ) {
      continue;
    }

    const rawId = idCol >= 0 && row[idCol] ? row[idCol] : `csv_${i}`;
    const rawName = nameCol >= 0 && row[nameCol] ? row[nameCol] : 'Morning Run';
    const rawDate = dateCol >= 0 ? row[dateCol] : '';
    const rawDesc = descCol >= 0 ? row[descCol] : '';

    // Parse date & time
    let workoutDate = formatDate(new Date());
    let startTime = '08:00';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          workoutDate = formatDate(d);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          startTime = `${hh}:${mm}`;
        } else {
          // Fallback match YYYY-MM-DD
          const matchYmd = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (matchYmd) {
            workoutDate = `${matchYmd[1]}-${matchYmd[2]}-${matchYmd[3]}`;
          }
        }
      } catch {
        // Fallback
      }
    }

    // Parse distance: in Strava exports, Distance is in meters (e.g. 8046.72 or 16093.4)
    let distMeters = 0;
    if (distCol >= 0 && row[distCol]) {
      const val = parseFloat(row[distCol].replace(/,/g, ''));
      if (!isNaN(val)) distMeters = val;
    }
    let distanceVal = 0;
    if (distMeters > 150) {
      // In meters
      const distanceMiles = distMeters / 1609.344;
      distanceVal = Number(convertDistance(distanceMiles, 'mi', preferredUnit).toFixed(2));
    } else {
      distanceVal = Number(convertDistance(distMeters, 'mi', preferredUnit).toFixed(2));
    }

    if (distanceVal <= 0.05) continue; // Skip zero-distance runs

    // Duration (Moving time preferred, else elapsed time)
    let durationSeconds = 0;
    if (movingTimeCol >= 0 && row[movingTimeCol]) {
      const val = parseFloat(row[movingTimeCol]);
      if (!isNaN(val)) durationSeconds = Math.round(val);
    }
    if (durationSeconds <= 0 && elapsedTimeCol >= 0 && row[elapsedTimeCol]) {
      const val = parseFloat(row[elapsedTimeCol]);
      if (!isNaN(val)) durationSeconds = Math.round(val);
    }

    const paceSec =
      distanceVal > 0 && durationSeconds > 0
        ? calculatePaceSeconds(durationSeconds, distanceVal) || 0
        : 0;

    // Heart rates
    let avgHr: number | undefined;
    let maxHr: number | undefined;
    if (avgHrCol >= 0 && row[avgHrCol]) {
      const n = Math.round(parseFloat(row[avgHrCol]));
      if (!isNaN(n) && n > 40 && n < 230) avgHr = n;
    }
    if (maxHrCol >= 0 && row[maxHrCol]) {
      const n = Math.round(parseFloat(row[maxHrCol]));
      if (!isNaN(n) && n > 40 && n < 230) maxHr = n;
    }

    // Elevation
    let elevMeters = 0;
    if (elevCol >= 0 && row[elevCol]) {
      const n = parseFloat(row[elevCol]);
      if (!isNaN(n)) elevMeters = n;
    }

    const runType = 'easy';
    const multiplier = getRunTypeMultiplier('easy');
    const load = calculateRunLoad(distanceVal, preferredUnit, multiplier);

    runs.push({
      id: `strava_${rawId}`,
      workoutDate,
      runOrder: 1,
      distance: distanceVal,
      distanceUnit: preferredUnit,
      runType,
      multiplier,
      load,
      comments: rawDesc ? `${rawDesc} (Strava Archive)` : 'Imported via Strava Archive',
      completed: true,
      title: rawName,
      startTime,
      athleteId,
      athleteName,
      durationSeconds,
      durationFormatted: formatDurationStrava(durationSeconds),
      paceSeconds: paceSec,
      paceFormatted: formatPace(paceSec, preferredUnit),
      averageHeartRate: avgHr,
      maxHeartRate: maxHr,
      elevationGainMeters: Math.round(elevMeters),
      elevationGainFeet: Math.round(elevMeters * 3.28084),
      source: 'strava',
      externalActivityId: String(rawId),
      shoeId,
      shoeName,
      updatedAt: new Date().toISOString(),
    });
  }

  // Sort ascending by date
  runs.sort((a, b) => a.workoutDate.localeCompare(b.workoutDate));
  return runs;
}

/**
 * Parses a downloaded Strava Archive ZIP buffer.
 * Extracts activities.csv and any .fit/.tcx/.gpx files inside.
 */
export async function parseStravaArchiveZip(
  zipBuffer: ArrayBuffer,
  preferredUnit: DistanceUnit = 'mi',
  athleteId: string,
  athleteName: string,
  shoeId?: string,
  shoeName?: string
): Promise<WorkoutRun[]> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // 1. Look for activities.csv (fastest and most comprehensive)
  const csvMatch = zip.file(/^.*activities\.csv$/i)[0] || zip.file('activities.csv');
  if (csvMatch) {
    const csvContent = await csvMatch.async('text');
    const workouts = parseStravaArchiveCsv(csvContent, preferredUnit, athleteId, athleteName, shoeId, shoeName);
    if (workouts.length > 0) {
      return workouts;
    }
  }

  // 2. Fallback: Parse individual TCX/GPX/FIT files inside the ZIP
  const runs: WorkoutRun[] = [];
  const entries = Object.keys(zip.files);
  for (const name of entries) {
    const file = zip.files[name];
    if (file.dir) continue;
    const lower = name.toLowerCase();

    try {
      if (lower.endsWith('.tcx')) {
        const text = await file.async('text');
        const parsed = parseTCXContent(text, preferredUnit);
        runs.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'Imported via Archive',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      } else if (lower.endsWith('.gpx')) {
        const text = await file.async('text');
        const parsed = parseGPXContent(text, preferredUnit);
        runs.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'Imported via Archive',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      } else if (lower.endsWith('.fit')) {
        const buf = await file.async('arraybuffer');
        const parsed = parseFITBinary(buf, preferredUnit);
        runs.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'Imported via Archive',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      }
    } catch {
      // Skip unparseable
    }
  }

  runs.sort((a, b) => a.workoutDate.localeCompare(b.workoutDate));
  return runs;
}

/**
 * Handles bulk dropped activity files (.fit, .tcx, .gpx, or Strava archive .zip).
 */
export async function parseDroppedActivityFiles(
  files: File[],
  preferredUnit: DistanceUnit = 'mi',
  athleteId: string,
  athleteName: string,
  shoeId?: string,
  shoeName?: string,
  onProgress?: (processed: number, total: number) => void
): Promise<WorkoutRun[]> {
  const allWorkouts: WorkoutRun[] = [];
  let count = 0;

  for (const file of files) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const extracted = await parseStravaArchiveZip(buf, preferredUnit, athleteId, athleteName, shoeId, shoeName);
        allWorkouts.push(...extracted);
      } else if (name.endsWith('.tcx')) {
        const text = await file.text();
        const parsed = parseTCXContent(text, preferredUnit);
        allWorkouts.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'File Upload',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      } else if (name.endsWith('.gpx')) {
        const text = await file.text();
        const parsed = parseGPXContent(text, preferredUnit);
        allWorkouts.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'File Upload',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      } else if (name.endsWith('.fit')) {
        const buf = await file.arrayBuffer();
        const parsed = parseFITBinary(buf, preferredUnit);
        allWorkouts.push({
          id: parsed.id,
          workoutDate: parsed.workoutDate,
          runOrder: 1,
          distance: parsed.distance,
          distanceUnit: parsed.distanceUnit,
          runType: parsed.runType,
          multiplier: parsed.multiplier,
          load: parsed.load,
          comments: parsed.comments || 'File Upload',
          completed: true,
          title: parsed.title,
          startTime: parsed.startTime,
          athleteId,
          athleteName,
          durationSeconds: parsed.durationSeconds,
          durationFormatted: parsed.durationFormatted,
          paceSeconds: parsed.paceSeconds,
          paceFormatted: parsed.paceFormatted,
          source: 'file_import',
          averageHeartRate: parsed.averageHeartRate,
          maxHeartRate: parsed.maxHeartRate,
          elevationGainMeters: parsed.elevationGainMeters,
          elevationGainFeet: parsed.elevationGainFeet,
          shoeId,
          shoeName,
        });
      }
    } catch (err) {
      console.warn(`Could not parse file ${file.name}:`, err);
    }
    count++;
    if (onProgress) onProgress(count, files.length);
  }

  allWorkouts.sort((a, b) => a.workoutDate.localeCompare(b.workoutDate));
  return allWorkouts;
}
