import React, { useState, useEffect, useMemo } from 'react';
import type {
  WorkoutRun,
  TrainingPlan,
  CoachNotification,
  UserProfile,
  AppSettings,
  DistanceUnit,
  DayOfWeek,
  UserRole,
  ThemeMode,
} from './types/acr';
import {
  loadStoredWorkouts,
  saveStoredWorkouts,
  loadStoredPlans,
  saveStoredPlans,
  loadStoredNotifications,
  saveStoredNotifications,
  loadStoredSettings,
  saveStoredSettings,
  loadStoredUser,
  saveStoredUser,
} from './utils/storage';
import {
  buildWeeklyWorkloadData,
  calculateInWeekPrediction,
  formatDate,
  getWeekStartDate,
} from './utils/calculations';
import { decompressPlan } from './utils/planShare';
import { Header } from './components/Header';
import type { ActiveNavTab } from './components/Header';
import { LogRunTab } from './components/LogRunTab';
import { WorkoutsTab } from './components/WorkoutsTab';
import { TrainingLogTab } from './components/TrainingLogTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { SettingsTab } from './components/SettingsTab';
import { InWeekWarningBanner } from './components/InWeekWarningBanner';
import { AdminPlanModal } from './components/AdminPlanModal';
import { PlanViewerModal } from './components/PlanViewerModal';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { AssignRunModal } from './components/AssignRunModal';

export const App: React.FC = () => {
  // Core state
  const [workouts, setWorkouts] = useState<WorkoutRun[]>(() => loadStoredWorkouts());
  const [plans, setPlans] = useState<TrainingPlan[]>(() => loadStoredPlans());
  const [notifications, setNotifications] = useState<CoachNotification[]>(() =>
    loadStoredNotifications()
  );
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => loadStoredUser());

  // UI Navigation state: defaults to Log Run (Today)
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('log_run');
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(new Date()));

  // Active training week based on selectedDate
  const activeWeekStartDate = useMemo(() => {
    return getWeekStartDate(selectedDate, settings.firstDayOfWeek);
  }, [selectedDate, settings.firstDayOfWeek]);

  // Modals state
  const [isPlanBuilderOpen, setIsPlanBuilderOpen] = useState(false);
  const [isPlanViewerOpen, setIsPlanViewerOpen] = useState(false);
  const [activeViewPlan, setActiveViewPlan] = useState<TrainingPlan | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAssignRunOpen, setIsAssignRunOpen] = useState(false);

  // Check URL parameters on mount for QR code scanned plans
  useEffect(() => {
    const parseUrlPlan = async () => {
      const params = new URLSearchParams(window.location.search);
      const compressedPayload = params.get('p');
      const planCode = params.get('plan') || params.get('code');
      const planData = params.get('data');

      // 1. High-efficiency compressed plan from QR code
      if (compressedPayload) {
        const decoded = await decompressPlan(compressedPayload);
        if (decoded) {
          setActiveViewPlan(decoded);
          setIsPlanViewerOpen(true);
          return;
        }
      }

      // 2. Legacy uncompressed plan data
      if (planData) {
        try {
          const parsedPlan: TrainingPlan = JSON.parse(decodeURIComponent(planData));
          setActiveViewPlan(parsedPlan);
          setIsPlanViewerOpen(true);
          return;
        } catch (e) {
          console.error('Failed to parse plan from URL:', e);
        }
      }

      // 3. Plan code lookup from local/stored plans
      if (planCode) {
        const match = plans.find((p) => p.code === planCode);
        if (match) {
          setActiveViewPlan(match);
          setIsPlanViewerOpen(true);
        }
      }
    };

    parseUrlPlan();
  }, [plans]);

  // Recalculate weeks workload data
  const weeks = useMemo(() => {
    return buildWeeklyWorkloadData(workouts, settings.firstDayOfWeek, settings.warningThreshold);
  }, [workouts, settings.firstDayOfWeek, settings.warningThreshold]);

  // Current active week in the workload calculations
  const currentWeek = useMemo(() => {
    const matched = weeks.find((w) => w.startDate === activeWeekStartDate);
    if (matched) return matched;
    return weeks[weeks.length - 1];
  }, [weeks, activeWeekStartDate]);

  // Runs logged on the currently selected date
  const runsForSelectedDate = useMemo(() => {
    return workouts
      .filter((w) => w.workoutDate === selectedDate)
      .sort((a, b) => a.runOrder - b.runOrder);
  }, [workouts, selectedDate]);

  // In-week mid-week warning and prediction
  const inWeekPrediction = useMemo(() => {
    if (!currentWeek) {
      return {
        daysElapsed: 0,
        completedLoad: 0,
        plannedRemainingLoad: 0,
        projectedTotalAcute: 0,
        currentAcr: null,
        projectedAcr: null,
        hasAlreadyExceeded: false,
        isPredictedToExceed: false,
        baselineChronic: null,
        safeMaxLoadForWeek: null,
        remainingSafeLoad: null,
        message: 'No workouts logged for this week yet.',
        severity: 'normal' as const,
      };
    }
    return calculateInWeekPrediction(currentWeek, weeks, settings.warningThreshold);
  }, [currentWeek, weeks, settings.warningThreshold]);

  // Handlers for workouts
  const handleSaveRun = (run: WorkoutRun) => {
    setWorkouts((prev) => {
      const existingIdx = prev.findIndex((r) => r.id === run.id);
      let updated: WorkoutRun[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = run;
      } else {
        updated = [...prev, run];
      }
      saveStoredWorkouts(updated);
      return updated;
    });
  };

  const handleDeleteRun = (runId: string) => {
    setWorkouts((prev) => {
      const updated = prev.filter((r) => r.id !== runId);
      saveStoredWorkouts(updated);
      return updated;
    });
  };

  // Athlete editing from plan or input
  const handleAthleteEdit = (run: WorkoutRun) => {
    if (currentUser.role === 'runner') {
      const notif: CoachNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        athleteId: currentUser.id,
        athleteName: currentUser.name,
        type: 'edited',
        date: run.workoutDate,
        runType: run.runType,
        distance: run.distance,
        unit: run.distanceUnit,
        comment: run.comments || 'Workout modified',
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => {
        const next = [notif, ...prev];
        saveStoredNotifications(next);
        return next;
      });
    }
  };

  // Athlete confirming day from scanned plan
  const handleConfirmPlanDay = (run: WorkoutRun, notification: CoachNotification) => {
    handleSaveRun(run);
    setNotifications((prev) => {
      const next = [notification, ...prev];
      saveStoredNotifications(next);
      return next;
    });
  };

  // Synchronize active theme attribute with document root
  useEffect(() => {
    const theme = settings.themeMode || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [settings.themeMode]);

  // Settings handlers
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveStoredSettings(updated);
  };

  const handleThemeChange = (theme: ThemeMode) => {
    handleUpdateSettings({ themeMode: theme });
  };

  const handleUnitChange = (unit: DistanceUnit) => {
    handleUpdateSettings({ distanceUnit: unit });
  };

  const handleFirstDayChange = (day: DayOfWeek) => {
    handleUpdateSettings({ firstDayOfWeek: day });
  };

  // User and role handlers
  const handleSwitchUser = (user: UserProfile) => {
    setCurrentUser(user);
    saveStoredUser(user);
  };

  const handleToggleRole = () => {
    const nextRole: UserRole = currentUser.role === 'coach' ? 'runner' : 'coach';
    const updated: UserProfile = { ...currentUser, role: nextRole };
    setCurrentUser(updated);
    saveStoredUser(updated);
  };

  // Notification handlers
  const handleMarkAllRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveStoredNotifications(updated);
      return updated;
    });
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
    saveStoredNotifications([]);
  };

  // Plan handlers
  const handleSavePlan = (plan: TrainingPlan) => {
    setPlans((prev) => {
      const existingIdx = prev.findIndex((p) => p.id === plan.id);
      let updated: TrainingPlan[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = plan;
      } else {
        updated = [plan, ...prev];
      }
      saveStoredPlans(updated);
      return updated;
    });
  };

  const handleOpenAsAthlete = (plan: TrainingPlan) => {
    setActiveViewPlan(plan);
    setIsPlanBuilderOpen(false);
    setIsPlanViewerOpen(true);
  };

  // Coach recurring runs assignment handler
  const handleAssignRuns = (newRuns: WorkoutRun[], notificationText: string) => {
    setWorkouts((prev) => {
      const updated = [...prev, ...newRuns];
      saveStoredWorkouts(updated);
      return updated;
    });

    const notif: CoachNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      athleteId: currentUser.id,
      athleteName: currentUser.name,
      type: 'edited',
      date: newRuns[0]?.workoutDate || formatDate(new Date()),
      runType: newRuns[0]?.runType || 'easy',
      distance: newRuns[0]?.distance || 0,
      unit: newRuns[0]?.distanceUnit || 'mi',
      comment: notificationText,
      timestamp: Date.now(),
      read: false,
    };

    setNotifications((prev) => {
      const updated = [notif, ...prev];
      saveStoredNotifications(updated);
      return updated;
    });
  };

  return (
    <div className="app-shell">
      {/* Header with Unit toggle, Week start, Plan Builder, and Google profile */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        distanceUnit={settings.distanceUnit}
        onUnitChange={handleUnitChange}
        firstDayOfWeek={settings.firstDayOfWeek}
        onFirstDayChange={handleFirstDayChange}
        themeMode={settings.themeMode || 'dark'}
        onThemeChange={handleThemeChange}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenPlanBuilder={() => setIsPlanBuilderOpen(true)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllRead}
        onClearAllNotifications={handleClearAllNotifications}
        onToggleRole={handleToggleRole}
        onOpenAssignRun={() => setIsAssignRunOpen(true)}
      />

      <main className="main-content">
        {/* Prominent In-Week Exceedance / Prediction Warning Banner */}
        <InWeekWarningBanner
          prediction={inWeekPrediction}
          warningThreshold={settings.warningThreshold}
        />

        {/* Tab 1: Log Run (Today's date by default, calendar icon to switch days) */}
        {activeTab === 'log_run' && (
          <LogRunTab
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            runsForSelectedDate={runsForSelectedDate}
            currentWeek={currentWeek}
            onSaveRun={handleSaveRun}
            onDeleteRun={handleDeleteRun}
            distanceUnit={settings.distanceUnit}
            onAthleteEdit={handleAthleteEdit}
            isCoach={currentUser.role === 'coach'}
            onOpenAssignRun={() => setIsAssignRunOpen(true)}
          />
        )}

        {/* Tab 2: Workouts (Strava-Inspired Activity Feed) */}
        {activeTab === 'workouts' && (
          <WorkoutsTab
            workouts={workouts}
            distanceUnit={settings.distanceUnit}
            onEditWorkoutDate={(date) => {
              setSelectedDate(date);
              setActiveTab('log_run');
            }}
            onDeleteWorkout={handleDeleteRun}
          />
        )}

        {/* Tab 3: Training Log (Week View & Month View) */}
        {activeTab === 'training_log' && (
          <TrainingLogTab
            weeks={weeks}
            activeWeekStartDate={activeWeekStartDate}
            onSelectWeekStart={(startDate) => {
              setSelectedDate(startDate);
            }}
            onSelectDay={(date) => {
              setSelectedDate(date);
              setActiveTab('log_run');
            }}
            distanceUnit={settings.distanceUnit}
            warningThreshold={settings.warningThreshold}
            workouts={workouts}
          />
        )}

        {/* Tab 4: Analytics (Custom windows, SVG charts, In-Week calculations, clean CSV export) */}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            weeks={weeks}
            currentWeek={currentWeek}
            distanceUnit={settings.distanceUnit}
            onSelectWeek={(startDate) => {
              setSelectedDate(startDate);
              setActiveTab('log_run');
            }}
            warningThreshold={settings.warningThreshold}
          />
        )}

        {/* Tab 5: Settings (Appearance / Theme Mode, Units, Schedules, ACR Thresholds) */}
        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            currentUser={currentUser}
            onToggleRole={handleToggleRole}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Admin Plan Builder & QR Code Modal */}
      <AdminPlanModal
        isOpen={isPlanBuilderOpen}
        onClose={() => setIsPlanBuilderOpen(false)}
        currentUser={currentUser}
        plans={plans}
        onSavePlan={handleSavePlan}
        distanceUnit={settings.distanceUnit}
        onOpenAsAthlete={handleOpenAsAthlete}
        onOpenAssignRun={() => setIsAssignRunOpen(true)}
      />

      {/* Coach Assign Run Modal */}
      <AssignRunModal
        isOpen={isAssignRunOpen}
        onClose={() => setIsAssignRunOpen(false)}
        currentUser={currentUser}
        distanceUnit={settings.distanceUnit}
        onAssignRuns={handleAssignRuns}
        activeDate={selectedDate}
      />

      {/* Athlete Plan Viewer Modal (Triggered by QR Code Scan) */}
      <PlanViewerModal
        isOpen={isPlanViewerOpen}
        onClose={() => setIsPlanViewerOpen(false)}
        plan={activeViewPlan}
        currentUser={currentUser}
        onConfirmDay={handleConfirmPlanDay}
        distanceUnit={settings.distanceUnit}
      />

      {/* Google Authentication & Role Switcher Modal */}
      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
      />
    </div>
  );
};

export default App;
