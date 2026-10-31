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
  title?: string; // e.g. "Morning 10 Miler", "Threshold Repeats"
  startTime?: string; // e.g. "07:30" or "17:45"
  isPlanAssigned?: boolean;
  planId?: string;
  planDayIndex?: number;
  updatedAt?: string;
  athleteId?: string;
  athleteName?: string;
  assignedByCoachId?: string;
  assignedByCoachName?: string;
  athleteComment?: string;
  editReason?: string;
  durationSeconds?: number; // total duration in seconds (optional)
  durationFormatted?: string; // e.g. "1:04:15" or "45:30"
  paceSeconds?: number; // seconds per distance unit (e.g. 480 = 8:00 /mi or /km)
  paceFormatted?: string; // e.g. "8:00 /mi"
  rpe?: number; // Borg CR10 Rate of Perceived Exertion (1 to 10)
  feeling?: RunnerFeeling; // Post-run feeling state
  plannedDistance?: number; // Original distance assigned by coach (in distanceUnit)
  plannedPaceFormatted?: string; // Original target pace
  compliancePercent?: number; // Adherence percentage (e.g. 98)
  complianceStatus?: 'exact' | 'over' | 'under';
  shoeId?: string; // Running shoe used for this run
  shoeName?: string;
  source?: 'manual' | 'garmin' | 'strava' | 'file_import' | 'google_sheets';
  externalActivityId?: string;
  isTypeConfirmed?: boolean;
  deviceModel?: string; // e.g. "Garmin Forerunner 265", "Garmin Fenix 7"
  averageHeartRate?: number; // average bpm
  maxHeartRate?: number; // max bpm
  elevationGainMeters?: number; // meters
  elevationGainFeet?: number; // feet
  cadence?: number; // strides per minute (spm)
}

export type RunnerFeeling = 'fresh' | 'good' | 'normal' | 'tired' | 'exhausted';

export interface TargetRace {
  name: string; // e.g. "Boston Marathon"
  date: string; // YYYY-MM-DD
  targetTime?: string; // e.g. "3:15:00"
  distance?: number;
  distanceUnit?: DistanceUnit;
}

export interface RunningShoe {
  id: string;
  name: string; // e.g. "Nike Pegasus 41"
  brand?: string;
  totalMiles: number;
  maxMiles: number; // default 400
  isRetired: boolean;
  dateAdded: string;
  isDefault?: boolean; // automatically tagged on new runs
}

export interface QuickLogStaple {
  id: string;
  label?: string;
  distance: number;
  unit: DistanceUnit;
  runType: string;
  userId?: string;
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
  athleteId?: string;
  athleteName?: string;
  startDate: string; // YYYY-MM-DD
  weeksCount?: number; // 1, 2, 3, 4, etc.
  days: PlanDayItem[];
  createdAt: string;
  code: string; // short unique code for QR sharing
  sheetUrl?: string;
  sheetId?: string;
  sheetTabName?: string;
  lastSyncedAt?: string;
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
  googleSheetUrl?: string;
  googleSheetTab?: string;
  googleSheetLastSyncedAt?: string;
}

export interface RegisteredUser extends UserProfile {
  password?: string;
  invitedBy?: string;
  createdAt?: string;
}

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  distanceUnit: DistanceUnit;
  firstDayOfWeek: DayOfWeek; // 1 = Monday, 0 = Sunday
  warningThreshold: number; // default 1.2
  themeMode: ThemeMode; // 'dark' | 'light'
  targetRace?: TargetRace;
  shoes?: RunningShoe[];
  userQuickStaples?: Record<string, QuickLogStaple[]>;
  weeklyMileageTarget?: number; // e.g. 40.0 miles
  garminConnected?: boolean;
  garminAccountName?: string;
  garminAutoSync?: boolean;
  garminLastSyncTime?: string;
  stravaConnected?: boolean;
  stravaAthleteName?: string;
  stravaAthleteId?: string;
  stravaAccessToken?: string;
  stravaRefreshToken?: string;
  stravaExpiresAt?: number;
  stravaClientId?: string;
  stravaClientSecret?: string;
  stravaAutoSync?: boolean;
  stravaLastSyncTime?: string;
}
