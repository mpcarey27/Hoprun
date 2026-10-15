export type DistanceUnit = 'mi' | 'km';

export type UserRole = 'runner' | 'coach';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon, etc.

export interface RunTypeDefinition {
  id: string;
  name: string;
  multiplier: number;
  color: string;
}

export interface WorkoutRun {
  id: string;
  workoutDate: string; // YYYY-MM-DD
  runOrder: number; // 1, 2, ...
  distance: number; // in miles (stored internally in miles or native unit)
  distanceUnit: DistanceUnit; // unit entered
  runType: string; // matches RunTypeDefinition.id
  multiplier: number;
  load: number; // distance * multiplier
  comments: string; // "how I felt, how workout went"
  completed: boolean;
  isPlanAssigned?: boolean;
  planId?: string;
  planDayIndex?: number;
  updatedAt?: string;
}

export interface DayWorkload {
  date: string;
  dayIndex: number; // 0..6
  dayName: string; // e.g. "Mon"
  runs: WorkoutRun[];
  totalDistanceMi: number;
  totalDistanceKm: number;
  totalLoad: number;
}

export interface WeekWorkload {
  weekNumber: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: DayWorkload[];
  totalMiles: number;
  totalKm: number;
  acuteWorkload: number; // Sum of daily loads
  chronicWorkload: number | null; // 4-week average acute workload
  acr: number | null; // acute / chronic
  status: 'safe' | 'warning' | 'deload' | 'baseline';
  projectedAcute?: number;
  projectedAcr?: number;
}

export interface PlanDayItem {
  dayIndex: number; // 0..6 (Mon = 0, etc.)
  runType: string;
  targetDistance: number;
  distanceUnit: DistanceUnit;
  instructions: string;
}

export interface TrainingPlan {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  startDate: string; // YYYY-MM-DD
  weeksCount?: number; // 1, 2, 3, 4, etc.
  days: PlanDayItem[];
  createdAt: string;
  code: string; // short unique code for QR sharing
}

export interface CoachNotification {
  id: string;
  planId?: string;
  athleteId: string;
  athleteName: string;
  type: 'completed' | 'edited';
  date: string;
  runType: string;
  distance: number;
  unit: DistanceUnit;
  comment: string;
  timestamp: number;
  read: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  googleId?: string;
}

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  distanceUnit: DistanceUnit;
  firstDayOfWeek: DayOfWeek; // 1 = Monday, 0 = Sunday
  warningThreshold: number; // default 1.2
  themeMode: ThemeMode; // 'dark' | 'light'
}
