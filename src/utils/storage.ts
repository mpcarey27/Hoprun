import type {
  WorkoutRun,
  TrainingPlan,
  CoachNotification,
  UserProfile,
  AppSettings,
  RegisteredUser,
} from '../types/acr';
import { reconcileStravaWorkouts } from './stravaSync';

const STORAGE_KEYS = {
  WORKOUTS: 'acr_workouts_v2',
  PLANS: 'acr_plans_v2',
  NOTIFICATIONS: 'acr_notifications_v2',
  USER: 'acr_user_v2',
  SETTINGS: 'acr_settings_v2',
  ROSTER: 'acr_roster_v2',
  AUTH_USERS: 'hop_run_auth_users_v1',
  KEEP_SIGNED_IN: 'hop_run_keep_signed_in_v1',
  LAST_USER: 'hop_run_last_user_v1',
  USER_STRAVA: 'hop_run_user_strava_v1',
};

export const DEFAULT_SETTINGS: AppSettings = {
  distanceUnit: 'mi',
  firstDayOfWeek: 1, // Monday
  warningThreshold: 1.2,
  themeMode: 'dark',
  weeklyMileageTarget: 35.0,
  dailyEmailRemindersEnabled: true,
  dailyEmailRemindersHour: 6,
  weeklyEmailRemindersEnabled: true,
  shoes: [
    {
      id: 'shoe_default_1',
      name: 'Daily Trainer (Nike Pegasus / Ghost)',
      brand: 'Daily Trainer',
      totalMiles: 124.5,
      maxMiles: 400,
      isRetired: false,
      dateAdded: '2026-09-01',
      isDefault: true,
    },
  ],
};

export const COACH_EMAIL = 'careyer1234@gmail.com';

/**
 * Validates if an email belongs to the head coach.
 * careyer1234@gmail.com is strictly the only coach profile.
 */
export function isCoachEmail(email: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === COACH_EMAIL.toLowerCase();
}

/**
 * Determines user role based on email.
 * careyer1234@gmail.com -> coach
 * all others -> runner (athlete)
 */
export function determineUserRole(email: string): 'coach' | 'runner' {
  return isCoachEmail(email) ? 'coach' : 'runner';
}

export const COACH_PROFILE: UserProfile = {
  id: 'user_michael_carey',
  email: 'careyer1234@gmail.com',
  name: 'Michael Carey',
  role: 'coach',
  avatarUrl: '',
};

export const COACH_ATHLETE_PROFILE: UserProfile = {
  id: 'user_michael_athlete',
  email: 'careyer1234@gmail.com',
  name: 'Michael Carey (Athlete)',
  role: 'runner',
  avatarUrl: '',
};

/**
 * The roster starts with ONLY the coach (Michael Carey). The coach can assign plans/runs to
 * himself, and every other athlete joins by creating an account through the coach's invite link.
 */
export const INITIAL_ROSTER_USERS: UserProfile[] = [COACH_PROFILE];

/**
 * Legacy demo/example accounts that must never appear on the roster or sign-in list again.
 * `user_michael_athlete` is removed because the coach profile itself can now receive plans.
 */
export const REMOVED_EXAMPLE_ACCOUNT_IDS = new Set<string>([
  'user_michael_athlete',
  'user_elise',
  'user_rob',
  'runner_alex',
  'runner_sarah',
]);

const REMOVED_EXAMPLE_EMAILS = new Set<string>([
  'elise.runner@example.com',
  'rob.athlete@example.com',
  'alex.river@example.com',
  'sarah.chen@example.com',
]);

function isRemovedExampleAccount(u: { id?: string; email?: string; googleSheetUrl?: string }): boolean {
  // Allow explicitly updated or linked accounts (e.g. in tests)
  if (u.googleSheetUrl) return false;
  return (
    (!!u.id && REMOVED_EXAMPLE_ACCOUNT_IDS.has(u.id)) ||
    (!!u.email && REMOVED_EXAMPLE_EMAILS.has(u.email.toLowerCase()))
  );
}

export const ROSTER_USERS: UserProfile[] = INITIAL_ROSTER_USERS;

export const DEFAULT_USER: UserProfile = COACH_PROFILE;

/**
 * Merges a list of roster entries on top of the coach profile, stripping example accounts and
 * forcing every non-coach account to the `runner` role. The coach is always listed first.
 */
function mergeRoster(entries: UserProfile[]): UserProfile[] {
  const map = new Map<string, UserProfile>();
  map.set(COACH_PROFILE.id, COACH_PROFILE);
  for (const u of entries) {
    if (!u || !u.id || isRemovedExampleAccount(u)) continue;
    if (u.id === COACH_PROFILE.id || isCoachEmail(u.email || '')) {
      const existingCoach = map.get(COACH_PROFILE.id) || COACH_PROFILE;
      map.set(COACH_PROFILE.id, {
        ...COACH_PROFILE,
        googleSheetUrl: u.googleSheetUrl ?? existingCoach.googleSheetUrl,
        googleSheetTab: u.googleSheetTab ?? existingCoach.googleSheetTab,
        googleSheetLastSyncedAt: u.googleSheetLastSyncedAt ?? existingCoach.googleSheetLastSyncedAt,
      });
      continue;
    }
    const emailKey = (u.email || '').toLowerCase();
    const dupe = Array.from(map.values()).find(
      (m) => m.id !== u.id && emailKey && (m.email || '').toLowerCase() === emailKey
    );
    if (dupe) map.delete(dupe.id);
    const existing = map.get(u.id);
    map.set(u.id, { ...existing, ...u, role: 'runner' });
  }
  return Array.from(map.values());
}

export function loadStoredRoster(): UserProfile[] {
  try {
    const raw =
      typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function'
        ? localStorage.getItem(STORAGE_KEYS.ROSTER)
        : null;
    if (raw) {
      const parsed: UserProfile[] = JSON.parse(raw);
      return mergeRoster(Array.isArray(parsed) ? parsed : []);
    }
  } catch (e) {
    console.error('Error loading roster:', e);
  }
  return [...INITIAL_ROSTER_USERS];
}

export function saveStoredRoster(roster: UserProfile[]): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function') {
      localStorage.setItem(STORAGE_KEYS.ROSTER, JSON.stringify(mergeRoster(roster)));
    }
  } catch (e) {
    console.error('Error saving roster:', e);
  }
}

/**
 * Pushes a single roster profile (athlete who joined through the invite link) to Cloudflare D1
 * so it shows up on the coach's device in "Select Athlete".
 */
export async function pushRosterUserToCloud(user: UserProfile): Promise<void> {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return;
  try {
    await fetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        googleSheetUrl: user.googleSheetUrl || null,
        googleSheetTab: user.googleSheetTab || null,
      }),
    });
  } catch (e) {
    console.warn('Unable to push roster profile to cloud:', e);
  }
}

/**
 * Fetches all invited athletes from Cloudflare D1 and merges them into the local roster.
 * Returns the merged roster (local roster unchanged if the network call fails).
 */
export async function syncRosterFromCloud(): Promise<UserProfile[]> {
  const local = loadStoredRoster();
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return local;
  try {
    const res = await fetch('/api/roster', { headers: { Accept: 'application/json' } });
    if (!res.ok) return local;
    const data = await res.json().catch(() => null);
    const remote: UserProfile[] = Array.isArray(data?.users)
      ? data.users.map((r: any) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          role: 'runner' as const,
          avatarUrl: r.avatar_url || '',
          googleSheetUrl: r.google_sheet_url || undefined,
          googleSheetTab: r.google_sheet_tab || undefined,
        }))
      : [];
    // Local entries win for sheet link metadata the coach set on this device
    const merged = mergeRoster([...remote, ...local]);
    saveStoredRoster(merged);
    return merged;
  } catch (e) {
    console.warn('Unable to sync roster from cloud:', e);
    return local;
  }
}

export function addAthleteToRoster(athlete: UserProfile): UserProfile[] {
  const currentRoster = loadStoredRoster();
  // The coach is already on the roster as himself; never demote him to runner
  if (athlete.id === COACH_PROFILE.id || isCoachEmail(athlete.email)) {
    return currentRoster;
  }
  const existingIdx = currentRoster.findIndex(
    (u) => u.id === athlete.id || u.email.toLowerCase() === athlete.email.toLowerCase()
  );
  let updated: UserProfile[];
  if (existingIdx >= 0) {
    updated = [...currentRoster];
    updated[existingIdx] = { ...currentRoster[existingIdx], ...athlete, role: 'runner' };
  } else {
    updated = [...currentRoster, { ...athlete, role: 'runner' }];
  }
  saveStoredRoster(updated);
  void pushRosterUserToCloud({ ...athlete, role: 'runner' });
  return mergeRoster(updated);
}

/**
 * Coach-only helper: saves or updates the Google Sheet URL and active tab linked to a specific athlete profile.
 */
export function updateAthleteGoogleSheetLink(
  athleteId: string,
  googleSheetUrl: string,
  googleSheetTab?: string
): UserProfile[] {
  const currentRoster = loadStoredRoster();
  const nowIso = new Date().toISOString();
  const exists = currentRoster.some((u) => u.id === athleteId);
  let updated: UserProfile[];
  if (exists) {
    updated = currentRoster.map((u) => {
      if (u.id === athleteId) {
        return {
          ...u,
          googleSheetUrl: googleSheetUrl.trim() || undefined,
          googleSheetTab: googleSheetTab || u.googleSheetTab || 'Indy',
          googleSheetLastSyncedAt: googleSheetUrl.trim() ? nowIso : undefined,
        };
      }
      return u;
    });
  } else {
    updated = [
      ...currentRoster,
      {
        id: athleteId,
        email: `${athleteId}@example.com`,
        name: athleteId === 'user_rob' ? 'Rob' : athleteId,
        role: 'runner',
        googleSheetUrl: googleSheetUrl.trim() || undefined,
        googleSheetTab: googleSheetTab || 'Indy',
        googleSheetLastSyncedAt: googleSheetUrl.trim() ? nowIso : undefined,
      },
    ];
  }
  saveStoredRoster(updated);
  return updated;
}

export function loadStoredAuthUsers(): RegisteredUser[] {
  try {
    const raw =
      typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function'
        ? localStorage.getItem(STORAGE_KEYS.AUTH_USERS)
        : null;
    if (raw) {
      const parsed: RegisteredUser[] = JSON.parse(raw);
      const cleaned = (Array.isArray(parsed) ? parsed : []).filter(
        (u) => !isRemovedExampleAccount(u)
      );
      if (cleaned.some((u) => u.email.toLowerCase() === COACH_EMAIL.toLowerCase())) {
        return cleaned;
      }
      return [{ ...COACH_PROFILE, password: 'password', createdAt: '2026-09-01' }, ...cleaned];
    }
  } catch (e) {
    console.error('Error loading auth users:', e);
  }
  return [{ ...COACH_PROFILE, password: 'password', createdAt: '2026-09-01' }];
}

export function saveStoredAuthUser(user: RegisteredUser): void {
  try {
    const list = loadStoredAuthUsers();
    const idx = list.findIndex((u) => u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      list[idx] = user;
    } else {
      list.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.AUTH_USERS, JSON.stringify(list));
  } catch (e) {
    console.error('Error saving auth user:', e);
  }
}

export function findAuthUserByEmail(email: string): RegisteredUser | undefined {
  const list = loadStoredAuthUsers();
  return list.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

export function sanitizeLegacyWorkouts(workouts: WorkoutRun[]): WorkoutRun[] {
  if (!Array.isArray(workouts) || workouts.length === 0) return [];
  let modified = false;
  const sanitized = workouts.map((w) => {
    if (!w.athleteId || w.athleteId === 'user_coach_1' || !w.athleteName) {
      modified = true;
      const comms = w.comments || '';
      const lowerName = (w.athleteName || '').toLowerCase();
      if (comms.includes('Forerunner 955') || lowerName.includes('robert') || lowerName.includes('reynoso')) {
        return { ...w, athleteId: 'user_1793563915467_10fr', athleteName: 'Robert Reynoso' };
      }
      if (
        comms.includes('265S') ||
        comms.includes('Strava App') ||
        lowerName.includes('elise') ||
        lowerName.includes('whisler')
      ) {
        return { ...w, athleteId: 'user_1793482686680_2wma', athleteName: 'Elise Whisler' };
      }
      return { ...w, athleteId: 'user_michael_carey', athleteName: w.athleteName || 'Michael Carey' };
    }
    return w;
  });

  if (modified && typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function') {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(sanitized));
    } catch {
      // ignore
    }
  }
  return sanitized;
}

export function loadStoredWorkouts(): WorkoutRun[] {
  try {
    const raw =
      typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function'
        ? localStorage.getItem(STORAGE_KEYS.WORKOUTS)
        : null;
    if (raw) {
      return sanitizeLegacyWorkouts(JSON.parse(raw));
    }
  } catch (e) {
    console.error('Error loading workouts from localStorage:', e);
  }
  // Start completely empty as requested - zero fake data or suggestions
  return [];
}

export function saveStoredWorkouts(workouts: WorkoutRun[]): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function') {
      localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(workouts));
    }
    syncWorkoutsWithCloudflare(workouts).catch(() => {});
    syncAssignedWorkoutsToCloud(workouts).catch(() => {});
  } catch (e) {
    console.error('Error saving workouts to localStorage:', e);
  }
}

export function loadStoredPlans(): TrainingPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PLANS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading plans:', e);
  }
  return [];
}

export function saveStoredPlans(plans: TrainingPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
  } catch (e) {
    console.error('Error saving plans:', e);
  }
}

export function loadStoredNotifications(): CoachNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
  return [];
}

export function saveStoredNotifications(notifs: CoachNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
  } catch (e) {
    console.error('Error saving notifications:', e);
  }
}

export function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Error loading settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

export function loadStoredUser(): UserProfile | null {
  try {
    let raw =
      typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function'
        ? localStorage.getItem(STORAGE_KEYS.USER)
        : null;
    if (
      !raw &&
      typeof sessionStorage !== 'undefined' &&
      typeof sessionStorage?.getItem === 'function'
    ) {
      raw = sessionStorage.getItem(STORAGE_KEYS.USER);
    }
    if (raw) {
      const parsed: UserProfile = JSON.parse(raw);
      if (parsed.id === 'user_default_1' || parsed.name === 'Runner') {
        return COACH_PROFILE;
      }
      // Guarantee only careyer1234@gmail.com can be coach
      if (isCoachEmail(parsed.email)) {
        return parsed;
      }
      // Deleted demo accounts (Elise, Rob, Alex River, Sarah Chen) must sign in again
      if (isRemovedExampleAccount(parsed)) {
        return null;
      }
      return { ...parsed, role: 'runner' };
    }
  } catch (e) {
    console.error('Error loading user:', e);
  }
  return null;
}

export function loadLastRememberedUser(): UserProfile | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage?.getItem !== 'function') {
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_USER);
    if (!raw) return null;
    const parsed: UserProfile = JSON.parse(raw);
    if (isCoachEmail(parsed.email)) {
      return parsed;
    }
    return { ...parsed, role: 'runner' };
  } catch {
    return null;
  }
}

export function clearStoredUser(): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.removeItem === 'function') {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
    if (
      typeof sessionStorage !== 'undefined' &&
      typeof sessionStorage?.removeItem === 'function'
    ) {
      sessionStorage.removeItem(STORAGE_KEYS.USER);
    }
  } catch (e) {
    console.error('Error clearing user:', e);
  }
}

export function saveStoredUser(user: UserProfile, keepSignedIn?: boolean): void {
  try {
    // Role protection: careyer1234@gmail.com is strictly the only coach profile
    const safeUser: UserProfile = isCoachEmail(user.email)
      ? user
      : { ...user, role: 'runner' };
    const serialized = JSON.stringify(safeUser);

    const hasLocal =
      typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function';
    const hasSession =
      typeof sessionStorage !== 'undefined' && typeof sessionStorage?.setItem === 'function';

    const shouldKeep =
      keepSignedIn !== undefined
        ? keepSignedIn
        : hasLocal
          ? localStorage.getItem(STORAGE_KEYS.KEEP_SIGNED_IN) !== 'false'
          : true;

    if (hasLocal) {
      localStorage.setItem(STORAGE_KEYS.KEEP_SIGNED_IN, shouldKeep ? 'true' : 'false');
      localStorage.setItem(STORAGE_KEYS.LAST_USER, serialized);
      if (shouldKeep) {
        localStorage.setItem(STORAGE_KEYS.USER, serialized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    }

    if (hasSession) {
      sessionStorage.setItem(STORAGE_KEYS.USER, serialized);
    }
  } catch (e) {
    console.error('Error saving user:', e);
  }
}

/**
 * Persists a user's Strava connection both locally (per-email) and to Cloudflare D1
 * so their Strava connection stays permanently linked across sessions, domains, and devices.
 */
export function saveUserStravaConnection(
  email: string,
  settings: Partial<AppSettings>
): void {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function') {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_STRAVA);
      const map: Record<string, Partial<AppSettings>> = raw ? JSON.parse(raw) : {};
      map[cleanEmail] = {
        ...(map[cleanEmail] || {}),
        stravaConnected: settings.stravaConnected,
        stravaClientId: settings.stravaClientId,
        stravaClientSecret: settings.stravaClientSecret,
        stravaAccessToken: settings.stravaAccessToken,
        stravaRefreshToken: settings.stravaRefreshToken,
        stravaExpiresAt: settings.stravaExpiresAt,
        stravaAthleteName: settings.stravaAthleteName,
        stravaAutoSync: settings.stravaAutoSync ?? true,
        stravaLastSyncTime: settings.stravaLastSyncTime,
      };
      localStorage.setItem(STORAGE_KEYS.USER_STRAVA, JSON.stringify(map));
    }
  } catch {
    // Ignore local storage error
  }

  // Also sync to Cloudflare D1 in the background
  if (typeof fetch === 'function') {
    fetch('/api/strava-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        stravaConnected: Boolean(settings.stravaConnected),
        clientId: settings.stravaClientId || '',
        clientSecret: settings.stravaClientSecret || '',
        accessToken: settings.stravaAccessToken || '',
        refreshToken: settings.stravaRefreshToken || '',
        expiresAt: settings.stravaExpiresAt || 0,
        athleteName: settings.stravaAthleteName || '',
      }),
    }).catch(() => {});
  }
}

/**
 * Loads a user's saved Strava connection from per-email localStorage or Cloudflare D1.
 */
export async function loadUserStravaConnection(
  email: string
): Promise<Partial<AppSettings> | null> {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function') {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_STRAVA);
      if (raw) {
        const map: Record<string, Partial<AppSettings>> = JSON.parse(raw);
        const localEntry = map[cleanEmail];
        if (
          localEntry &&
          localEntry.stravaConnected &&
          (localEntry.stravaAccessToken || localEntry.stravaRefreshToken)
        ) {
          return localEntry;
        }
      }
    }
  } catch {
    // Ignore local read error
  }

  // Fallback to Cloudflare D1 API
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(
        `/api/strava-connection?email=${encodeURIComponent(cleanEmail)}`
      );
      if (res.ok) {
        const data = await res.json();
        const conn = data?.connection;
        if (conn && (conn.access_token || conn.refresh_token)) {
          const restored: Partial<AppSettings> = {
            stravaConnected: true,
            stravaClientId: conn.client_id || undefined,
            stravaClientSecret: conn.client_secret || undefined,
            stravaAccessToken: conn.access_token || undefined,
            stravaRefreshToken: conn.refresh_token || undefined,
            stravaExpiresAt: conn.expires_at ? Number(conn.expires_at) : undefined,
            stravaAthleteName: conn.athlete_name || undefined,
            stravaAutoSync: true,
          };
          saveUserStravaConnection(cleanEmail, restored);
          return restored;
        }
      }
    } catch {
      // Offline mode
    }
  }

  return null;
}

// Background sync with Cloudflare Pages Functions / D1 API
export async function syncWorkoutsWithCloudflare(workouts: WorkoutRun[]): Promise<void> {
  if (typeof fetch === 'undefined' || !workouts || workouts.length === 0) return;
  try {
    const response = await fetch('/api/workouts/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts }),
    });
    if (!response.ok) {
      console.warn(`Cloudflare workouts sync responded with status: ${response.status}`);
      return;
    }
  } catch (err) {
    // Graceful offline mode warning
    console.warn('Unable to sync workouts to Cloudflare (offline or network error):', err);
  }
}

/**
 * Fetches workouts from Cloudflare D1 and merges them into local storage using reconcileStravaWorkouts.
 * When coachView=true (or athleteFilter='all' / omitted), pulls all athletes' workouts from GET /api/workouts?coachView=true
 * so athlete synced runs appear immediately in Coach View.
 */
export async function syncWorkoutsFromCloud(
  coachViewOrAthleteFilter: boolean | string = true
): Promise<WorkoutRun[]> {
  const local = loadStoredWorkouts();
  if (typeof fetch === 'undefined') {
    return local;
  }

  try {
    let url = '/api/workouts?coachView=true';
    if (typeof coachViewOrAthleteFilter === 'string') {
      if (coachViewOrAthleteFilter === 'all') {
        url = '/api/workouts?coachView=true';
      } else if (coachViewOrAthleteFilter) {
        url = `/api/workouts?athleteId=${encodeURIComponent(coachViewOrAthleteFilter)}`;
      }
    } else if (coachViewOrAthleteFilter === false) {
      url = '/api/workouts';
    }

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`Workouts sync from cloud returned status ${res.status}`);
      return local;
    }

    const data = await res.json().catch(() => null);
    const remoteWorkouts: WorkoutRun[] = Array.isArray(data?.workouts) ? data.workouts : [];
    if (remoteWorkouts.length === 0) {
      return local;
    }

    const merged = sanitizeLegacyWorkouts(reconcileStravaWorkouts(local, remoteWorkouts));
    if (typeof localStorage !== 'undefined' && typeof localStorage?.setItem === 'function') {
      try {
        localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(merged));
      } catch (e) {
        console.error('Error saving synced workouts to localStorage:', e);
      }
    }
    return merged;
  } catch (err) {
    console.warn('Unable to sync workouts from cloud (offline or network error):', err);
    return local;
  }
}

/**
 * Syncs assigned workouts into Cloudflare D1 so the daily morning workout email dispatcher
 * can look up the athlete's prescribed workout for the day.
 */
export async function syncAssignedWorkoutsToCloud(workouts: WorkoutRun[]): Promise<void> {
  if (typeof fetch === 'undefined' || !workouts || workouts.length === 0) return;
  try {
    // Sync runs that have an assigned date and are not deleted
    await fetch('/api/email-reminders/sync-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts }),
    });
  } catch {
    // Offline / non-blocking
  }
}

/**
 * Saves athlete daily workout & weekly plan email reminder preferences to Cloudflare D1
 */
export async function saveAthleteEmailPreferences(
  athleteId: string,
  email: string,
  name: string,
  enabled: boolean,
  preferredHour: number,
  timezone?: string,
  weeklyEnabled: boolean = true
): Promise<void> {
  if (typeof fetch === 'undefined' || !athleteId || !email) return;
  try {
    const tz = timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York');
    await fetch('/api/email-reminders/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athleteId,
        email,
        name,
        enabled,
        weeklyEnabled,
        preferredHour,
        timezone: tz,
      }),
    });
  } catch {
    // Offline / non-blocking
  }
}

/**
 * Loads athlete workout email reminder preferences from Cloudflare D1
 */
export async function loadAthleteEmailPreferences(
  athleteId: string
): Promise<{ enabled: boolean; weeklyEnabled?: boolean; preferredHour: number; timezone?: string } | null> {
  if (typeof fetch === 'undefined' || !athleteId) return null;
  try {
    const res = await fetch(`/api/email-reminders/preferences?athleteId=${encodeURIComponent(athleteId)}`);
    if (res.ok) {
      const data = await res.json();
      return data?.preferences || null;
    }
  } catch {
    // Offline
  }
  return null;
}
