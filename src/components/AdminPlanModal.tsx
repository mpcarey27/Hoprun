import React, { useState, useMemo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type {
  TrainingPlan,
  PlanDayItem,
  DistanceUnit,
  UserProfile,
  WorkoutRun,
} from '../types/acr';
import {
  DEFAULT_RUN_TYPES,
  getRunTypeMultiplier,
  calculateRunLoad,
  formatDate,
  addDays,
  convertDistance,
} from '../utils/calculations';
import {
  compressPlan,
  getPlanWeeksCount,
  getPlanWeekChunk,
} from '../utils/planShare';
import {
  loadStoredRoster,
  isCoachEmail,
  updateAthleteGoogleSheetLink,
} from '../utils/storage';
import {
  SHEET_COLOR_LEGEND,
  ELISE_REFERENCE_TABS,
  fetchAndParseGoogleSheet,
  parseGoogleSheetHtml,
  convertSheetTabToPlanAndWorkouts,
} from '../utils/googleSheetsParser';
import { AthleteSelectList } from './AthleteSelectList';
import type {
  ParsedSheetTab,
  DoubleRunSplitMode,
} from '../utils/googleSheetsParser';

const DEFAULT_ELISE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/13D1uqvpJUqH3DaE8-5fRWfkLAbrCKBZSTNoUrEzF0wg/edit?usp=sharing';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  plans: TrainingPlan[];
  onSavePlan: (plan: TrainingPlan) => void;
  distanceUnit: DistanceUnit;
  onOpenAsAthlete: (plan: TrainingPlan) => void;
  onAssignRuns?: (newRuns: WorkoutRun[], notificationText: string) => void;
  initialAthleteId?: string;
  onRosterUpdated?: (roster: UserProfile[]) => void;
  onInviteAthletes?: () => void;
}

export const AdminPlanModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  plans,
  onSavePlan,
  distanceUnit,
  onOpenAsAthlete,
  onAssignRuns,
  initialAthleteId,
  onRosterUpdated,
  onInviteAthletes,
}) => {
  // Strictly Coach-Only: only careyer1234@gmail.com in 'coach' role may integrate Google Sheets or manage plans
  const isCoach = currentUser.role === 'coach' && isCoachEmail(currentUser.email);
  const [rosterUsers, setRosterUsers] = useState<UserProfile[]>(() => loadStoredRoster());

  // Refresh roster when modal opens
  useEffect(() => {
    if (isOpen) {
      setRosterUsers(loadStoredRoster());
    }
  }, [isOpen]);

  // Selectable profiles: the coach (assign a plan to yourself) + every invited athlete
  const athleteRoster = useMemo(() => {
    return rosterUsers.some((u) => u.id === currentUser.id)
      ? rosterUsers
      : [currentUser, ...rosterUsers];
  }, [rosterUsers, currentUser]);

  // Target Athlete Selection State (defaults to the filtered athlete, otherwise yourself)
  const [targetAthleteId, setTargetAthleteId] = useState<string>(() => {
    const list = loadStoredRoster();
    if (initialAthleteId && list.some((u) => u.id === initialAthleteId)) {
      return initialAthleteId;
    }
    return currentUser.id;
  });

  const targetAthlete = useMemo(() => {
    return (
      athleteRoster.find((u) => u.id === targetAthleteId) ||
      athleteRoster[0] ||
      currentUser
    );
  }, [athleteRoster, targetAthleteId, currentUser]);

  // Mode Switcher: 'sheets' (Coach Google Sheets Integration) vs 'manual' (Manual Builder)
  const [builderMode, setBuilderMode] = useState<'sheets' | 'manual'>('sheets');
  const [sheetUrl, setSheetUrl] = useState<string>(
    () => targetAthlete?.googleSheetUrl || ''
  );
  const [sheetTabName, setSheetTabName] = useState<string>(
    () => targetAthlete?.googleSheetTab || 'Indy'
  );
  const [availableSheetTabs, setAvailableSheetTabs] = useState<string[]>([
    'CIM',
    'Boston',
    'Indy',
  ]);
  const [parsedSheetTab, setParsedSheetTab] = useState<ParsedSheetTab | null>(() =>
    targetAthlete?.googleSheetUrl ? ELISE_REFERENCE_TABS[targetAthlete.googleSheetTab || 'Indy'] || ELISE_REFERENCE_TABS['Indy'] : null
  );
  const [doubleRunMode, setDoubleRunMode] = useState<DoubleRunSplitMode>('combined');
  const [isSyncingSheet, setIsSyncingSheet] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string>('');
  const sheetFileInputRef = useRef<HTMLInputElement>(null);

  // When Coach selects a different athlete, load that athlete's corresponding Google Sheet link
  const handleSelectAthlete = async (athlete: UserProfile) => {
    setTargetAthleteId(athlete.id);
    setSheetError('');
    setAssignDirectSuccess('');
    const savedUrl = athlete.googleSheetUrl || '';
    const savedTab = athlete.googleSheetTab || 'Indy';
    setSheetUrl(savedUrl);
    setSheetTabName(savedTab);

    if (savedUrl) {
      setIsSyncingSheet(true);
      try {
        const result = await fetchAndParseGoogleSheet(savedUrl, savedTab, 2026);
        setParsedSheetTab(result.activeTab);
        setAvailableSheetTabs(result.availableTabs);
        setSheetTabName(result.activeTab.tabName);
      } catch {
        setParsedSheetTab(ELISE_REFERENCE_TABS[savedTab] || ELISE_REFERENCE_TABS['Indy']);
      } finally {
        setIsSyncingSheet(false);
      }
    } else {
      setParsedSheetTab(null);
    }
  };

  // Sync initialAthleteId when opened from Coach Roster bar for a specific filtered athlete
  useEffect(() => {
    if (isOpen && initialAthleteId && initialAthleteId !== 'all') {
      const found = athleteRoster.find((u) => u.id === initialAthleteId);
      if (found) {
        handleSelectAthlete(found);
      }
    }
  }, [isOpen, initialAthleteId]);

  const [assignDirectSuccess, setAssignDirectSuccess] = useState<string>('');

  // Plan duration in weeks (1, 2, 3, 4, etc.)
  const [weeksCount, setWeeksCount] = useState<number>(() => {
    return plans[0]?.weeksCount || (plans[0]?.days ? getPlanWeeksCount(plans[0].days) : 1);
  });

  const [activePlan, setActivePlan] = useState<TrainingPlan>(() => {
    const totalDays = (plans[0]?.weeksCount || 1) * 7;
    return (
      plans[0] || {
        id: `plan_${Date.now()}`,
        title: 'Training Plan',
        coachId: currentUser.id,
        coachName: currentUser.name,
        startDate: formatDate(new Date()),
        weeksCount: 1,
        code: `RUN-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date().toISOString(),
        days: Array.from({ length: totalDays }, (_, i) => ({
          dayIndex: i,
          runType: 'easy',
          targetDistance: 0,
          distanceUnit,
          instructions: '',
        })),
      }
    );
  });

  // Active viewing week within the plan builder (0 = Week 1, 1 = Week 2, etc.)
  const [activeWeekTab, setActiveWeekTab] = useState<number>(0);

  const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
  // Default to Wi-Fi IP so phones scanning on the same local network can connect
  const [targetHost, setTargetHost] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `http://192.168.88.15:${window.location.port || '5173'}`;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  });
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Synchronize days count whenever weeksCount changes
  const handleSetDurationWeeks = (count: number) => {
    const totalDaysNeeded = count * 7;
    const currentDays = [...activePlan.days];

    let newDays: PlanDayItem[];
    if (currentDays.length < totalDaysNeeded) {
      const extraDays = Array.from({ length: totalDaysNeeded - currentDays.length }, (_, i) => ({
        dayIndex: currentDays.length + i,
        runType: 'easy',
        targetDistance: 0,
        distanceUnit,
        instructions: '',
      }));
      newDays = [...currentDays, ...extraDays];
    } else {
      newDays = currentDays.slice(0, totalDaysNeeded);
    }

    setWeeksCount(count);
    setActivePlan({
      ...activePlan,
      weeksCount: count,
      days: newDays,
    });
    if (activeWeekTab >= count) {
      setActiveWeekTab(count - 1);
    }
  };

  const handleAddExtraWeek = () => {
    handleSetDurationWeeks(weeksCount + 1);
  };

  // Planned totals across entire plan
  const totalPlanMiles = useMemo(() => {
    return activePlan.days.reduce((acc, d) => {
      return acc + convertDistance(d.targetDistance, d.distanceUnit, 'mi');
    }, 0);
  }, [activePlan.days]);

  const totalPlanAcuteLoad = useMemo(() => {
    return activePlan.days.reduce((acc, d) => {
      const mi = convertDistance(d.targetDistance, d.distanceUnit, 'mi');
      const mult = getRunTypeMultiplier(d.runType);
      return acc + mi * mult;
    }, 0);
  }, [activePlan.days]);

  // Days for the currently selected week tab (7 days)
  const currentTabDays = useMemo(() => {
    return getPlanWeekChunk(activePlan.days, activeWeekTab);
  }, [activePlan.days, activeWeekTab]);

  const currentTabMiles = useMemo(() => {
    return currentTabDays.reduce((acc, d) => {
      return acc + convertDistance(d.targetDistance, d.distanceUnit, 'mi');
    }, 0);
  }, [currentTabDays]);

  const currentTabAcuteLoad = currentTabDays.reduce((acc, d) => {
    const mi = d.distanceUnit === 'mi' ? d.targetDistance : d.targetDistance / 1.609344;
    const mult = getRunTypeMultiplier(d.runType);
    return acc + mi * mult;
  }, 0);

  const handleUpdateDay = (globalIndex: number, updates: Partial<PlanDayItem>) => {
    const newDays = [...activePlan.days];
    newDays[globalIndex] = { ...newDays[globalIndex], ...updates };
    setActivePlan({ ...activePlan, days: newDays });
  };

  const generateQrForPlan = async () => {
    try {
      const compressedPayload = await compressPlan(activePlan);
      const cleanHost = targetHost.trim().replace(/\/+$/, '');
      const shareUrl = `${cleanHost}${window.location.pathname}?p=${compressedPayload}&code=${activePlan.code}`;

      // High-contrast, easy-to-scan QR code settings
      const url = await QRCode.toDataURL(shareUrl, {
        width: 320,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      setQrDataUrl(url);
      setGeneratedShareUrl(shareUrl);
      setShowQr(true);
      onSavePlan(activePlan);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const handleCopyLink = () => {
    const toCopy = generatedShareUrl || `${targetHost}${window.location.pathname}?code=${activePlan.code}`;
    navigator.clipboard.writeText(toCopy);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleAssignPlanDirectly = () => {
    if (!onAssignRuns) return;
    const plannedDays = activePlan.days.filter((d) => d.targetDistance > 0);
    if (plannedDays.length === 0) {
      alert('Please configure at least one day with distance > 0 in the plan before assigning.');
      return;
    }

    const baseTime = Date.now();
    const newRuns: WorkoutRun[] = plannedDays.map((dayItem, idx) => {
      const dateStr = addDays(activePlan.startDate, dayItem.dayIndex);
      const mult = getRunTypeMultiplier(dayItem.runType);
      const load = calculateRunLoad(dayItem.targetDistance, dayItem.distanceUnit, mult);
      return {
        id: `run_plan_${activePlan.id}_${dayItem.dayIndex}_${baseTime}_${idx}`,
        workoutDate: dateStr,
        runOrder: 1,
        distance: dayItem.targetDistance,
        distanceUnit: dayItem.distanceUnit,
        runType: dayItem.runType,
        multiplier: mult,
        load,
        comments: dayItem.instructions ? `${dayItem.instructions} (${activePlan.title})` : `Prescribed from ${activePlan.title} by Coach ${currentUser.name || 'Michael Carey'}`,
        completed: false,
        isPlanAssigned: true,
        planId: activePlan.id,
        planDayIndex: dayItem.dayIndex,
        athleteId: targetAthlete.id,
        athleteName: targetAthlete.name,
        assignedByCoachId: currentUser.id,
        assignedByCoachName: currentUser.name,
        updatedAt: new Date().toISOString(),
      };
    });

    const notifMsg = `Coach ${currentUser.name || 'Michael Carey'} assigned ${activePlan.title} (${newRuns.length} workouts) directly to ${targetAthlete.name}'s schedule starting ${activePlan.startDate}`;
    onAssignRuns(newRuns, notifMsg);
    onSavePlan({
      ...activePlan,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
    });
    setAssignDirectSuccess(`✓ Successfully assigned "${activePlan.title}" (${newRuns.length} workouts) directly to ${targetAthlete.name}!`);
    setTimeout(() => setAssignDirectSuccess(''), 3500);
  };

  // Google Sheets Sync Handlers (Coach-Only)
  const handleSyncGoogleSheet = async (
    tabToFetch: string = sheetTabName,
    urlOverride?: string
  ) => {
    if (!isCoach) return;
    const urlToSync = (urlOverride !== undefined ? urlOverride : sheetUrl).trim();
    if (!urlToSync) {
      setSheetError(`Please paste or upload ${targetAthlete.name}'s Google Sheet link first.`);
      return;
    }

    setSheetError('');
    setIsSyncingSheet(true);
    try {
      const result = await fetchAndParseGoogleSheet(urlToSync, tabToFetch, 2026);
      setParsedSheetTab(result.activeTab);
      setAvailableSheetTabs(result.availableTabs);
      setSheetTabName(result.activeTab.tabName);

      // Save the Google Sheet URL & active tab directly onto the selected athlete's profile
      const updatedRoster = updateAthleteGoogleSheetLink(
        targetAthlete.id,
        urlToSync,
        result.activeTab.tabName
      );
      setRosterUsers(updatedRoster);
      onRosterUpdated?.(updatedRoster);

      setAssignDirectSuccess(
        `✓ Linked & synced "${result.activeTab.title}" (${result.activeTab.weeks.length} weeks, ${result.activeTab.totalMiles} total miles) for ${targetAthlete.name}!`
      );
      setTimeout(() => setAssignDirectSuccess(''), 4000);
    } catch (err: any) {
      setSheetError(err.message || 'Failed to parse Google Sheet.');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Coach File Upload Handler for exported Google Sheet (.html)
  const handleSheetFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isCoach) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setSheetError('');
    setIsSyncingSheet(true);
    try {
      const htmlText = await file.text();
      const customTabName = file.name.replace(/\.(html|htm)$/i, '') || 'UploadedSheet';
      const parsed = parseGoogleSheetHtml(
        htmlText,
        `file_${targetAthlete.id}`,
        customTabName,
        2026
      );
      if (!parsed || parsed.weeks.length === 0) {
        throw new Error(
          'No weekly schedule rows (Monday dates + daily mileage) found in the uploaded file.'
        );
      }
      const pseudoUrl = sheetUrl.trim() || `uploaded://${file.name}`;
      setSheetUrl(pseudoUrl);
      setParsedSheetTab(parsed);
      setAvailableSheetTabs([parsed.tabName]);
      setSheetTabName(parsed.tabName);

      const updatedRoster = updateAthleteGoogleSheetLink(
        targetAthlete.id,
        pseudoUrl,
        parsed.tabName
      );
      setRosterUsers(updatedRoster);
      onRosterUpdated?.(updatedRoster);

      setAssignDirectSuccess(
        `✓ Uploaded & parsed "${file.name}" (${parsed.weeks.length} weeks, ${parsed.totalMiles} miles) for ${targetAthlete.name}!`
      );
      setTimeout(() => setAssignDirectSuccess(''), 4000);
    } catch (err: any) {
      setSheetError(err.message || 'Could not parse uploaded Google Sheet file.');
    } finally {
      setIsSyncingSheet(false);
      if (sheetFileInputRef.current) sheetFileInputRef.current.value = '';
    }
  };

  const handleUnlinkAthleteSheet = () => {
    if (!isCoach) return;
    const updatedRoster = updateAthleteGoogleSheetLink(targetAthlete.id, '', '');
    setRosterUsers(updatedRoster);
    onRosterUpdated?.(updatedRoster);
    setSheetUrl('');
    setParsedSheetTab(null);
    setAssignDirectSuccess(`Removed Google Sheet link for ${targetAthlete.name}.`);
    setTimeout(() => setAssignDirectSuccess(''), 3000);
  };

  const handleLoadSheetIntoBuilder = () => {
    if (!isCoach || !parsedSheetTab) return;
    const { plan } = convertSheetTabToPlanAndWorkouts({
      sheetTab: parsedSheetTab,
      sheetUrl,
      coachId: currentUser.id,
      coachName: currentUser.name,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
      distanceUnit,
      doubleRunMode,
    });
    setActivePlan(plan);
    setWeeksCount(plan.weeksCount || parsedSheetTab.weeks.length);
    setActiveWeekTab(0);
    setBuilderMode('manual');
    setAssignDirectSuccess(
      `✓ Loaded ${parsedSheetTab.weeks.length}-week "${parsedSheetTab.tabName}" block for ${targetAthlete.name} into Manual Plan Builder!`
    );
    setTimeout(() => setAssignDirectSuccess(''), 3500);
  };

  const handleAssignGoogleSheetDirectly = () => {
    if (!isCoach || !onAssignRuns || !parsedSheetTab) return;
    const { plan, workouts: sheetWorkouts } = convertSheetTabToPlanAndWorkouts({
      sheetTab: parsedSheetTab,
      sheetUrl,
      coachId: currentUser.id,
      coachName: currentUser.name,
      athleteId: targetAthlete.id,
      athleteName: targetAthlete.name,
      distanceUnit,
      doubleRunMode,
    });

    const notifMsg = `Coach ${currentUser.name || 'Michael Carey'} synced & assigned "${plan.title}" (${sheetWorkouts.length} color-coded workouts across ${parsedSheetTab.weeks.length} weeks, ${parsedSheetTab.totalMiles} mi) from Google Sheets to ${targetAthlete.name}'s schedule!`;
    onAssignRuns(sheetWorkouts, notifMsg);
    onSavePlan(plan);
    setActivePlan(plan);
    setWeeksCount(plan.weeksCount || parsedSheetTab.weeks.length);
    setAssignDirectSuccess(
      `✓ Assigned ${sheetWorkouts.length} workouts (${parsedSheetTab.weeks.length} weeks, ${parsedSheetTab.totalMiles} miles) from "${parsedSheetTab.tabName}" Google Sheet to ${targetAthlete.name}!`
    );
    setTimeout(() => setAssignDirectSuccess(''), 4500);
  };

  if (!isOpen) return null;

  // Strictly block non-coach accounts from accessing the Google Sheet Integration & Plan Builder
  if (!isCoach) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card">
          <div className="modal-header">
            <div>
              <span className="text-xxs uppercase tracking-wider text-danger font-mono font-bold">
                Coach Only
              </span>
              <h2 className="modal-title">Coach Access Required</h2>
            </div>
            <button type="button" className="btn-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="inweek-banner inweek-critical">
              <p className="text-sm font-bold text-danger mb-1">
                🔒 Google Sheet Integration is Restricted to Coaches
              </p>
              <p className="text-xs text-secondary">
                Only Coach Michael Carey (<code>careyer1234@gmail.com</code> in Coach mode) can select athletes and link or sync their Google Sheets training plans.
              </p>
            </div>
          </div>
          <div className="modal-footer flex justify-end">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-card-xl">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-xxs uppercase tracking-wider text-accent font-mono font-bold">
                Coach Only • Athlete Google Sheets Integration
              </span>
              <h2 className="modal-title">
                Select Athlete &amp; Link Google Sheet Plan
              </h2>
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body log-run-body">
          {assignDirectSuccess && (
            <div className="inweek-ribbon inweek-ribbon-optimal mb-3">
              <span className="font-mono text-sm font-bold text-success">
                {assignDirectSuccess}
              </span>
            </div>
          )}

          {sheetError && (
            <div className="inweek-ribbon inweek-ribbon-critical mb-3">
              <span className="font-mono text-xs font-bold text-danger">
                {sheetError}
              </span>
            </div>
          )}

          {/* STEP 1: Coach Selects the Athlete */}
          <div
            className="mb-3 p-3.5 rounded-xl"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="badge-safe font-mono text-xxs font-bold">
                  STEP 1
                </span>
                <span className="text-xs uppercase font-mono font-bold text-primary">
                  Select Athlete from Roster
                </span>
              </div>
              <span className="text-xxs font-mono text-accent font-bold">
                Selected: {targetAthlete.id === currentUser.id ? `${targetAthlete.name} (You)` : targetAthlete.name}
              </span>
            </div>

            <AthleteSelectList
              roster={athleteRoster}
              selectedId={targetAthlete.id}
              currentUserId={currentUser.id}
              onSelect={(user) => handleSelectAthlete(user)}
              showSheetStatus
              onInviteAthletes={onInviteAthletes}
            />
          </div>

          {/* Mode Switcher: Google Sheets Sync vs Manual Builder */}
          <div className="login-tab-pills mb-3">
            <button
              type="button"
              className={`login-tab-pill ${builderMode === 'sheets' ? 'active' : ''}`}
              onClick={() => setBuilderMode('sheets')}
            >
              📊 1. Link &amp; Sync {targetAthlete.name}&apos;s Google Sheet
            </button>
            <button
              type="button"
              className={`login-tab-pill ${builderMode === 'manual' ? 'active' : ''}`}
              onClick={() => setBuilderMode('manual')}
            >
              ✍️ 2. Manual Week-by-Week Builder ({weeksCount}w)
            </button>
          </div>

          {builderMode === 'sheets' ? (
            <div className="space-y-3">
              {/* STEP 2: Upload / Paste Athlete's Corresponding Google Sheet Link */}
              <div
                className="p-3.5 rounded-xl space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge-safe font-mono text-xxs font-bold">
                        STEP 2
                      </span>
                      <span className="text-sm font-bold text-primary">
                        Upload or Paste {targetAthlete.name}&apos;s Google Sheet Link
                      </span>
                      {targetAthlete.googleSheetUrl && (
                        <span className="badge-safe font-mono text-xxs font-bold">
                          ✓ LINKED TO {targetAthlete.name.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-xxs text-secondary mt-0.5">
                      Each athlete has their own dedicated Google Sheet link. Paste {targetAthlete.name}&apos;s sharing link below (or upload an exported <code>.html</code> sheet) to parse their color-coded weekly mileage.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!sheetUrl && (
                      <button
                        type="button"
                        className="btn-duration-pill font-mono text-xxs"
                        onClick={() => {
                          setSheetUrl(DEFAULT_ELISE_SHEET_URL);
                          handleSyncGoogleSheet('Indy', DEFAULT_ELISE_SHEET_URL);
                        }}
                        title="Populate with Elise's sample color-coded marathon Google Sheet link"
                      >
                        Load Sample Sheet Link
                      </button>
                    )}
                    {targetAthlete.googleSheetUrl && (
                      <button
                        type="button"
                        className="btn-duration-pill font-mono text-xxs"
                        onClick={handleUnlinkAthleteSheet}
                        title={`Unlink Google Sheet from ${targetAthlete.name}`}
                      >
                        Unlink Sheet ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* URL Input + Link & Sync Button + Upload HTML File */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    className="input-text font-mono text-xs flex-1"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder={`Paste ${targetAthlete.name}'s Google Sheet link (https://docs.google.com/spreadsheets/d/...)`}
                  />
                  <button
                    type="button"
                    className="btn-action-primary font-mono text-xs whitespace-nowrap"
                    onClick={() => handleSyncGoogleSheet(sheetTabName)}
                    disabled={isSyncingSheet}
                  >
                    {isSyncingSheet
                      ? 'Syncing...'
                      : `Link & Sync ${targetAthlete.name}'s Sheet 🔄`}
                  </button>
                  <input
                    ref={sheetFileInputRef}
                    type="file"
                    accept=".html,.htm"
                    style={{ display: 'none' }}
                    onChange={handleSheetFileUpload}
                  />
                  <button
                    type="button"
                    className="btn-action-secondary font-mono text-xs whitespace-nowrap"
                    onClick={() => sheetFileInputRef.current?.click()}
                    title="Upload a Google Sheet downloaded as Web Page (.html)"
                  >
                    📄 Upload Sheet (.html)
                  </button>
                </div>

                {/* Sheet Tab Pills (CIM, Boston, Indy) + Double Run Mode Toggle */}
                {parsedSheetTab && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xxs font-mono uppercase text-muted mr-1">
                        Sheet Tab:
                      </span>
                      {availableSheetTabs.map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={`btn-duration-pill font-mono ${
                            sheetTabName === tab ? 'active' : ''
                          }`}
                          onClick={() => {
                            setSheetTabName(tab);
                            handleSyncGoogleSheet(tab);
                          }}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xxs font-mono uppercase text-muted">
                        Double Days:
                      </span>
                      <button
                        type="button"
                        className={`btn-duration-pill text-xxs ${
                          doubleRunMode === 'combined' ? 'active' : ''
                        }`}
                        onClick={() => setDoubleRunMode('combined')}
                        title="Keep Double Threshold / Mod double as a single combined daily run card"
                      >
                        1 Combined Run
                      </button>
                      <button
                        type="button"
                        className={`btn-duration-pill text-xxs ${
                          doubleRunMode === 'split' ? 'active' : ''
                        }`}
                        onClick={() => setDoubleRunMode('split')}
                        title="Automatically split Double Threshold / Mod double into AM main workout + PM 4mi easy run"
                      >
                        Split AM + PM (2 Runs)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 12-Color Legend Key (Rows 29-30 from Google Sheet) */}
              <div
                className="p-3 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xxs font-mono uppercase font-bold text-secondary">
                    Detected Sheet Color Legend (Rows 29–30) → ACWR Multipliers
                  </span>
                  <span className="text-xxs font-mono text-muted">
                    12 Workout Categories
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                  {SHEET_COLOR_LEGEND.map((item) => {
                    const mult = getRunTypeMultiplier(item.runType);
                    return (
                      <div
                        key={item.runType}
                        className="px-2 py-1 rounded flex items-center justify-between text-xxs font-mono font-bold"
                        style={{
                          backgroundColor: item.sheetHex,
                          color: item.textColor,
                          border: '1px solid rgba(0,0,0,0.2)',
                        }}
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="ml-1 opacity-90">×{mult}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STEP 3: Color-Coded Spreadsheet Schedule Preview or Empty Prompt */}
              {parsedSheetTab ? (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="p-2.5 px-3 flex flex-wrap items-center justify-between gap-2 border-b border-subtle">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge-safe font-mono text-xxs font-bold">
                        STEP 3
                      </span>
                      <span className="text-xs font-mono font-bold text-primary">
                        {targetAthlete.name} — {parsedSheetTab.tabName} Schedule Preview
                      </span>
                      <span className="text-xxs font-mono text-accent">
                        ({parsedSheetTab.weeks.length} Weeks • {parsedSheetTab.totalMiles} Total Miles)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-duration-pill font-mono text-xxs"
                      onClick={handleLoadSheetIntoBuilder}
                    >
                      Edit Individual Days in Builder ✎
                    </button>
                  </div>

                  <div style={{ maxHeight: '340px', overflowY: 'auto', overflowX: 'auto' }}>
                    <table className="w-full text-xs font-mono" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr
                          style={{
                            backgroundColor: 'var(--bg-surface-elevated)',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <th className="p-2 text-left text-xxs text-muted">Wk Start (Col A)</th>
                          <th className="p-2 text-center text-xxs text-muted">Mon (B)</th>
                          <th className="p-2 text-center text-xxs text-muted">Tue (C)</th>
                          <th className="p-2 text-center text-xxs text-muted">Wed (D)</th>
                          <th className="p-2 text-center text-xxs text-muted">Thu (E)</th>
                          <th className="p-2 text-center text-xxs text-muted">Fri (F)</th>
                          <th className="p-2 text-center text-xxs text-muted">Sat (G)</th>
                          <th className="p-2 text-center text-xxs text-muted">Sun (H)</th>
                          <th className="p-2 text-right text-xxs text-primary">Total (Col I)</th>
                          <th className="p-2 text-right text-xxs text-accent">Load</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedSheetTab.weeks.map((week) => (
                          <tr
                            key={week.weekNumber}
                            style={{ borderBottom: '1px solid var(--border-subtle)' }}
                          >
                            <td className="p-1.5 px-2 font-bold text-primary whitespace-nowrap">
                              {week.weekLabel}{' '}
                              <span className="text-xxs text-muted font-normal">
                                ({week.startDate.slice(5)})
                              </span>
                            </td>
                            {week.days.map((day) => {
                              const legendItem = SHEET_COLOR_LEGEND.find(
                                (l) => l.runType === day.runType
                              );
                              return (
                                <td
                                  key={day.dayOffset}
                                  className="p-1.5 text-center font-bold"
                                  style={{
                                    backgroundColor: day.sheetHex,
                                    color: legendItem?.textColor || '#0f172a',
                                    border: '1px solid rgba(15, 23, 42, 0.18)',
                                    minWidth: '52px',
                                  }}
                                  title={`${day.dayName} ${day.date}: ${day.runTypeLabel} — ${day.distance} mi (Load: ${day.load})`}
                                >
                                  {day.distance > 0 ? day.distance : ''}
                                </td>
                              );
                            })}
                            <td className="p-1.5 px-2 text-right font-bold text-primary whitespace-nowrap">
                              {week.calculatedWeeklyTotal}{' '}
                              {week.checksumValid && (
                                <span className="text-success text-xxs" title="Matches Column I">
                                  ✓
                                </span>
                              )}
                            </td>
                            <td className="p-1.5 px-2 text-right text-accent font-bold whitespace-nowrap">
                              {week.weeklyAcuteLoad.toFixed(0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div
                  className="p-6 rounded-xl text-center space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px dashed var(--border-subtle)',
                  }}
                >
                  <p className="text-sm font-bold text-primary">
                    No Google Sheet Linked for {targetAthlete.name} Yet
                  </p>
                  <p className="text-xs text-secondary max-w-lg mx-auto">
                    Paste <strong>{targetAthlete.name}</strong>&apos;s Google Sheet link in Step 2 above and click{' '}
                    <strong>&quot;Link &amp; Sync {targetAthlete.name}&apos;s Sheet 🔄&quot;</strong> (or upload an exported <code>.html</code> file) to preview and assign their color-coded running schedule.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Plan Meta Inputs */}
          <div className="plan-meta-row">
            <div className="plan-meta-field flex-1">
              <label className="text-xs text-muted">Plan Title</label>
              <input
                type="text"
                className="input-text font-semibold"
                value={activePlan.title}
                onChange={(e) => setActivePlan({ ...activePlan, title: e.target.value })}
                placeholder="Enter plan title"
              />
            </div>

            <div className="plan-meta-field w-36">
              <label className="text-xs text-muted">Start Date</label>
              <input
                type="date"
                className="input-date font-mono"
                value={activePlan.startDate}
                onChange={(e) => setActivePlan({ ...activePlan, startDate: e.target.value })}
              />
            </div>

            <div className="plan-meta-field w-28">
              <label className="text-xs text-muted">Plan Code</label>
              <span className="font-mono text-sm text-primary font-bold">{activePlan.code}</span>
            </div>
          </div>

          {/* Plan Duration Selector (1 Week, 2 Weeks, 3 Weeks, 4 Weeks / Month) */}
          <div className="plan-duration-strip">
            <span className="text-xxs text-muted uppercase font-mono mr-2">Duration:</span>
            <div className="duration-pills">
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 1 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(1)}
              >
                1 Week
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 2 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(2)}
              >
                2 Weeks
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 3 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(3)}
              >
                3 Weeks
              </button>
              <button
                type="button"
                className={`btn-duration-pill ${weeksCount === 4 ? 'active' : ''}`}
                onClick={() => handleSetDurationWeeks(4)}
              >
                4 Weeks
              </button>
              <button
                type="button"
                className="btn-duration-add font-mono"
                onClick={handleAddExtraWeek}
                title="Add another week"
              >
                + Add Week
              </button>
            </div>
          </div>

          {/* Multi-Week Workload Stats Summary */}
          <div className="plan-stats-strip">
            <div className="plan-stat">
              <span className="plan-stat-label">Total Distance</span>
              <span className="plan-stat-val font-mono">
                {totalPlanMiles.toFixed(1)} mi ({weeksCount}w)
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Total Workload</span>
              <span className="plan-stat-val font-mono text-primary font-bold">
                {totalPlanAcuteLoad.toFixed(1)}
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Week {activeWeekTab + 1} Workload</span>
              <span className="plan-stat-val font-mono text-primary font-bold">
                {currentTabAcuteLoad.toFixed(1)} ({currentTabMiles.toFixed(1)} mi)
              </span>
            </div>
            <div className="plan-stat">
              <span className="plan-stat-label">Coach</span>
              <span className="plan-stat-val text-primary font-bold">{activePlan.coachName}</span>
            </div>
          </div>

          {/* Week Tab Navigation if Multi-Week */}
          {weeksCount > 1 && (
            <div className="plan-week-tabs">
              {Array.from({ length: weeksCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn-plan-week-tab ${activeWeekTab === i ? 'active' : ''}`}
                  onClick={() => setActiveWeekTab(i)}
                >
                  Week {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* 7 Days Grid for Active Week */}
          <div className="plan-days-container">
            <div className="plan-days-header-strip">
              <span className="text-xs font-mono font-bold text-primary uppercase">
                Week {activeWeekTab + 1}
              </span>
              <span className="text-xxs text-muted font-mono">
                Days {activeWeekTab * 7 + 1}–{activeWeekTab * 7 + 7}
              </span>
            </div>

            <div className="plan-days-list">
              {currentTabDays.map((day, offsetIdx) => {
                const globalIdx = activeWeekTab * 7 + offsetIdx;
                const dayDate = addDays(activePlan.startDate, globalIdx);

                return (
                  <div key={globalIdx} className="plan-day-card">
                    {/* Top Row: Day Number, Date, Run Type, Distance */}
                    <div className="plan-day-top-row">
                      <div className="flex items-center gap-2">
                        <span className="plan-day-badge font-mono">Day {globalIdx + 1}</span>
                        <span className="font-mono text-xs text-muted">{dayDate}</span>
                      </div>

                      <div className="plan-day-inputs-cluster">
                        <select
                          className="select-field text-xs font-mono"
                          value={day.runType}
                          onChange={(e) => handleUpdateDay(globalIdx, { runType: e.target.value })}
                        >
                          {DEFAULT_RUN_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} (×{t.multiplier})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="input-field input-field-sm font-mono"
                            value={day.targetDistance}
                            onChange={(e) =>
                              handleUpdateDay(globalIdx, {
                                targetDistance: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                          <span className="btn-unit-tag font-mono text-xxs">
                            {day.distanceUnit.toUpperCase()}
                          </span>
                        </div>

                        <span className="plan-day-load-tag font-mono text-xs text-primary">
                          Workload: {(day.targetDistance * getRunTypeMultiplier(day.runType)).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Full-Width Textarea for Notes to Guarantee Zero Horizontal Overflow */}
                    <div className="plan-day-notes-wrapper">
                      <textarea
                        rows={2}
                        className="plan-day-textarea"
                        placeholder="Workout instructions..."
                        value={day.instructions}
                        onChange={(e) =>
                          handleUpdateDay(globalIdx, { instructions: e.target.value })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* QR Code Presentation */}
          {showQr && (
            <div className="qr-reveal-card">
              <div className="qr-box">
                {qrDataUrl && <img src={qrDataUrl} alt="Plan QR Code" className="qr-image" />}
                <p className="qr-caption font-mono">
                  Scan to load plan on mobile
                </p>
              </div>

              <div className="qr-actions">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-safe text-xxs font-mono font-bold">READY TO SCAN</span>
                  <span className="text-xxs text-muted font-mono">Code: {activePlan.code}</span>
                </div>

                {isLocalHost && (
                  <div className="mb-2">
                    <label className="text-xxs text-secondary font-mono block mb-1">
                      Phone Wi-Fi URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input-field text-xs font-mono flex-1"
                        value={targetHost}
                        onChange={(e) => setTargetHost(e.target.value)}
                        placeholder="e.g. http://192.168.88.15:5173"
                      />
                      <button
                        type="button"
                        className="btn-duration-pill active"
                        onClick={generateQrForPlan}
                        title="Regenerate QR code with this address"
                      >
                        Update QR
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn-action-primary"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? '✓ Link Copied to Clipboard' : 'Copy Plan URL'}
                </button>

                <button
                  type="button"
                  className="btn-action-secondary mt-1"
                  onClick={() => onOpenAsAthlete(activePlan)}
                >
                  Open Athlete View →
                </button>
              </div>
            </div>
          )}
            </>
          )}
        </div>

        <div className="modal-footer flex items-center justify-between">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>
          
          <div className="flex items-center gap-2">
            {isCoach && onAssignRuns && builderMode === 'sheets' && parsedSheetTab && (
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleAssignGoogleSheetDirectly}
                title={`Assign ${parsedSheetTab.weeks.length}-week Google Sheet "${parsedSheetTab.tabName}" plan (${parsedSheetTab.totalMiles} mi) directly to ${targetAthlete.name}'s calendar`}
              >
                Assign {parsedSheetTab.weeks.length}-Week &quot;{parsedSheetTab.tabName}&quot; Sheet to {targetAthlete.name} →
              </button>
            )}
            {isCoach && onAssignRuns && builderMode === 'manual' && (
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleAssignPlanDirectly}
                title={`Assign all workouts in this plan directly to ${targetAthlete.name}'s calendar`}
              >
                Assign Plan to {targetAthlete.name} →
              </button>
            )}
            <button
              type="button"
              className="btn-save-plan"
              onClick={generateQrForPlan}
            >
              Generate QR Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
