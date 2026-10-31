import type { DistanceUnit, WorkoutRun } from '../types/acr';
import {
  convertDistance,
  calculateRunLoad,
  formatDurationStrava,
  calculatePaceSeconds,
  formatPace,
} from './calculations';
import { classifyGarminRun } from './garminParser';

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

  // Run type classification & ACWR load multiplier
  const avgHr = act.has_heartrate && act.average_heartrate ? Math.round(act.average_heartrate) : undefined;
  const maxHr = act.has_heartrate && act.max_heartrate ? Math.round(act.max_heartrate) : undefined;

  const { runType, multiplier } = classifyGarminRun({
    title: act.name,
    distanceMiles,
    avgHr,
    durationSeconds: durationSec,
  });

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
 * Fetches recent activities from Strava for the authenticated athlete.
 * Automatically refreshes an expired token if refreshConfig is provided.
 */
export async function fetchStravaActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 30,
  refreshConfig?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    onTokenRefreshed?: (tokenData: StravaTokenResponse) => void;
  }
): Promise<StravaSummaryActivity[]> {
  const path = `/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
  let response = await callStravaEndpoint(path, {
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
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
      response = await callStravaEndpoint(path, {
        headers: {
          Authorization: `Bearer ${refreshed.access_token.trim()}`,
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
  // Filter for runs (Run, TrailRun, VirtualRun)
  return list.filter(
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
 * 1. Deletes any non-Strava calendar/prescribed/assigned runs on the same date for the same runner
 *    in exchange for the synced Strava run(s).
 * 2. Deduplicates already-synced Strava runs while preserving any athlete edits to runType,
 *    multiplier, load, comments, or gear.
 */
export function reconcileStravaWorkouts(
  existingWorkouts: WorkoutRun[],
  incomingStravaWorkouts: WorkoutRun[]
): WorkoutRun[] {
  if (!incomingStravaWorkouts || incomingStravaWorkouts.length === 0) {
    return existingWorkouts;
  }

  // Step 1: Delete any existing non-Strava calendar/prescribed runs on the same date
  // for the same runner in exchange for the synced Strava run(s).
  const filteredExisting = existingWorkouts.filter((existing) => {
    if (existing.source === 'strava') {
      return true;
    }
    const replacedByStrava = incomingStravaWorkouts.some(
      (sRun) =>
        sRun.source === 'strava' &&
        existing.workoutDate === sRun.workoutDate &&
        isSameRunner(existing, sRun)
    );
    return !replacedByStrava;
  });

  // Step 2: Merge incoming Strava workouts, updating existing Strava workouts in-place
  // while preserving user-customized fields (runType, multiplier, load, comments, shoe).
  const result = [...filteredExisting];

  for (const incoming of incomingStravaWorkouts) {
    const existingIdx = result.findIndex((w) => isSameStravaActivity(w, incoming));
    if (existingIdx >= 0) {
      const prev = result[existingIdx];
      const preservedMultiplier = prev.multiplier;
      const preservedLoad = calculateRunLoad(
        incoming.distance,
        incoming.distanceUnit,
        preservedMultiplier
      );
      result[existingIdx] = {
        ...incoming,
        id: prev.id,
        runType: prev.runType,
        multiplier: preservedMultiplier,
        load: preservedLoad,
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
