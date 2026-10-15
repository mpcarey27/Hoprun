import type {
  WorkoutRun,
  TrainingPlan,
  CoachNotification,
  UserProfile,
  AppSettings,
} from '../types/acr';

const STORAGE_KEYS = {
  WORKOUTS: 'acr_workouts_v2',
  PLANS: 'acr_plans_v2',
  NOTIFICATIONS: 'acr_notifications_v2',
  USER: 'acr_user_v2',
  SETTINGS: 'acr_settings_v2',
};

export const DEFAULT_SETTINGS: AppSettings = {
  distanceUnit: 'mi',
  firstDayOfWeek: 1, // Monday
  warningThreshold: 1.2,
  themeMode: 'dark',
};

export const DEFAULT_USER: UserProfile = {
  id: 'user_default_1',
  email: 'runner@example.com',
  name: 'Runner',
  role: 'runner',
  avatarUrl: '',
};

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

export function loadStoredUser(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading user:', e);
  }
  return DEFAULT_USER;
}

export function saveStoredUser(user: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
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
