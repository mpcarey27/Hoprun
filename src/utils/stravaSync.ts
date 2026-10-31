import type { DistanceUnit, WorkoutRun } from '../types/acr';
import {
  convertDistance,
  calculateRunLoad,
  formatDurationStrava,
  calculatePaceSeconds,
  formatPace,
  getRunTypeMultiplier,
} from './calculations';

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
}

/**
 * Encodes OAuth state payload as base64url so Strava credentials and origin
 * survive cross-domain redirects (www.hoprun.app <-> hoprun.app <-> localhost).
 */
export function encodeStravaOAuthState(payload: {
  clientId: string;
  clientSecret: string;
  origin?: string;
}): string {
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

/**
 * Exchanges Strava OAuth authorization code for Access & Refresh tokens.
 */
export async function exchangeStravaCode(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<StravaTokenResponse> {
  const { code: cleanCode } = extractCodeFromUrlOrInput(code);
  const response = await callStravaEndpoint('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      code: cleanCode.trim(),
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
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<StravaTokenResponse> {
  const response = await callStravaEndpoint('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken.trim(),
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
    const batch = await fetchStravaActivities(
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

    if (!batch || batch.length === 0) {
      break;
    }

    allActivities.push(...batch);

    if (onProgress) {
      onProgress(allActivities.length, page);
    }

    if (batch.length < perPage) {
      break; // Reached the most recent activities
    }

    page++;
  }

  return allActivities;
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
    onTokenRefreshed?: (tokenData: StravaTokenResponse) => void;
  },
  afterEpochSeconds?: number
): Promise<StravaSummaryActivity[]> {
  const effectiveAfter =
    afterEpochSeconds ?? Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const path = `/api/v3/athlete/activities?after=${effectiveAfter}&page=${page}&per_page=${perPage}`;
  let activeAccessToken = accessToken.trim();
  let response = await callStravaEndpoint(path, {
    headers: {
      Authorization: `Bearer ${activeAccessToken}`,
    },
  });

  if (
    response.status === 401 &&
    refreshConfig?.clientId &&
    refreshConfig?.clientSecret &&
    refreshConfig?.refreshToken
  ) {
    try {
      const refreshed = await refreshStravaToken(
        refreshConfig.clientId,
        refreshConfig.clientSecret,
        refreshConfig.refreshToken
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

  // Filter for runs (Run, TrailRun, VirtualRun)
  return rawList.filter(
    (act) =>
      act.type === 'Run' ||
      act.sport_type === 'Run' ||
      act.sport_type === 'TrailRun' ||
      act.sport_type === 'VirtualRun'
  );
}

/**
 * Builds the Strava OAuth 2.0 authorization URL.
 */
export function buildStravaAuthUrl(
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const scope = 'read,activity:read,activity:read_all';
  const base = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(
    clientId.trim()
  )}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&approval_prompt=force&scope=${encodeURIComponent(scope)}`;
  if (state) {
    return `${base}&state=${encodeURIComponent(state)}`;
  }
  return base;
}

const MICHAEL_ATHLETE_IDS = new Set(['user_michael_carey', 'user_michael_athlete']);

function isSameRunner(a: WorkoutRun, b: WorkoutRun): boolean {
  if (!a.athleteId || !b.athleteId) return true;
  if (a.athleteId === b.athleteId) return true;
  if (MICHAEL_ATHLETE_IDS.has(a.athleteId) && MICHAEL_ATHLETE_IDS.has(b.athleteId)) return true;
  if (a.athleteName && b.athleteName) {
    const nameA = a.athleteName.trim().toLowerCase();
    const nameB = b.athleteName.trim().toLowerCase();
    if (nameA === nameB) return true;
    if (nameA.includes('michael carey') && nameB.includes('michael carey')) return true;
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
        athleteId: prev.athleteId || incoming.athleteId,
        athleteName: prev.athleteName || incoming.athleteName,
      };
    } else {
      result.push(incoming);
    }
  }

  return result;
}
