import type {
  WorkoutRun,
  TrainingPlan,
  CoachNotification,
  UserProfile,
  AppSettings,
  RegisteredUser,
} from '../types/acr';

const STORAGE_KEYS = {
  WORKOUTS: 'acr_workouts_v2',
  PLANS: 'acr_plans_v2',
  NOTIFICATIONS: 'acr_notifications_v2',
  USER: 'acr_user_v2',
  SETTINGS: 'acr_settings_v2',
  ROSTER: 'acr_roster_v2',
  AUTH_USERS: 'hop_run_auth_users_v1',
};

export const DEFAULT_SETTINGS: AppSettings = {
  distanceUnit: 'mi',
  firstDayOfWeek: 1, // Monday
  warningThreshold: 1.2,
  themeMode: 'dark',
  weeklyMileageTarget: 35.0,
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

export const INITIAL_ROSTER_USERS: UserProfile[] = [
  COACH_PROFILE,
  COACH_ATHLETE_PROFILE,
  {
    id: 'user_elise',
    email: 'elise.runner@example.com',
    name: 'Elise',
    role: 'runner',
    avatarUrl: '',
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/13D1uqvpJUqH3DaE8-5fRWfkLAbrCKBZSTNoUrEzF0wg/edit?usp=sharing',
    googleSheetTab: 'Indy',
  },
  {
    id: 'user_rob',
    email: 'rob.athlete@example.com',
    name: 'Rob',
    role: 'runner',
    avatarUrl: '',
  },
  {
    id: 'runner_alex',
    email: 'alex.river@example.com',
    name: 'Alex River',
    role: 'runner',
    avatarUrl: '',
  },
  {
    id: 'runner_sarah',
    email: 'sarah.chen@example.com',
    name: 'Sarah Chen',
    role: 'runner',
    avatarUrl: '',
  },
];

export const ROSTER_USERS: UserProfile[] = INITIAL_ROSTER_USERS;

export const DEFAULT_USER: UserProfile = COACH_PROFILE;

export function loadStoredRoster(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROSTER);
    if (raw) {
      const parsed: UserProfile[] = JSON.parse(raw);
      // Map by ID, ensuring coach profile and coach athlete profile exist with correct roles
      const map = new Map<string, UserProfile>();
      for (const u of INITIAL_ROSTER_USERS) {
        map.set(u.id, u);
      }
      for (const u of parsed) {
        if (u.id === COACH_PROFILE.id) {
          map.set(u.id, COACH_PROFILE);
        } else if (u.id === COACH_ATHLETE_PROFILE.id) {
          map.set(u.id, {
            ...COACH_ATHLETE_PROFILE,
            googleSheetUrl: u.googleSheetUrl,
            googleSheetTab: u.googleSheetTab,
            googleSheetLastSyncedAt: u.googleSheetLastSyncedAt,
          });
        } else {
          // Every other account is strictly runner
          const initialMatch = INITIAL_ROSTER_USERS.find((init) => init.id === u.id);
          map.set(u.id, {
            ...initialMatch,
            ...u,
            role: 'runner',
          });
        }
      }
      return Array.from(map.values());
    }
  } catch (e) {
    console.error('Error loading roster:', e);
  }
  return INITIAL_ROSTER_USERS;
}

export function saveStoredRoster(roster: UserProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ROSTER, JSON.stringify(roster));
  } catch (e) {
    console.error('Error saving roster:', e);
  }
}

export function addAthleteToRoster(athlete: UserProfile): UserProfile[] {
  const currentRoster = loadStoredRoster();
  const existingIdx = currentRoster.findIndex(
    (u) => u.id === athlete.id || u.email.toLowerCase() === athlete.email.toLowerCase()
  );
  let updated: UserProfile[];
  if (existingIdx >= 0) {
    updated = [...currentRoster];
    updated[existingIdx] = { ...athlete, role: 'runner' };
  } else {
    updated = [...currentRoster, { ...athlete, role: 'runner' }];
  }
  saveStoredRoster(updated);
  return updated;
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
  const updated = currentRoster.map((u) => {
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
  saveStoredRoster(updated);
  return updated;
}

export function loadStoredAuthUsers(): RegisteredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading auth users:', e);
  }
  return [
    { ...COACH_PROFILE, password: 'password', createdAt: '2026-09-01' },
    { ...COACH_ATHLETE_PROFILE, password: 'password', createdAt: '2026-09-01' },
    {
      id: 'user_rob',
      email: 'rob.athlete@example.com',
      name: 'Rob',
      role: 'runner',
      password: 'password',
      createdAt: '2026-09-01',
    },
  ];
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

export function loadStoredWorkouts(): WorkoutRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WORKOUTS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading workouts from localStorage:', e);
  }
  // Start completely empty as requested - zero fake data or suggestions
  return [];
}

export function saveStoredWorkouts(workouts: WorkoutRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(workouts));
    syncWorkoutsWithCloudflare(workouts).catch(() => {});
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
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (raw) {
      const parsed: UserProfile = JSON.parse(raw);
      if (parsed.id === 'user_default_1' || parsed.name === 'Runner') {
        return COACH_PROFILE;
      }
      // Guarantee only careyer1234@gmail.com can be coach
      if (isCoachEmail(parsed.email)) {
        return parsed;
      }
      return { ...parsed, role: 'runner' };
    }
  } catch (e) {
    console.error('Error loading user:', e);
  }
  return null;
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER);
  } catch (e) {
    console.error('Error clearing user:', e);
  }
}

export function saveStoredUser(user: UserProfile): void {
  try {
    // Role protection: careyer1234@gmail.com is strictly the only coach profile
    const safeUser: UserProfile = isCoachEmail(user.email)
      ? user
      : { ...user, role: 'runner' };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(safeUser));
  } catch (e) {
    console.error('Error saving user:', e);
  }
}

// Background sync with Cloudflare Pages Functions / D1 API
async function syncWorkoutsWithCloudflare(workouts: WorkoutRun[]): Promise<void> {
  try {
    const response = await fetch('/api/workouts/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workouts }),
    });
    if (!response.ok) return;
  } catch {
    // Offline mode
  }
}
