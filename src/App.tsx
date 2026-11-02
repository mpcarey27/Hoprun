import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  WorkoutRun,
  TrainingPlan,
  CoachNotification,
  UserProfile,
  AppSettings,
  DistanceUnit,
  DayOfWeek,
  ThemeMode,
  QuickLogStaple,
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
  clearStoredUser,
  loadStoredRoster,
  addAthleteToRoster,
  syncRosterFromCloud,
  syncWorkoutsFromCloud,
  COACH_EMAIL,
  COACH_PROFILE,
  COACH_ATHLETE_PROFILE,
  isCoachEmail,
  saveUserStravaConnection,
  loadUserStravaConnection,
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
import { WorkoutsTab } from './components/WorkoutsTab';
import { TrainingLogTab } from './components/TrainingLogTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { SettingsTab } from './components/SettingsTab';
import { InWeekWarningBanner } from './components/InWeekWarningBanner';
import { AdminPlanModal } from './components/AdminPlanModal';
import { PlanViewerModal } from './components/PlanViewerModal';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { AssignRunModal } from './components/AssignRunModal';
import { LogRunModal } from './components/LogRunModal';
import { AssignedRunsModal } from './components/AssignedRunsModal';
import { LoginPage } from './components/LoginPage';
import { InviteAthletesModal } from './components/InviteAthletesModal';
import { StravaConnectModal } from './components/StravaConnectModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  DEFAULT_MASTER_STRAVA_CLIENT_ID,
  exchangeStravaCode,
  refreshStravaToken,
  fetchAllStravaActivitiesSince,
  parseDateToEpochSeconds,
  normalizeStravaActivity,
  decodeStravaOAuthState,
  reconcileStravaWorkouts,
} from './utils/stravaSync';

const globalProcessedStravaCodes = new Set<string>();

export const App: React.FC = () => {
  // Core state
  const [workouts, setWorkouts] = useState<WorkoutRun[]>(() => loadStoredWorkouts());
  const [plans, setPlans] = useState<TrainingPlan[]>(() => loadStoredPlans());
  const [notifications, setNotifications] = useState<CoachNotification[]>(() =>
    loadStoredNotifications()
  );
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => loadStoredUser());
  const [roster, setRoster] = useState<UserProfile[]>(() => loadStoredRoster());

  // URL Invite Parameter (?invite=careyer1234@gmail.com)
  const [inviteCoachEmail] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('invite');
    }
    return null;
  });

  // UI Navigation state: defaults to Workouts (Strava Activity Feed)
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('workouts');
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
  const [isAssignedRunsOpen, setIsAssignedRunsOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isStravaModalOpen, setIsStravaModalOpen] = useState(false);
  const [stravaOAuthStatus, setStravaOAuthStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const processedStravaCodesRef = useRef<Set<string>>(new Set());

  // Strava-Style Log Run / Edit Run Pop-up Modal State
  const [isLogRunModalOpen, setIsLogRunModalOpen] = useState(false);
  const [runToEdit, setRunToEdit] = useState<WorkoutRun | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>(() => formatDate(new Date()));

  const handleOpenLogRun = (date?: string) => {
    setRunToEdit(null);
    setModalDefaultDate(date || selectedDate || formatDate(new Date()));
    setIsLogRunModalOpen(true);
  };

  const handleOpenEditRun = (run: WorkoutRun) => {
    setRunToEdit(run);
    setModalDefaultDate(run.workoutDate);
    setIsLogRunModalOpen(true);
  };

  const handleCloseLogRunModal = () => {
    setIsLogRunModalOpen(false);
    setRunToEdit(null);
  };

  const handleSaveModalRun = (run: WorkoutRun) => {
    handleSaveRun(run);
    if (currentUser?.role === 'runner' && runToEdit) {
      handleAthleteEdit(run);
    }
  };

  const handleDeleteModalRun = (runId: string) => {
    handleDeleteRun(runId);
  };

  // Check URL parameters on mount for QR code scanned plans
  useEffect(() => {
    const parseUrlPlan = async () => {
      const params = new URLSearchParams(window.location.search);
      const compressedPayload = params.get('p');
      const planCode =
        params.get('plan') ||
        (!params.has('scope') && !params.has('state') ? params.get('code') : null);
      const planData = params.get('data');

      // 0. Strava OAuth Callback (?code=XYZ&scope=... or ?error=...)
      const stravaCode = params.get('code');
      const stravaError = params.get('error');
      const decodedState = decodeStravaOAuthState(params.get('state'));

      if (stravaError) {
        window.history.replaceState({}, document.title, window.location.pathname);
        console.warn('Strava authorization was cancelled or denied:', stravaError);
        if (!currentUser && !loadStoredUser()) {
          setCurrentUser(COACH_PROFILE);
          saveStoredUser(COACH_PROFILE);
        }
        setStravaOAuthStatus({
          type: 'error',
          message: `Strava authorization was cancelled or denied (${stravaError}). Please try again.`,
        });
        setIsStravaModalOpen(true);
        return;
      }

      if (stravaCode && (params.get('scope') !== null || params.has('scope') || decodedState)) {
        // If user initiated OAuth from another origin (e.g., https://www.hoprun.app) using localhost compatibility
        // and local dev server caught the redirect, bounce back to the originating domain
        if (
          decodedState?.origin &&
          decodedState.origin !== window.location.origin &&
          window.location.hostname === 'localhost'
        ) {
          window.location.href = `${decodedState.origin}${window.location.pathname}${window.location.search}`;
          return;
        }

        // Guard against React 19 StrictMode double-execution or dependency re-renders
        if (
          processedStravaCodesRef.current.has(stravaCode) ||
          globalProcessedStravaCodes.has(stravaCode)
        ) {
          return;
        }
        processedStravaCodesRef.current.add(stravaCode);
        globalProcessedStravaCodes.add(stravaCode);

        // Immediately clean ?code=...&scope=...&state=... from URL
        window.history.replaceState({}, document.title, window.location.pathname);

        const freshSettings = loadStoredSettings();
        const effectiveClientId =
          decodedState?.clientId ||
          settings.stravaClientId ||
          freshSettings.stravaClientId ||
          DEFAULT_MASTER_STRAVA_CLIENT_ID;
        const effectiveClientSecret =
          decodedState?.clientSecret ||
          settings.stravaClientSecret ||
          freshSettings.stravaClientSecret ||
          '';

        try {
          const tokenData = await exchangeStravaCode(
            effectiveClientId,
            effectiveClientSecret,
            stravaCode,
            {
              athleteEmail: decodedState?.athleteEmail || currentUser?.email,
              athleteName: decodedState?.athleteName || currentUser?.name,
            }
          );

          const stravaAthleteName = tokenData.athlete
            ? `${tokenData.athlete.firstname || ''} ${tokenData.athlete.lastname || ''}`.trim()
            : '';

          // Resolve which athlete this Strava account belongs to
          const currentRoster = loadStoredRoster();
          let matchedAthlete: UserProfile | undefined = undefined;

          if (decodedState?.athleteId) {
            matchedAthlete = currentRoster.find((u) => u.id === decodedState.athleteId);
          }
          if (!matchedAthlete && decodedState?.athleteEmail) {
            matchedAthlete = currentRoster.find(
              (u) => u.email?.toLowerCase() === decodedState.athleteEmail!.toLowerCase()
            );
          }
          if (!matchedAthlete && stravaAthleteName) {
            const lowerStrava = stravaAthleteName.toLowerCase();
            matchedAthlete = currentRoster.find((u) => {
              const uLower = u.name.trim().toLowerCase();
              return uLower === lowerStrava || lowerStrava.includes(uLower) || uLower.includes(lowerStrava);
            });
          }
          if (!matchedAthlete && currentUser && currentUser.role === 'runner') {
            matchedAthlete = currentUser;
          }
          if (!matchedAthlete) {
            if (stravaAthleteName && !stravaAthleteName.toLowerCase().includes('michael carey')) {
              const newEmail =
                decodedState?.athleteEmail ||
                `${stravaAthleteName.toLowerCase().replace(/\s+/g, '.')}@athlete.hoprun.app`;
              const autoNewAthlete: UserProfile = {
                id: decodedState?.athleteId || `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: stravaAthleteName,
                email: newEmail,
                role: 'runner',
              };
              const updatedRoster = addAthleteToRoster(autoNewAthlete);
              setRoster(updatedRoster);
              matchedAthlete = autoNewAthlete;
            } else {
              matchedAthlete = currentUser || COACH_PROFILE;
            }
          }

          if (!currentUser && !loadStoredUser()) {
            const userToSet = matchedAthlete.role === 'runner' ? matchedAthlete : COACH_PROFILE;
            setCurrentUser(userToSet);
            saveStoredUser(userToSet);
          }

          const targetAthleteId = matchedAthlete.id;
          const targetAthleteName = matchedAthlete.name || stravaAthleteName || 'Strava Athlete';

          const effectiveStartDate =
            settings.stravaSyncStartDate || freshSettings.stravaSyncStartDate || '2026-01-01';
          const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);
          const activities = await fetchAllStravaActivitiesSince(
            tokenData.access_token,
            afterEpoch,
            {
              clientId: effectiveClientId,
              clientSecret: effectiveClientSecret,
              refreshToken: tokenData.refresh_token,
              athleteEmail: matchedAthlete.email || currentUser?.email,
              onTokenRefreshed: (refreshed) => {
                handleUpdateSettings({
                  stravaAccessToken: refreshed.access_token,
                  stravaRefreshToken: refreshed.refresh_token,
                  stravaExpiresAt: refreshed.expires_at,
                });
              },
            }
          );
          const defaultShoe = (settings.shoes || freshSettings.shoes || []).find(
            (s) => !s.isRetired && s.isDefault
          );
          const unit = settings.distanceUnit || freshSettings.distanceUnit || 'mi';

          const normalizedWorkouts = activities.map((act) =>
            normalizeStravaActivity(
              act,
              unit,
              targetAthleteId,
              targetAthleteName,
              defaultShoe?.id,
              defaultShoe?.name
            )
          );

          if (normalizedWorkouts.length > 0) {
            handleBatchImportWorkouts(normalizedWorkouts);
          }

          // Select this athlete's tab so their calendar is immediately displayed
          setSelectedAthleteFilter(targetAthleteId);

          handleUpdateSettings({
            stravaClientId: effectiveClientId,
            stravaClientSecret: effectiveClientSecret || undefined,
            stravaConnected: true,
            stravaAccessToken: tokenData.access_token,
            stravaRefreshToken: tokenData.refresh_token,
            stravaExpiresAt: tokenData.expires_at,
            stravaAthleteName: targetAthleteName,
            stravaAutoSync: true,
            stravaLastSyncTime: new Date().toISOString(),
          });

          setStravaOAuthStatus({
            type: 'success',
            message: `✓ Strava Connected! Synced ${normalizedWorkouts.length} runs from ${targetAthleteName}.`,
          });
          setIsStravaModalOpen(true);
        } catch (err: any) {
          console.error('Strava OAuth callback error:', err);
          setStravaOAuthStatus({
            type: 'error',
            message:
              err?.message ||
              'Failed to exchange Strava authorization code. Please verify your Client ID and Client Secret.',
          });
          setIsStravaModalOpen(true);
        }
        return;
      }

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

  // Automatically re-sync Strava every time the user opens the app (and on tab visibility / window focus)
  const lastAutoSyncTimeRef = useRef<number>(0);
  const isAutoSyncingRef = useRef<boolean>(false);
  const [isStravaAutoSyncing, setIsStravaAutoSyncing] = useState<boolean>(false);

  // Pull invited athletes and sync workouts from Cloudflare D1 whenever user opens app (and on tab focus)
  useEffect(() => {
    let cancelled = false;

    const refreshData = async () => {
      if (currentUser?.role === 'coach') {
        const mergedRoster = await syncRosterFromCloud();
        if (!cancelled && mergedRoster) setRoster(mergedRoster);
      }

      try {
        const isCoach = !currentUser || currentUser.role === 'coach';
        const syncedWorkouts = await syncWorkoutsFromCloud(isCoach ? true : currentUser.id);
        if (!cancelled && syncedWorkouts && syncedWorkouts.length > 0) {
          setWorkouts(syncedWorkouts);
        }
      } catch (err) {
        console.warn('Unable to sync workouts from cloud on focus:', err);
      }
    };

    void refreshData();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshData();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code')) {
      return;
    }

    const runAutoStravaSync = async () => {
      if (isAutoSyncingRef.current) return;

      let freshSettings = loadStoredSettings();
      let isConnected = Boolean(
        (settings.stravaConnected || freshSettings.stravaConnected) &&
          (settings.stravaAccessToken ||
            freshSettings.stravaAccessToken ||
            settings.stravaRefreshToken ||
            freshSettings.stravaRefreshToken)
      );

      // Restore per-user Strava connection from local backup or Cloudflare D1 if missing
      if (!isConnected && currentUser.email) {
        const restored = await loadUserStravaConnection(currentUser.email);
        if (
          restored &&
          restored.stravaConnected &&
          (restored.stravaAccessToken || restored.stravaRefreshToken)
        ) {
          freshSettings = { ...freshSettings, ...restored };
          handleUpdateSettings(restored);
          isConnected = true;
        }
      }

      if (!isConnected || isAutoSyncingRef.current) return;

      const accessToken = settings.stravaAccessToken || freshSettings.stravaAccessToken || '';
      const refreshToken = settings.stravaRefreshToken || freshSettings.stravaRefreshToken;
      const clientId =
        settings.stravaClientId || freshSettings.stravaClientId || DEFAULT_MASTER_STRAVA_CLIENT_ID;
      const clientSecret = settings.stravaClientSecret || freshSettings.stravaClientSecret;
      const expiresAt = settings.stravaExpiresAt || freshSettings.stravaExpiresAt;

      if (!accessToken && !refreshToken) return;

      isAutoSyncingRef.current = true;
      setIsStravaAutoSyncing(true);
      lastAutoSyncTimeRef.current = Date.now();

      try {
        let activeToken = accessToken;
        let activeRefreshToken = refreshToken;
        const nowEpochSec = Math.floor(Date.now() / 1000);
        const isExpiredOrExpiringSoon = Boolean(expiresAt && nowEpochSec >= expiresAt - 300);

        if ((!activeToken || isExpiredOrExpiringSoon) && activeRefreshToken) {
          try {
            const refreshed = await refreshStravaToken(
              clientId,
              clientSecret,
              activeRefreshToken,
              currentUser.email
            );
            activeToken = refreshed.access_token;
            activeRefreshToken = refreshed.refresh_token;
            handleUpdateSettings({
              stravaConnected: true,
              stravaAccessToken: refreshed.access_token,
              stravaRefreshToken: refreshed.refresh_token,
              stravaExpiresAt: refreshed.expires_at,
            });
          } catch {
            // Fall through to fetchStravaActivities which will attempt refresh on 401 if needed
          }
        }

        const effectiveStartDate =
          settings.stravaSyncStartDate || freshSettings.stravaSyncStartDate || '2026-01-01';
        const afterEpoch = parseDateToEpochSeconds(effectiveStartDate);

        const activities = await fetchAllStravaActivitiesSince(
          activeToken,
          afterEpoch,
          {
            clientId,
            clientSecret,
            refreshToken: activeRefreshToken,
            athleteEmail: currentUser.email,
            onTokenRefreshed: (tokenData) => {
              handleUpdateSettings({
                stravaConnected: true,
                stravaAccessToken: tokenData.access_token,
                stravaRefreshToken: tokenData.refresh_token,
                stravaExpiresAt: tokenData.expires_at,
              });
            },
          }
        );

        const defaultShoe = (settings.shoes || freshSettings.shoes || []).find(
          (s) => !s.isRetired && s.isDefault
        );
        const unit = settings.distanceUnit || freshSettings.distanceUnit || 'mi';
        const athleteName =
          settings.stravaAthleteName ||
          freshSettings.stravaAthleteName ||
          currentUser.name ||
          'Strava Athlete';

        const normalizedWorkouts = activities.map((act) =>
          normalizeStravaActivity(
            act,
            unit,
            currentUser.id || COACH_PROFILE.id,
            currentUser.name || athleteName,
            defaultShoe?.id,
            defaultShoe?.name
          )
        );

        if (normalizedWorkouts.length > 0) {
          handleBatchImportWorkouts(normalizedWorkouts);
        }

        handleUpdateSettings({
          stravaLastSyncTime: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Background Strava auto-sync skipped or failed:', err);
      } finally {
        isAutoSyncingRef.current = false;
        setIsStravaAutoSyncing(false);
      }
    };

    runAutoStravaSync();

    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastAutoSyncTimeRef.current >= 60_000
      ) {
        runAutoStravaSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [currentUser?.id, currentUser?.email, settings.stravaConnected]);

  // Coach Athlete Roster Filter (defaults to Coach Michael Carey)
  const [selectedAthleteFilter, setSelectedAthleteFilter] = useState<string>(
    () => loadStoredUser()?.id || COACH_PROFILE.id
  );

  // Compute visible workouts based on role and athlete filter
  const visibleWorkouts = useMemo(() => {
    if (!currentUser) return [];
    const isMichaelUser =
      currentUser.id === COACH_PROFILE.id || currentUser.id === COACH_ATHLETE_PROFILE.id;

    if (currentUser.role === 'runner') {
      // Athlete (e.g. Rob, or Coach Michael Carey in athlete mode) only has access to their own workouts
      return workouts.filter((w) => {
        if (
          isMichaelUser &&
          (w.athleteId === COACH_PROFILE.id ||
            w.athleteId === COACH_ATHLETE_PROFILE.id ||
            w.athleteName === COACH_PROFILE.name ||
            w.athleteName === COACH_ATHLETE_PROFILE.name)
        ) {
          return true;
        }
        return (
          w.athleteId === currentUser.id ||
          w.athleteName === currentUser.name ||
          (!w.athleteId && !w.isPlanAssigned)
        );
      });
    }

    // Coach Admin (Michael Carey) views individual athlete calendars.
    // Synced Strava runs strictly display under that athlete's tab and never appear lumped together.
    const targetAthId =
      selectedAthleteFilter && selectedAthleteFilter !== 'all'
        ? selectedAthleteFilter
        : currentUser.id || COACH_PROFILE.id;

    if (
      targetAthId === COACH_PROFILE.id ||
      targetAthId === COACH_ATHLETE_PROFILE.id
    ) {
      return workouts.filter(
        (w) =>
          w.athleteId === COACH_PROFILE.id ||
          w.athleteId === COACH_ATHLETE_PROFILE.id ||
          w.athleteName === COACH_PROFILE.name ||
          w.athleteName === COACH_ATHLETE_PROFILE.name
      );
    }
    return workouts.filter(
      (w) => w.athleteId === targetAthId || w.athleteName === targetAthId
    );
  }, [workouts, currentUser, selectedAthleteFilter]);

  // Recalculate weeks workload data based on visible workouts
  const weeks = useMemo(() => {
    return buildWeeklyWorkloadData(visibleWorkouts, settings.firstDayOfWeek, settings.warningThreshold);
  }, [visibleWorkouts, settings.firstDayOfWeek, settings.warningThreshold]);

  // Current active week in the workload calculations
  const currentWeek = useMemo(() => {
    const matched = weeks.find((w) => w.startDate === activeWeekStartDate);
    if (matched) return matched;
    return weeks[weeks.length - 1];
  }, [weeks, activeWeekStartDate]);

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
    // Ensure athlete identity is preserved or assigned
    const targetRun: WorkoutRun = { ...run };
    if (!targetRun.athleteId) {
      if (currentUser?.role === 'runner') {
        targetRun.athleteId = currentUser.id;
        targetRun.athleteName = currentUser.name;
      } else if (selectedAthleteFilter !== 'all') {
        const matched = roster.find((u) => u.id === selectedAthleteFilter);
        targetRun.athleteId = selectedAthleteFilter;
        targetRun.athleteName = matched?.name || 'Athlete';
      } else {
        targetRun.athleteId = currentUser?.id || COACH_PROFILE.id;
        targetRun.athleteName = currentUser?.name || COACH_PROFILE.name;
      }
    }

    setWorkouts((prev) => {
      const existingIdx = prev.findIndex((r) => r.id === targetRun.id);
      let updated: WorkoutRun[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = targetRun;
      } else {
        updated = [...prev, targetRun];
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

  // Batch import workouts from Strava, Garmin, or external files with reconciliation & deduplication
  const handleBatchImportWorkouts = (newWorkouts: WorkoutRun[]) => {
    setWorkouts((prev) => {
      let updated: WorkoutRun[];
      if (newWorkouts.some((w) => w.source === 'strava')) {
        updated = reconcileStravaWorkouts(prev, newWorkouts);
      } else {
        const existingSignatures = new Set(
          prev.map((w) => `${w.athleteId || ''}_${w.workoutDate}_${w.distance.toFixed(1)}`)
        );
        const uniqueNew = newWorkouts.filter(
          (nw) =>
            !existingSignatures.has(
              `${nw.athleteId || ''}_${nw.workoutDate}_${nw.distance.toFixed(1)}`
            )
        );
        updated = [...prev, ...uniqueNew];
      }
      saveStoredWorkouts(updated);
      return updated;
    });

    // When handleBatchImportWorkouts is called on any device (athlete or coach), immediately push to /api/workouts/bulk
    if (typeof fetch !== 'undefined' && newWorkouts && newWorkouts.length > 0) {
      fetch('/api/workouts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workouts: newWorkouts }),
      }).catch((err) => {
        console.warn('Unable to push imported workouts to /api/workouts/bulk:', err);
      });
    }
  };

  // Athlete editing from plan or input
  const handleAthleteEdit = (run: WorkoutRun) => {
    if (currentUser?.role === 'runner') {
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

  // Athlete checking off assigned run as completed with coach notification & optional comment
  const handleAthleteToggleComplete = (
    run: WorkoutRun,
    completed: boolean,
    athleteComment?: string
  ) => {
    const updatedRun: WorkoutRun = {
      ...run,
      completed,
      athleteComment: athleteComment !== undefined ? athleteComment : run.athleteComment,
      updatedAt: new Date().toISOString(),
    };
    handleSaveRun(updatedRun);

    if (currentUser?.role === 'runner' && completed) {
      const commentText = athleteComment?.trim()
        ? athleteComment.trim()
        : updatedRun.athleteComment?.trim() || '';

      const notif: CoachNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        athleteId: currentUser.id,
        athleteName: currentUser.name,
        type: 'completed',
        date: run.workoutDate,
        runType: run.runType,
        distance: run.distance,
        unit: run.distanceUnit,
        comment: commentText,
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

  // Athlete editing their assigned run parameters with optional reason for coach
  const handleAthleteEditAssignedRun = (
    updatedRun: WorkoutRun,
    editReason?: string
  ) => {
    const runToSave: WorkoutRun = {
      ...updatedRun,
      editReason: editReason?.trim() || updatedRun.editReason,
      updatedAt: new Date().toISOString(),
    };
    handleSaveRun(runToSave);

    if (currentUser?.role === 'runner') {
      const reasonText = editReason?.trim() || '';
      const notif: CoachNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        athleteId: currentUser.id,
        athleteName: currentUser.name,
        type: 'edited',
        date: runToSave.workoutDate,
        runType: runToSave.runType,
        distance: runToSave.distance,
        unit: runToSave.distanceUnit,
        comment: reasonText
          ? `Reason: "${reasonText}"`
          : `Adjusted workout parameters (${runToSave.distance} ${runToSave.distanceUnit.toUpperCase()} ${runToSave.runType})`,
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

  // Count of pending assigned runs for the athlete today
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const todayPendingAssignedCount = useMemo(() => {
    if (!currentUser) return 0;
    return workouts.filter((w) => {
      const isForAthlete =
        w.athleteId === currentUser.id ||
        (w.athleteName &&
          w.athleteName.toLowerCase().includes(currentUser.name.toLowerCase()));
      const isAssigned = w.isPlanAssigned || w.assignedByCoachId !== undefined;
      return isForAthlete && isAssigned && w.workoutDate === todayStr && !w.completed;
    }).length;
  }, [workouts, currentUser, todayStr]);

  // Synchronize active theme attribute with document root
  useEffect(() => {
    const theme = settings.themeMode || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [settings.themeMode]);

  // Settings handlers
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveStoredSettings(updated);
      if (
        currentUser?.email &&
        ('stravaConnected' in newSettings ||
          'stravaAccessToken' in newSettings ||
          'stravaRefreshToken' in newSettings ||
          'stravaClientId' in newSettings ||
          'stravaClientSecret' in newSettings ||
          'stravaLastSyncTime' in newSettings)
      ) {
        saveUserStravaConnection(currentUser.email, updated);
      }
      return updated;
    });
  };

  const handleSaveUserStaples = (userId: string, staples: QuickLogStaple[]) => {
    const currentMap = settings.userQuickStaples || {};
    const updatedMap = { ...currentMap, [userId]: staples };
    handleUpdateSettings({ userQuickStaples: updatedMap });
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
    if (!currentUser) return;
    if (isCoachEmail(currentUser.email)) {
      // Toggle between Coach Michael Carey and Athlete Michael Carey
      const nextUser = currentUser.role === 'coach' ? COACH_ATHLETE_PROFILE : COACH_PROFILE;
      setCurrentUser(nextUser);
      saveStoredUser(nextUser);
    }
  };

  const handleSignOut = () => {
    clearStoredUser();
    setCurrentUser(null);
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

  // Coach recurring runs & Google Sheet assignment handler
  const handleAssignRuns = (newRuns: WorkoutRun[], notificationText: string) => {
    setWorkouts((prev) => {
      const isSheetSync = newRuns.length > 0 && newRuns[0].source === 'google_sheets';
      const targetAthId = newRuns[0]?.athleteId;
      const targetPlanId = newRuns[0]?.planId;

      // If syncing a Google Sheet for an athlete, replace previous uncompleted sheet workouts for that athlete/plan to prevent duplicates
      const filteredPrev = isSheetSync
        ? prev.filter(
            (w) =>
              !(
                w.source === 'google_sheets' &&
                w.athleteId === targetAthId &&
                (!targetPlanId || w.planId === targetPlanId) &&
                !w.completed
              )
          )
        : prev;

      const updated = [...filteredPrev, ...newRuns];
      saveStoredWorkouts(updated);
      return updated;
    });

    const notif: CoachNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      athleteId: currentUser?.id || COACH_PROFILE.id,
      athleteName: currentUser?.name || COACH_PROFILE.name,
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

  // Render Login Page if user is not authenticated
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setRoster(loadStoredRoster());
          if (window.history.replaceState && inviteCoachEmail) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }}
        inviteCoachEmail={inviteCoachEmail}
      />
    );
  }

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
        onOpenQuickLog={() => handleOpenLogRun()}
        onOpenAssignedRuns={() => setIsAssignedRunsOpen(true)}
        pendingAssignedCount={todayPendingAssignedCount}
        onOpenInvite={() => setIsInviteModalOpen(true)}
        onSignOut={handleSignOut}
        onOpenStravaConnect={() => setIsStravaModalOpen(true)}
        stravaConnected={Boolean(settings.stravaConnected)}
        isStravaAutoSyncing={isStravaAutoSyncing}
      />

      <main className="main-content">
        {/* Coach Admin Athlete Roster Bar (Only visible in Coach Mode) */}
        {currentUser.role === 'coach' && (
          <div className="coach-roster-bar mb-4 p-3.5 rounded-2xl bg-surface border border-subtle">
            <div className="coach-roster-header flex items-center justify-between gap-2 mb-2.5 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="badge-safe font-mono text-xxs font-bold flex-shrink-0">
                  COACH MODE
                </span>
                <span className="text-xs font-mono font-bold text-primary truncate">
                  Athlete Roster
                </span>
              </div>
              <div className="coach-roster-actions flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  className="btn-roster-invite"
                  onClick={() => setIsAssignRunOpen(true)}
                  title="Assign run to athlete calendar"
                  style={{
                    background: 'rgba(56, 189, 248, 0.14)',
                    borderColor: 'rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                  }}
                >
                  <span className="text-xs">⚡</span>
                  <span className="desktop-text">Assign Run</span>
                  <span className="mobile-text">Assign</span>
                </button>
                <button
                  type="button"
                  className="btn-roster-invite"
                  onClick={() => setIsPlanBuilderOpen(true)}
                  title="Coach Only: Select an athlete and link their Google Sheet training plan"
                  style={{
                    background: 'rgba(16, 185, 129, 0.14)',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                  }}
                >
                  <span className="text-xs">📊</span>
                  <span className="desktop-text">Link Google Sheet</span>
                  <span className="mobile-text">Sheet / Plan</span>
                </button>
                <button
                  type="button"
                  className="btn-roster-invite"
                  onClick={() => setIsInviteModalOpen(true)}
                  title="Send invite link to new athletes"
                >
                  <span className="text-xs">✉️</span>
                  <span className="desktop-text">Invite Athletes</span>
                  <span className="mobile-text">Invite</span>
                </button>
              </div>
            </div>

            {/* Roster Filter Pills (Smooth horizontal scroll on mobile) */}
            <div className="coach-roster-pills flex items-center gap-2">
              {roster.map((user) => {
                const isSelected =
                  selectedAthleteFilter === user.id ||
                  (selectedAthleteFilter === 'all' && user.id === COACH_PROFILE.id);
                const count = workouts.filter((w) => {
                  if (user.id === COACH_PROFILE.id || user.id === COACH_ATHLETE_PROFILE.id) {
                    return (
                      w.athleteId === COACH_PROFILE.id ||
                      w.athleteId === COACH_ATHLETE_PROFILE.id ||
                      w.athleteName === COACH_PROFILE.name ||
                      w.athleteName === COACH_ATHLETE_PROFILE.name
                    );
                  }
                  return w.athleteId === user.id || w.athleteName === user.name;
                }).length;
                return (
                  <button
                    key={user.id}
                    type="button"
                    className={`btn-filter-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedAthleteFilter(user.id)}
                    title={
                      user.googleSheetUrl
                        ? `${user.name} — Linked to Google Sheet (${user.googleSheetTab || 'Sheet'})`
                        : `${user.name}`
                    }
                  >
                    {user.googleSheetUrl ? '📊 ' : ''}
                    {user.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Prominent In-Week Exceedance / Prediction Warning Banner */}
        <InWeekWarningBanner
          prediction={inWeekPrediction}
          warningThreshold={settings.warningThreshold}
        />

        {/* Tab 1: Workouts (Strava-Inspired Activity Feed) */}
        {activeTab === 'workouts' && (
          <WorkoutsTab
            workouts={visibleWorkouts}
            distanceUnit={settings.distanceUnit}
            onEditRun={handleOpenEditRun}
            onLogRun={() => handleOpenLogRun()}
            onDeleteWorkout={handleDeleteRun}
            targetRace={settings.targetRace}
            onToggleComplete={(run) => handleAthleteToggleComplete(run, !run.completed)}
            weeklyMileageTarget={settings.weeklyMileageTarget}
            activeWeekStartDate={activeWeekStartDate}
            onOpenStravaConnect={() => setIsStravaModalOpen(true)}
            stravaConnected={Boolean(settings.stravaConnected)}
          />
        )}

        {/* Tab 2: Training Log (Week View & Month View) */}
        {activeTab === 'training_log' && (
          <TrainingLogTab
            weeks={weeks}
            activeWeekStartDate={activeWeekStartDate}
            onSelectWeekStart={(startDate) => {
              setSelectedDate(startDate);
            }}
            onSelectDay={(date) => {
              setSelectedDate(date);
              handleOpenLogRun(date);
            }}
            onEditRun={handleOpenEditRun}
            onLogRun={(date) => handleOpenLogRun(date)}
            distanceUnit={settings.distanceUnit}
            warningThreshold={settings.warningThreshold}
            workouts={visibleWorkouts}
          />
        )}

        {/* Tab 3: Analytics (Custom windows, SVG charts, In-Week calculations, clean CSV export) */}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            weeks={weeks}
            currentWeek={currentWeek}
            distanceUnit={settings.distanceUnit}
            onSelectWeek={(startDate) => {
              setSelectedDate(startDate);
              setActiveTab('training_log');
            }}
            warningThreshold={settings.warningThreshold}
            currentUser={currentUser}
            allWorkouts={workouts}
            selectedAthleteFilter={selectedAthleteFilter}
            onSelectAthleteFilter={setSelectedAthleteFilter}
            firstDayOfWeek={settings.firstDayOfWeek}
            activeWeekStartDate={activeWeekStartDate}
          />
        )}

        {/* Tab 4: Settings (Appearance / Theme Mode, Units, Schedules, ACR Thresholds) */}
        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            currentUser={currentUser}
            onToggleRole={handleToggleRole}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onBatchImportWorkouts={handleBatchImportWorkouts}
            onOpenStravaConnect={() => setIsStravaModalOpen(true)}
          />
        )}
      </main>

      {/* Coach-Only Plan Builder & Athlete Google Sheets Integration Modal */}
      {currentUser.role === 'coach' && (
        <AdminPlanModal
          isOpen={isPlanBuilderOpen}
          onClose={() => setIsPlanBuilderOpen(false)}
          currentUser={currentUser}
          plans={plans}
          onSavePlan={handleSavePlan}
          distanceUnit={settings.distanceUnit}
          onOpenAsAthlete={handleOpenAsAthlete}
          onAssignRuns={handleAssignRuns}
          initialAthleteId={selectedAthleteFilter}
          onRosterUpdated={setRoster}
          onInviteAthletes={() => setIsInviteModalOpen(true)}
        />
      )}

      {/* Coach Assign Run Modal */}
      <AssignRunModal
        isOpen={isAssignRunOpen}
        onClose={() => setIsAssignRunOpen(false)}
        currentUser={currentUser}
        distanceUnit={settings.distanceUnit}
        onAssignRuns={handleAssignRuns}
        activeDate={selectedDate}
        allWorkouts={workouts}
        onUpdateRun={handleSaveRun}
        onDeleteRun={handleDeleteRun}
        rosterUsers={roster}
        onInviteAthletes={() => setIsInviteModalOpen(true)}
      />

      {/* Strava-Style Log Run / Edit Run Pop-up Menu Modal with Scroll Bar */}
      <LogRunModal
        isOpen={isLogRunModalOpen}
        onClose={handleCloseLogRunModal}
        runToEdit={runToEdit}
        defaultDate={modalDefaultDate}
        currentUser={currentUser}
        distanceUnit={settings.distanceUnit}
        onSaveRun={handleSaveModalRun}
        onDeleteRun={handleDeleteModalRun}
        shoes={settings.shoes || []}
        allWorkouts={workouts}
        userQuickStaplesMap={settings.userQuickStaples}
        onSaveUserStaples={handleSaveUserStaples}
        selectedAthleteFilter={selectedAthleteFilter}
        safeRemainingBudget={inWeekPrediction.remainingSafeLoad}
      />

      {/* Athlete Assigned Runs & Daily Check-Off Modal (✓ icon) */}
      <AssignedRunsModal
        isOpen={isAssignedRunsOpen}
        onClose={() => setIsAssignedRunsOpen(false)}
        currentUser={currentUser}
        distanceUnit={settings.distanceUnit}
        allWorkouts={workouts}
        onToggleComplete={handleAthleteToggleComplete}
        onUpdateRun={handleAthleteEditAssignedRun}
        onEditRun={handleOpenEditRun}
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

      {/* Coach Invite Athletes Modal */}
      <InviteAthletesModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        coachEmail={COACH_EMAIL}
        coachName={COACH_PROFILE.name}
      />

      {/* Strava Sync Modal */}
      <StravaConnectModal
        isOpen={isStravaModalOpen}
        onClose={() => {
          setIsStravaModalOpen(false);
          setStravaOAuthStatus(null);
        }}
        currentUser={currentUser}
        activeAthlete={
          roster.find((u) => u.id === selectedAthleteFilter) || currentUser
        }
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onImportRuns={handleBatchImportWorkouts}
        oauthStatus={stravaOAuthStatus}
      />

      {/* Native Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingAssignedCount={todayPendingAssignedCount}
      />
    </div>
  );
};

export default App;
