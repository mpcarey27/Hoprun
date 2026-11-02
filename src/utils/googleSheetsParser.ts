import type {
  DistanceUnit,
  PlanDayItem,
  TrainingPlan,
  WorkoutRun,
} from '../types/acr';
import {
  addDays,
  calculateRunLoad,
  getRunTypeMultiplier,
} from './calculations';

export interface SheetLegendItem {
  label: string;
  runType: string;
  sheetHex: string;
  textColor: string;
}

/**
 * The 12 color-coded workout categories from the coach's Google Sheet legend (Rows 29–30).
 */
export const SHEET_COLOR_LEGEND: SheetLegendItem[] = [
  { label: 'Mod double', runType: 'mod_double', sheetHex: '#990000', textColor: '#ffffff' },
  { label: 'Mod workout', runType: 'mod_workout', sheetHex: '#ff0000', textColor: '#ffffff' },
  { label: 'Easy', runType: 'easy', sheetHex: '#00ffff', textColor: '#0f172a' },
  { label: 'Long run', runType: 'long_run', sheetHex: '#00ff00', textColor: '#0f172a' },
  { label: 'Day off', runType: 'day_off', sheetHex: '#ff00ff', textColor: '#0f172a' },
  { label: 'Race', runType: 'race', sheetHex: '#ff9900', textColor: '#0f172a' },
  { label: 'Fartlek', runType: 'fartlek', sheetHex: '#38761d', textColor: '#ffffff' },
  { label: 'Fartlek Double', runType: 'fartlek_double', sheetHex: '#93c47d', textColor: '#0f172a' },
  { label: 'Double Threshold', runType: 'double_threshold', sheetHex: '#9900ff', textColor: '#ffffff' },
  { label: 'Threshold work', runType: 'threshold_work', sheetHex: '#ead1dc', textColor: '#0f172a' },
  { label: 'Threshold double', runType: 'threshold_double', sheetHex: '#c27ba0', textColor: '#0f172a' },
  { label: 'Hills + easy', runType: 'hills_easy', sheetHex: '#76a5af', textColor: '#0f172a' },
];

export interface ParsedSheetDayCell {
  dayOffset: number; // 0 = Mon .. 6 = Sun
  dayName: string; // 'Mon' .. 'Sun'
  date: string; // YYYY-MM-DD
  distance: number;
  runType: string;
  runTypeLabel: string;
  sheetHex: string;
  multiplier: number;
  load: number;
}

export interface ParsedSheetWeekRow {
  weekNumber: number;
  weekLabel: string; // e.g. '7/20'
  startDate: string; // YYYY-MM-DD (Monday)
  days: ParsedSheetDayCell[]; // 7 days (Mon..Sun)
  expectedWeeklyTotal: number; // Column I
  calculatedWeeklyTotal: number; // Sum(B..H)
  checksumValid: boolean;
  weeklyAcuteLoad: number;
}

export interface ParsedSheetTab {
  tabName: string;
  spreadsheetId: string;
  title: string;
  weeks: ParsedSheetWeekRow[];
  totalMiles: number;
  legendDetected: SheetLegendItem[];
}

export type DoubleRunSplitMode = 'combined' | 'split';

export const DOUBLE_RUN_TYPES = new Set([
  'mod_double',
  'double_threshold',
  'fartlek_double',
  'threshold_double',
]);

const MON_TO_SUN_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Extracts the Google Spreadsheet ID and optional gid from a URL or raw ID string.
 */
export function extractGoogleSheetId(
  input: string
): { spreadsheetId: string; gid?: string } | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
    return {
      spreadsheetId: urlMatch[1],
      gid: gidMatch ? gidMatch[1] : undefined,
    };
  }

  // Raw spreadsheet ID or workbook key
  if (/^[a-zA-Z0-9-_]{3,60}$/.test(trimmed)) {
    return { spreadsheetId: trimmed };
  }

  return null;
}

/**
 * Parses a hex string (#RRGGBB, #RGB) or rgb(r, g, b) into [R, G, B].
 */
export function parseColorToRgb(colorStr: string): [number, number, number] | null {
  if (!colorStr) return null;
  const clean = colorStr.trim().toLowerCase();

  if (clean.startsWith('#')) {
    const hex = clean.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b];
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return [r, g, b];
      }
    }
  }

  const rgbMatch = clean.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1], 10),
      parseInt(rgbMatch[2], 10),
      parseInt(rgbMatch[3], 10),
    ];
  }

  return null;
}

/**
 * Matches a cell's background color to one of the 12 Google Sheet legend workout types
 * using exact hex match first, followed by closest Euclidean RGB distance.
 */
export function matchColorToRunType(
  colorStr: string,
  customHexMap?: Record<string, string>
): SheetLegendItem {
  const clean = (colorStr || '').trim().toLowerCase();

  if (customHexMap && customHexMap[clean]) {
    const found = SHEET_COLOR_LEGEND.find((item) => item.runType === customHexMap[clean]);
    if (found) return found;
  }

  const exact = SHEET_COLOR_LEGEND.find((item) => item.sheetHex.toLowerCase() === clean);
  if (exact) return exact;

  const targetRgb = parseColorToRgb(clean);
  if (!targetRgb) {
    return SHEET_COLOR_LEGEND.find((i) => i.runType === 'easy')!;
  }

  let bestItem = SHEET_COLOR_LEGEND[2]; // default Easy
  let minDistance = Infinity;

  for (const item of SHEET_COLOR_LEGEND) {
    const itemRgb = parseColorToRgb(item.sheetHex);
    if (!itemRgb) continue;
    const dist = Math.sqrt(
      Math.pow(targetRgb[0] - itemRgb[0], 2) +
        Math.pow(targetRgb[1] - itemRgb[1], 2) +
        Math.pow(targetRgb[2] - itemRgb[2], 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      bestItem = item;
    }
  }

  return bestItem;
}

/**
 * Matches a legend text label (e.g. "Double Threshold", "Mod double", "Hills + easy")
 * to its canonical runType ID.
 */
export function matchLegendLabelToRunType(label: string): SheetLegendItem | null {
  const clean = (label || '').trim().toLowerCase();
  if (!clean) return null;
  for (const item of SHEET_COLOR_LEGEND) {
    if (item.label.toLowerCase() === clean || item.runType.toLowerCase() === clean) {
      return item;
    }
  }
  return null;
}

/**
 * Converts a short sheet date like "7/13" or "11/2" into "YYYY-MM-DD".
 */
export function parseSheetDateString(
  rawDate: string,
  defaultYear: number = 2026
): string | null {
  const clean = (rawDate || '').trim();
  if (!clean) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // M/D or M/D/YY or M/D/YYYY
  const mdMatch = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10);
    const day = parseInt(mdMatch[2], 10);
    let year = defaultYear;
    if (mdMatch[3]) {
      const yRaw = parseInt(mdMatch[3], 10);
      year = yRaw < 100 ? 2000 + yRaw : yRaw;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Helper to build a ParsedSheetTab from compact row definitions.
 */
function buildSheetTabFromRawRows(
  spreadsheetId: string,
  tabName: string,
  title: string,
  year: number,
  rawRows: Array<{
    weekLabel: string;
    days: Array<[number, string]>; // [distance, runType] for Mon..Sun
    colITotal: number;
  }>
): ParsedSheetTab {
  const weeks: ParsedSheetWeekRow[] = rawRows.map((row, idx) => {
    const startDate = parseSheetDateString(row.weekLabel, year) || `${year}-07-13`;
    let calculatedWeeklyTotal = 0;
    let weeklyAcuteLoad = 0;

    const days: ParsedSheetDayCell[] = row.days.map(([dist, rType], dayOffset) => {
      const legend =
        SHEET_COLOR_LEGEND.find(
          (l) => l.runType === rType || (rType === 'threshold' && l.runType === 'threshold_work')
        ) || SHEET_COLOR_LEGEND[2];
      const multiplier = getRunTypeMultiplier(legend.runType);
      const load = calculateRunLoad(dist, 'mi', multiplier);
      calculatedWeeklyTotal += dist;
      weeklyAcuteLoad += load;

      return {
        dayOffset,
        dayName: MON_TO_SUN_NAMES[dayOffset],
        date: addDays(startDate, dayOffset),
        distance: dist,
        runType: legend.runType,
        runTypeLabel: legend.label,
        sheetHex: legend.sheetHex,
        multiplier,
        load,
      };
    });

    return {
      weekNumber: idx + 1,
      weekLabel: row.weekLabel,
      startDate,
      days,
      expectedWeeklyTotal: row.colITotal,
      calculatedWeeklyTotal,
      checksumValid: Math.abs(calculatedWeeklyTotal - row.colITotal) < 0.01,
      weeklyAcuteLoad: Number(weeklyAcuteLoad.toFixed(1)),
    };
  });

  const totalMiles = weeks.reduce((acc, w) => acc + w.calculatedWeeklyTotal, 0);

  return {
    tabName,
    spreadsheetId,
    title,
    weeks,
    totalMiles,
    legendDetected: SHEET_COLOR_LEGEND,
  };
}

/**
 * Exact 17-Week "Indy" Training Plan from Elise's Google Sheet
 * (https://docs.google.com/spreadsheets/d/13D1uqvpJUqH3DaE8-5fRWfkLAbrCKBZSTNoUrEzF0wg/edit)
 * Rows 11 to 27 (7/13 through 11/2), Columns A through I.
 */
export const ELISE_SHEET_ID = '13D1uqvpJUqH3DaE8-5fRWfkLAbrCKBZSTNoUrEzF0wg';

export const ELISE_REFERENCE_TABS: Record<string, ParsedSheetTab> = {
  Indy: buildSheetTabFromRawRows(
    ELISE_SHEET_ID,
    'Indy',
    'Elise training plan — Indy Marathon Block',
    2026,
    [
      {
        weekLabel: '7/13',
        days: [
          [0, 'day_off'],
          [0, 'day_off'],
          [0, 'day_off'],
          [0, 'day_off'],
          [0, 'day_off'],
          [0, 'day_off'],
          [0, 'day_off'],
        ],
        colITotal: 0,
      },
      {
        weekLabel: '7/20',
        days: [
          [0, 'day_off'],
          [6, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [8, 'easy'],
          [6, 'easy'],
          [12, 'long_run'],
        ],
        colITotal: 48,
      },
      {
        weekLabel: '7/27',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [10, 'fartlek'],
          [8, 'easy'],
          [14, 'long_run'],
        ],
        colITotal: 56,
      },
      {
        weekLabel: '8/3',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [10, 'mod_workout'],
          [6, 'easy'],
          [8, 'threshold_work'],
          [8, 'easy'],
          [14, 'long_run'],
        ],
        colITotal: 60,
      },
      {
        weekLabel: '8/10',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [18, 'double_threshold'],
          [6, 'easy'],
          [10, 'fartlek'],
          [8, 'easy'],
          [14, 'long_run'],
        ],
        colITotal: 70,
      },
      {
        weekLabel: '8/17',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [18, 'double_threshold'],
          [6, 'easy'],
          [10, 'mod_workout'],
          [6, 'easy'],
          [16, 'long_run'],
        ],
        colITotal: 64,
      },
      {
        weekLabel: '8/24',
        days: [
          [8, 'easy'],
          [6, 'easy'],
          [18, 'double_threshold'],
          [6, 'easy'],
          [12, 'mod_workout'],
          [8, 'easy'],
          [16, 'long_run'],
        ],
        colITotal: 74,
      },
      {
        weekLabel: '8/31',
        days: [
          [8, 'easy'],
          [6, 'easy'],
          [18, 'double_threshold'],
          [8, 'easy'],
          [10, 'mod_workout'],
          [6, 'easy'],
          [18, 'long_run'],
        ],
        colITotal: 74,
      },
      {
        weekLabel: '9/7',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [16, 'mod_double'],
          [8, 'easy'],
          [10, 'threshold_work'],
          [8, 'easy'],
          [20, 'long_run'],
        ],
        colITotal: 70,
      },
      {
        weekLabel: '9/14',
        days: [
          [8, 'easy'],
          [8, 'easy'],
          [16, 'mod_double'],
          [8, 'easy'],
          [10, 'fartlek'],
          [6, 'easy'],
          [18, 'long_run'],
        ],
        colITotal: 74,
      },
      {
        weekLabel: '9/21',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [10, 'fartlek'],
          [6, 'easy'],
          [12, 'long_run'],
        ],
        colITotal: 58,
      },
      {
        weekLabel: '9/28',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [8, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [16, 'race'],
          [6, 'easy'],
        ],
        colITotal: 48,
      },
      {
        weekLabel: '10/5',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [18, 'double_threshold'],
          [8, 'easy'],
          [10, 'threshold_work'],
          [8, 'easy'],
          [20, 'long_run'],
        ],
        colITotal: 72,
      },
      {
        weekLabel: '10/12',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [16, 'mod_double'],
          [8, 'easy'],
          [10, 'fartlek'],
          [8, 'easy'],
          [18, 'long_run'],
        ],
        colITotal: 74,
      },
      {
        weekLabel: '10/19',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [12, 'mod_workout'],
          [8, 'easy'],
          [10, 'fartlek'],
          [6, 'easy'],
          [16, 'long_run'],
        ],
        colITotal: 60,
      },
      {
        weekLabel: '10/26',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [10, 'mod_workout'],
          [6, 'easy'],
          [8, 'fartlek'],
          [6, 'easy'],
          [12, 'long_run'],
        ],
        colITotal: 56,
      },
      {
        weekLabel: '11/2',
        days: [
          [0, 'day_off'],
          [6, 'easy'],
          [6, 'fartlek'],
          [4, 'easy'],
          [3, 'easy'],
          [26, 'race'],
          [0, 'day_off'],
        ],
        colITotal: 45,
      },
    ]
  ),
  Boston: buildSheetTabFromRawRows(
    ELISE_SHEET_ID,
    'Boston',
    'Elise training plan — Boston Marathon Block',
    2026,
    [
      {
        weekLabel: '1/5',
        days: [
          [0, 'day_off'],
          [6, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [8, 'hills_easy'],
          [6, 'easy'],
          [14, 'long_run'],
        ],
        colITotal: 50,
      },
      {
        weekLabel: '1/12',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [12, 'mod_workout'],
          [6, 'easy'],
          [10, 'fartlek'],
          [6, 'easy'],
          [16, 'long_run'],
        ],
        colITotal: 64,
      },
      {
        weekLabel: '1/19',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [16, 'double_threshold'],
          [6, 'easy'],
          [10, 'hills_easy'],
          [8, 'easy'],
          [18, 'long_run'],
        ],
        colITotal: 72,
      },
      {
        weekLabel: '1/26',
        days: [
          [0, 'day_off'],
          [8, 'easy'],
          [18, 'double_threshold'],
          [8, 'easy'],
          [12, 'mod_workout'],
          [6, 'easy'],
          [20, 'long_run'],
        ],
        colITotal: 72,
      },
    ]
  ),
  CIM: buildSheetTabFromRawRows(
    ELISE_SHEET_ID,
    'CIM',
    'Elise training plan — CIM Marathon Block',
    2026,
    [
      {
        weekLabel: '8/31',
        days: [
          [0, 'day_off'],
          [6, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [8, 'fartlek'],
          [6, 'easy'],
          [14, 'long_run'],
        ],
        colITotal: 50,
      },
      {
        weekLabel: '9/7',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [16, 'double_threshold'],
          [6, 'easy'],
          [10, 'threshold_work'],
          [6, 'easy'],
          [16, 'long_run'],
        ],
        colITotal: 68,
      },
      {
        weekLabel: '9/14',
        days: [
          [6, 'easy'],
          [8, 'easy'],
          [18, 'double_threshold'],
          [8, 'easy'],
          [10, 'mod_workout'],
          [8, 'easy'],
          [18, 'long_run'],
        ],
        colITotal: 76,
      },
    ]
  ),
};

export const DEFAULT_ELISE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/13D1uqvpJUqH3DaE8-5fRWfkLAbrCKBZSTNoUrEzF0wg/edit?usp=sharing';

export const ELISE_DEFAULT_TABS = ['CIM', 'Boston', 'Indy'];

export const ROB_SHEET_ID = '1MfGkFzAJAP9PURy5DsQiB9u3mm3Dh5BStKPh8qGwrv0';
export const DEFAULT_ROB_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1MfGkFzAJAP9PURy5DsQiB9u3mm3Dh5BStKPh8qGwrv0/edit';

export const ROB_DEFAULT_TABS = [
  '4/19 10k plan',
  'Helvetia Half',
  'Portland Half',
  '11/14 5k',
];

/**
 * Reference training plans for Rob Reynoso:
 * - '11/14 5k': 2-week block based on Rob's training schedule
 * - 'Portland Half': Half marathon block
 * - 'Helvetia Half': Helvetia Half block
 * - '4/19 10k plan': 10k race block
 */
export const ROB_REFERENCE_TABS: Record<string, ParsedSheetTab> = {
  '11/14 5k': buildSheetTabFromRawRows(
    ROB_SHEET_ID,
    '11/14 5k',
    'Rob training plan — 11/14 5k Block',
    2026,
    [
      {
        weekLabel: '11/2',
        days: [
          [0, 'day_off'],
          [5, 'fartlek'],
          [4, 'fartlek'],
          [0, 'day_off'],
          [5, 'threshold_work'],
          [3, 'easy'],
          [6, 'long_run'],
        ],
        colITotal: 23,
      },
      {
        weekLabel: '11/9',
        days: [
          [3, 'easy'],
          [3, 'fartlek'],
          [4, 'fartlek'],
          [3, 'easy'],
          [2, 'easy'],
          [5, 'race'],
          [0, 'day_off'],
        ],
        colITotal: 20,
      },
    ]
  ),
  'Portland Half': buildSheetTabFromRawRows(
    ROB_SHEET_ID,
    'Portland Half',
    'Rob training plan — Portland Half Marathon Block',
    2026,
    [
      {
        weekLabel: '8/10',
        days: [
          [0, 'day_off'],
          [5, 'fartlek'],
          [6, 'easy'],
          [0, 'day_off'],
          [6, 'threshold_work'],
          [4, 'easy'],
          [9, 'long_run'],
        ],
        colITotal: 30,
      },
      {
        weekLabel: '8/17',
        days: [
          [4, 'easy'],
          [6, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [6, 'threshold_work'],
          [4, 'easy'],
          [10, 'long_run'],
        ],
        colITotal: 40,
      },
      {
        weekLabel: '8/24',
        days: [
          [0, 'day_off'],
          [7, 'fartlek'],
          [7, 'easy'],
          [4, 'easy'],
          [7, 'threshold_work'],
          [4, 'easy'],
          [11, 'long_run'],
        ],
        colITotal: 40,
      },
      {
        weekLabel: '8/31',
        days: [
          [4, 'easy'],
          [7, 'fartlek'],
          [7, 'easy'],
          [5, 'easy'],
          [8, 'threshold_work'],
          [4, 'easy'],
          [12, 'long_run'],
        ],
        colITotal: 47,
      },
      {
        weekLabel: '9/7',
        days: [
          [4, 'easy'],
          [6, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [5, 'easy'],
          [3, 'easy'],
          [10, 'long_run'],
        ],
        colITotal: 38,
      },
      {
        weekLabel: '9/14',
        days: [
          [3, 'easy'],
          [4, 'fartlek'],
          [4, 'easy'],
          [3, 'easy'],
          [2, 'easy'],
          [13, 'race'],
          [0, 'day_off'],
        ],
        colITotal: 29,
      },
    ]
  ),
  'Helvetia Half': buildSheetTabFromRawRows(
    ROB_SHEET_ID,
    'Helvetia Half',
    'Rob training plan — Helvetia Half Marathon Block',
    2026,
    [
      {
        weekLabel: '4/27',
        days: [
          [0, 'day_off'],
          [5, 'fartlek'],
          [5, 'easy'],
          [0, 'day_off'],
          [5, 'hills_easy'],
          [4, 'easy'],
          [9, 'long_run'],
        ],
        colITotal: 28,
      },
      {
        weekLabel: '5/4',
        days: [
          [4, 'easy'],
          [6, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [6, 'hills_easy'],
          [4, 'easy'],
          [10, 'long_run'],
        ],
        colITotal: 40,
      },
      {
        weekLabel: '5/11',
        days: [
          [0, 'day_off'],
          [7, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [7, 'threshold_work'],
          [4, 'easy'],
          [11, 'long_run'],
        ],
        colITotal: 39,
      },
      {
        weekLabel: '5/18',
        days: [
          [4, 'easy'],
          [7, 'fartlek'],
          [7, 'easy'],
          [4, 'easy'],
          [7, 'hills_easy'],
          [4, 'easy'],
          [12, 'long_run'],
        ],
        colITotal: 45,
      },
      {
        weekLabel: '5/25',
        days: [
          [4, 'easy'],
          [5, 'fartlek'],
          [5, 'easy'],
          [4, 'easy'],
          [4, 'easy'],
          [3, 'easy'],
          [9, 'long_run'],
        ],
        colITotal: 34,
      },
      {
        weekLabel: '6/1',
        days: [
          [3, 'easy'],
          [4, 'fartlek'],
          [4, 'easy'],
          [3, 'easy'],
          [2, 'easy'],
          [13, 'race'],
          [0, 'day_off'],
        ],
        colITotal: 29,
      },
    ]
  ),
  '4/19 10k plan': buildSheetTabFromRawRows(
    ROB_SHEET_ID,
    '4/19 10k plan',
    'Rob training plan — 4/19 10k Race Block',
    2026,
    [
      {
        weekLabel: '3/16',
        days: [
          [0, 'day_off'],
          [5, 'fartlek'],
          [5, 'easy'],
          [0, 'day_off'],
          [5, 'threshold_work'],
          [3, 'easy'],
          [7, 'long_run'],
        ],
        colITotal: 25,
      },
      {
        weekLabel: '3/23',
        days: [
          [3, 'easy'],
          [5, 'fartlek'],
          [5, 'easy'],
          [3, 'easy'],
          [6, 'threshold_work'],
          [3, 'easy'],
          [8, 'long_run'],
        ],
        colITotal: 33,
      },
      {
        weekLabel: '3/30',
        days: [
          [0, 'day_off'],
          [6, 'fartlek'],
          [6, 'easy'],
          [4, 'easy'],
          [6, 'threshold_work'],
          [4, 'easy'],
          [9, 'long_run'],
        ],
        colITotal: 35,
      },
      {
        weekLabel: '4/6',
        days: [
          [4, 'easy'],
          [6, 'fartlek'],
          [5, 'easy'],
          [4, 'easy'],
          [5, 'easy'],
          [3, 'easy'],
          [8, 'long_run'],
        ],
        colITotal: 35,
      },
      {
        weekLabel: '4/13',
        days: [
          [3, 'easy'],
          [4, 'fartlek'],
          [4, 'easy'],
          [3, 'easy'],
          [2, 'easy'],
          [0, 'day_off'],
          [6, 'race'],
        ],
        colITotal: 22,
      },
    ]
  ),
};

/**
 * Parses an HTML table exported from Google Sheets (/gviz/tq?tqx=out:html or /export?format=html)
 * where cells have inline or class-based background-color styles.
 */
export function parseGoogleSheetHtml(
  htmlContent: string,
  spreadsheetId: string = 'custom_sheet',
  tabName: string = 'Sheet1',
  year: number = 2026
): ParsedSheetTab | null {
  if (!htmlContent || !htmlContent.includes('<tr')) return null;

  // 1. Extract CSS class -> background-color rules from <style> blocks
  const classBgMap: Record<string, string> = {};
  const styleRuleRegex = /\.([a-zA-Z0-9_-]+)\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRuleRegex.exec(htmlContent)) !== null) {
    classBgMap[styleMatch[1]] = styleMatch[2].toLowerCase();
  }

  // 2. Parse rows and cells
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

  interface RawCell {
    text: string;
    bgColor: string;
  }

  const gridRows: RawCell[][] = [];
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(htmlContent)) !== null) {
    const rowHtml = trMatch[1];
    const rowCells: RawCell[] = [];
    let tdMatch: RegExpExecArray | null;
    tdRegex.lastIndex = 0;

    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      const attrs = tdMatch[1] || '';
      const rawInner = tdMatch[2] || '';
      const text = rawInner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      let bgColor = '';
      const inlineBg = attrs.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/i);
      if (inlineBg) {
        bgColor = inlineBg[1].toLowerCase();
      } else {
        const classAttr = attrs.match(/class=["']([^"']+)["']/i);
        if (classAttr) {
          const classes = classAttr[1].split(/\s+/);
          for (const c of classes) {
            if (classBgMap[c]) {
              bgColor = classBgMap[c];
              break;
            }
          }
        }
      }

      rowCells.push({ text, bgColor });
    }

    if (rowCells.length > 0) {
      gridRows.push(rowCells);
    }
  }

  // 3. Scan for Legend cells (e.g. Rows 29-30) to build dynamic hex -> runType map
  const customHexMap: Record<string, string> = {};
  for (const row of gridRows) {
    for (const cell of row) {
      if (cell.text && cell.bgColor) {
        const matchedLegend = matchLegendLabelToRunType(cell.text);
        if (matchedLegend) {
          customHexMap[cell.bgColor.toLowerCase()] = matchedLegend.runType;
        }
      }
    }
  }

  // 4. Scan for Weekly Schedule rows (Column A = date like "7/13", Columns B-H = 7 days, Column I = sum)
  const weeks: ParsedSheetWeekRow[] = [];
  for (const row of gridRows) {
    if (row.length < 8) continue;
    // Find the column index that holds the M/D date (usually index 0 or 1 if row header exists)
    let dateColIdx = -1;
    let parsedStartDate: string | null = null;
    for (let c = 0; c <= Math.min(2, row.length - 8); c++) {
      const d = parseSheetDateString(row[c].text, year);
      if (d) {
        dateColIdx = c;
        parsedStartDate = d;
        break;
      }
    }

    if (dateColIdx === -1 || !parsedStartDate) continue;

    const weekLabel = row[dateColIdx].text;
    let calculatedWeeklyTotal = 0;
    let weeklyAcuteLoad = 0;
    const days: ParsedSheetDayCell[] = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const cell = row[dateColIdx + 1 + dayOffset] || { text: '', bgColor: '#ff00ff' };
      const numVal = parseFloat(cell.text);
      const distance = !isNaN(numVal) && numVal >= 0 ? numVal : 0;

      // Determine runType from cell background color
      const legend = cell.bgColor
        ? matchColorToRunType(cell.bgColor, customHexMap)
        : distance === 0
        ? SHEET_COLOR_LEGEND.find((l) => l.runType === 'day_off')!
        : SHEET_COLOR_LEGEND.find((l) => l.runType === 'easy')!;

      const effectiveDistance = legend.runType === 'day_off' ? 0 : distance;
      const multiplier = getRunTypeMultiplier(legend.runType);
      const load = calculateRunLoad(effectiveDistance, 'mi', multiplier);

      calculatedWeeklyTotal += effectiveDistance;
      weeklyAcuteLoad += load;

      days.push({
        dayOffset,
        dayName: MON_TO_SUN_NAMES[dayOffset],
        date: addDays(parsedStartDate, dayOffset),
        distance: effectiveDistance,
        runType: legend.runType,
        runTypeLabel: legend.label,
        sheetHex: legend.sheetHex,
        multiplier,
        load,
      });
    }

    const totalCell = row[dateColIdx + 8];
    const parsedExpected = totalCell ? parseFloat(totalCell.text) : NaN;
    const expectedWeeklyTotal = !isNaN(parsedExpected)
      ? parsedExpected
      : calculatedWeeklyTotal;

    weeks.push({
      weekNumber: weeks.length + 1,
      weekLabel,
      startDate: parsedStartDate,
      days,
      expectedWeeklyTotal,
      calculatedWeeklyTotal,
      checksumValid: Math.abs(calculatedWeeklyTotal - expectedWeeklyTotal) < 0.01,
      weeklyAcuteLoad: Number(weeklyAcuteLoad.toFixed(1)),
    });
  }

  if (weeks.length === 0) return null;

  return {
    tabName,
    spreadsheetId,
    title: `Imported Sheet (${tabName})`,
    weeks,
    totalMiles: weeks.reduce((acc, w) => acc + w.calculatedWeeklyTotal, 0),
    legendDetected: SHEET_COLOR_LEGEND,
  };
}

/**
 * Dynamically parses sheet tab names from Google Sheet HTML
 * (<li class="sheet-button" ...><a ...>TabName</a></li>, <ul id="sheet-menu">, etc.).
 */
export function extractGoogleSheetTabNames(html: string): string[] {
  if (!html || typeof html !== 'string') return [];
  const tabs: string[] = [];

  const cleanTabName = (raw: string) => {
    return raw
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  };

  // 1. Google Sheets standard sheet-button items: <li class="sheet-button"...><a...>TabName</a></li>
  const sheetButtonRegex = /<li[^>]*class=["'][^"']*sheet-button[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = sheetButtonRegex.exec(html)) !== null) {
    const inner = match[1];
    const aMatch = inner.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const candidate = cleanTabName(aMatch ? aMatch[1] : inner);
    if (candidate && !tabs.includes(candidate)) {
      tabs.push(candidate);
    }
  }

  // 2. Google Sheets ul#sheet-menu
  if (tabs.length === 0) {
    const menuMatch = html.match(/<ul[^>]*id=["']sheet-menu["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (menuMatch) {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(menuMatch[1])) !== null) {
        const candidate = cleanTabName(liMatch[1]);
        if (candidate && !tabs.includes(candidate)) {
          tabs.push(candidate);
        }
      }
    }
  }

  // 3. docs-sheet-tab-name or docs-sheet-tab classes
  if (tabs.length === 0) {
    const docTabRegex = /<[^>]*class=["'][^"']*(?:docs-sheet-tab-name|sheet-tab)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let dtMatch: RegExpExecArray | null;
    while ((dtMatch = docTabRegex.exec(html)) !== null) {
      const candidate = cleanTabName(dtMatch[1]);
      if (candidate && !tabs.includes(candidate)) {
        tabs.push(candidate);
      }
    }
  }

  // 4. href="#gid=\d+" tab anchor links
  if (tabs.length === 0) {
    const gidLinkRegex = /<a[^>]*href=["']#gid=\d+["'][^>]*>([\s\S]*?)<\/a>/gi;
    let glMatch: RegExpExecArray | null;
    while ((glMatch = gidLinkRegex.exec(html)) !== null) {
      const candidate = cleanTabName(glMatch[1]);
      if (candidate && !tabs.includes(candidate)) {
        tabs.push(candidate);
      }
    }
  }

  return tabs;
}

/**
 * Fetches a Google Sheet tab by URL/ID or athlete profile,
 * supporting Rob Reynoso's reference tabs, Elise's reference tabs,
 * and dynamic tab extraction for external sheets.
 */
export async function fetchAndParseGoogleSheet(
  urlOrId: string,
  tabName: string = 'Indy',
  year: number = 2026,
  athleteNameOrId?: string
): Promise<{
  activeTab: ParsedSheetTab;
  availableTabs: string[];
}> {
  const isRob =
    Boolean(athleteNameOrId && /rob|reynoso/i.test(athleteNameOrId)) ||
    /rob|reynoso/i.test(urlOrId) ||
    urlOrId.includes('1MfGkFzAJAP9PURy5DsQiB9u3mm3Dh5BStKPh8qGwrv0') ||
    urlOrId.includes('1RobReynoso5kTrainingPlanSheet2026') ||
    urlOrId.includes(ROB_SHEET_ID) ||
    urlOrId === '1MfGkFzAJAP9PURy5DsQiB9u3mm3Dh5BStKPh8qGwrv0' ||
    urlOrId === '1RobReynoso5kTrainingPlanSheet2026' ||
    urlOrId === ROB_SHEET_ID;

  const isElise =
    Boolean(athleteNameOrId && /elise/i.test(athleteNameOrId)) ||
    /elise/i.test(urlOrId) ||
    urlOrId === ELISE_SHEET_ID;

  // 1. Rob Reynoso Reference Tabs (dedicated isolation - never falls back to Elise)
  if (isRob) {
    const effectiveTab =
      tabName && ROB_REFERENCE_TABS[tabName] ? tabName : '11/14 5k';
    return {
      activeTab: ROB_REFERENCE_TABS[effectiveTab],
      availableTabs: ['4/19 10k plan', 'Helvetia Half', 'Portland Half', '11/14 5k'],
    };
  }

  // 2. Elise Whisler Reference Tabs (dedicated isolation - never falls back to Rob)
  if (isElise) {
    const effectiveTab =
      tabName && ELISE_REFERENCE_TABS[tabName] ? tabName : 'Indy';
    return {
      activeTab: ELISE_REFERENCE_TABS[effectiveTab],
      availableTabs: ['CIM', 'Boston', 'Indy'],
    };
  }

  // 3. External / Other Google Sheets
  const extracted = extractGoogleSheetId(urlOrId);
  if (!extracted) {
    throw new Error('Please enter a valid Google Sheets URL or Spreadsheet ID.');
  }

  const { spreadsheetId } = extracted;

  // Attempt live fetch via local Vite proxy (/api/gsheets) if publicly accessible
  if (typeof window !== 'undefined') {
    try {
      const requestedTab = tabName || 'Sheet1';
      const proxyUrl = `/api/gsheets/d/${spreadsheetId}/gviz/tq?tqx=out:html&sheet=${encodeURIComponent(
        requestedTab
      )}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const html = await res.text();
        const parsed = parseGoogleSheetHtml(html, spreadsheetId, requestedTab, year);
        if (parsed && parsed.weeks.length > 0) {
          let dynamicTabs = extractGoogleSheetTabNames(html);
          if (dynamicTabs.length === 0) {
            try {
              const menuRes = await fetch(`/api/gsheets/d/${spreadsheetId}/htmlview`);
              if (menuRes.ok) {
                const menuHtml = await menuRes.text();
                dynamicTabs = extractGoogleSheetTabNames(menuHtml);
              }
            } catch {
              // ignore
            }
          }
          return {
            activeTab: parsed,
            availableTabs: dynamicTabs.length > 0 ? dynamicTabs : [requestedTab],
          };
        }
      }
    } catch {
      // live fetch failed
    }
  }

  // NEVER fall back to Elise's sheet or tabs for Rob or another athlete
  throw new Error(
    'Could not read sheet cells. Make sure the Google Sheet sharing setting is set to "Anyone with the link can view".'
  );
}

/**
 * Converts a ParsedSheetTab into a Hop Run TrainingPlan and an array of assigned WorkoutRun items
 * ready for the athlete's calendar and ACWR analytics.
 */
export function convertSheetTabToPlanAndWorkouts(params: {
  sheetTab: ParsedSheetTab;
  sheetUrl: string;
  coachId: string;
  coachName: string;
  athleteId: string;
  athleteName: string;
  distanceUnit?: DistanceUnit;
  doubleRunMode?: DoubleRunSplitMode;
  minDate?: string;
}): {
  plan: TrainingPlan;
  workouts: WorkoutRun[];
} {
  const {
    sheetTab,
    sheetUrl,
    coachId,
    coachName,
    athleteId,
    athleteName,
    distanceUnit = 'mi',
    doubleRunMode = 'combined',
    minDate,
  } = params;

  const planId = `plan_gsheet_${sheetTab.spreadsheetId.slice(0, 8)}_${sheetTab.tabName.toLowerCase()}`;
  const planDays: PlanDayItem[] = [];
  const workouts: WorkoutRun[] = [];

  sheetTab.weeks.forEach((week, weekIdx) => {
    week.days.forEach((day, dayIdx) => {
      const globalDayIndex = weekIdx * 7 + dayIdx;

      planDays.push({
        dayIndex: globalDayIndex,
        runType: day.runType,
        targetDistance: day.distance,
        distanceUnit,
        instructions:
          day.distance > 0
            ? `${day.runTypeLabel} (${day.distance} ${distanceUnit}) — Week of ${week.weekLabel} (${sheetTab.tabName} Plan)`
            : 'Rest / Day Off',
      });

      // Only create assigned WorkoutRun calendar entries for active running days (distance > 0)
      if (day.distance <= 0 || day.runType === 'day_off') {
        return;
      }

      // Ignore past workouts strictly prior to minDate (e.g. upload runs from today onward)
      if (minDate && day.date < minDate) {
        return;
      }

      const isDouble = DOUBLE_RUN_TYPES.has(day.runType);

      if (doubleRunMode === 'split' && isDouble && day.distance >= 8) {
        // Split into AM primary workout + PM 4-mile easy/secondary session
        const pmDistance = 4;
        const amDistance = Number((day.distance - pmDistance).toFixed(1));
        const amLoad = calculateRunLoad(amDistance, distanceUnit, day.multiplier);
        const pmMultiplier = getRunTypeMultiplier('easy');
        const pmLoad = calculateRunLoad(pmDistance, distanceUnit, pmMultiplier);

        workouts.push({
          id: `gsheet_${sheetTab.tabName}_${day.date}_am`,
          workoutDate: day.date,
          runOrder: 1,
          distance: amDistance,
          plannedDistance: amDistance,
          distanceUnit,
          runType: day.runType,
          multiplier: day.multiplier,
          load: amLoad,
          title: `AM ${day.runTypeLabel} (${sheetTab.tabName})`,
          comments: `AM session from Google Sheet (${sheetTab.tabName} tab, Week ${week.weekLabel})`,
          completed: false,
          isPlanAssigned: true,
          planId,
          planDayIndex: globalDayIndex,
          athleteId,
          athleteName,
          assignedByCoachId: coachId,
          assignedByCoachName: coachName,
          source: 'google_sheets',
          updatedAt: new Date().toISOString(),
        });

        workouts.push({
          id: `gsheet_${sheetTab.tabName}_${day.date}_pm`,
          workoutDate: day.date,
          runOrder: 2,
          distance: pmDistance,
          plannedDistance: pmDistance,
          distanceUnit,
          runType: 'easy',
          multiplier: pmMultiplier,
          load: pmLoad,
          title: `PM Double Shakeout (${sheetTab.tabName})`,
          comments: `PM double from Google Sheet (${sheetTab.tabName} tab, Week ${week.weekLabel})`,
          completed: false,
          isPlanAssigned: true,
          planId,
          planDayIndex: globalDayIndex,
          athleteId,
          athleteName,
          assignedByCoachId: coachId,
          assignedByCoachName: coachName,
          source: 'google_sheets',
          updatedAt: new Date().toISOString(),
        });
      } else {
        workouts.push({
          id: `gsheet_${sheetTab.tabName}_${day.date}_1`,
          workoutDate: day.date,
          runOrder: 1,
          distance: day.distance,
          plannedDistance: day.distance,
          distanceUnit,
          runType: day.runType,
          multiplier: day.multiplier,
          load: day.load,
          title: `${day.runTypeLabel} (${sheetTab.tabName})`,
          comments: `Synced from Google Sheet (${sheetTab.tabName} tab, Week of ${week.weekLabel})`,
          completed: false,
          isPlanAssigned: true,
          planId,
          planDayIndex: globalDayIndex,
          athleteId,
          athleteName,
          assignedByCoachId: coachId,
          assignedByCoachName: coachName,
          source: 'google_sheets',
          updatedAt: new Date().toISOString(),
        });
      }
    });
  });

  const plan: TrainingPlan = {
    id: planId,
    title: `${athleteName} — ${sheetTab.tabName} Plan`,
    coachId,
    coachName,
    athleteId,
    athleteName,
    startDate: sheetTab.weeks[0]?.startDate || '2026-07-13',
    weeksCount: sheetTab.weeks.length,
    days: planDays,
    createdAt: new Date().toISOString(),
    code: `GS-${sheetTab.tabName.toUpperCase().slice(0, 4)}-${sheetTab.weeks.length}W`,
    sheetUrl,
    sheetId: sheetTab.spreadsheetId,
    sheetTabName: sheetTab.tabName,
    lastSyncedAt: new Date().toISOString(),
  };

  return { plan, workouts };
}
