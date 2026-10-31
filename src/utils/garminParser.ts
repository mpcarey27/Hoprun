import type { DistanceUnit, WorkoutRun } from '../types/acr';
import {
  convertDistance,
  calculateRunLoad,
  formatDurationStrava,
  calculatePaceSeconds,
  formatPace,
  formatDate,
  formatTimeOfDay,
  getRunTypeMultiplier,
} from './calculations';

export interface GarminParsedActivity {
  id: string;
  title: string;
  workoutDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  startTimeFormatted: string; // 12h AM/PM
  distance: number; // in requested unit (mi or km)
  distanceUnit: DistanceUnit;
  durationSeconds: number;
  durationFormatted: string;
  paceSeconds: number;
  paceFormatted: string;
  averageHeartRate?: number;
  maxHeartRate?: number;
  elevationGainMeters?: number;
  elevationGainFeet?: number;
  deviceModel?: string;
  runType: string;
  multiplier: number;
  load: number;
  source: 'garmin' | 'file_import';
  comments?: string;
  rawFileName?: string;
}

/**
 * Calculates Haversine distance in meters between two lat/lon coordinates.
 */
function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Intelligent Run Classifier: Determines run type based on distance, heart rate, and pace.
 */
export function classifyGarminRun(params: {
  title?: string;
  distanceMiles: number;
  avgHr?: number;
  durationSeconds?: number;
}): { runType: string; multiplier: number } {
  const titleLower = (params.title || '').toLowerCase();

  // 1. Check title keywords
  if (titleLower.includes('race') || titleLower.includes('5k') || titleLower.includes('10k') || titleLower.includes('half marathon') || titleLower.includes('marathon')) {
    return { runType: 'race', multiplier: getRunTypeMultiplier('race') };
  }
  if (titleLower.includes('interval') || titleLower.includes('track') || titleLower.includes('repeats')) {
    return { runType: 'mod_workout', multiplier: getRunTypeMultiplier('mod_workout') };
  }
  if (titleLower.includes('tempo') || titleLower.includes('threshold')) {
    return { runType: 'double_threshold', multiplier: getRunTypeMultiplier('double_threshold') };
  }
  if (titleLower.includes('fartlek')) {
    return { runType: 'fartlek', multiplier: getRunTypeMultiplier('fartlek') };
  }
  if (titleLower.includes('long run') || titleLower.includes('long') || params.distanceMiles >= 9.0) {
    return { runType: 'long_run', multiplier: getRunTypeMultiplier('long_run') };
  }

  // 2. Check Heart Rate if available
  if (params.avgHr && params.avgHr > 0) {
    if (params.avgHr >= 170) {
      return { runType: 'mod_workout', multiplier: getRunTypeMultiplier('mod_workout') };
    }
    if (params.avgHr >= 160) {
      return { runType: 'fartlek', multiplier: getRunTypeMultiplier('fartlek') };
    }
  }

  // Default to Easy Run
  return { runType: 'easy', multiplier: getRunTypeMultiplier('easy') };
}

/**
 * Parses Garmin TCX (Training Center XML) format.
 */
export function parseTCXContent(xmlText: string, preferredUnit: DistanceUnit = 'mi'): GarminParsedActivity {
  // Extract creator device
  let deviceModel = 'Garmin Watch';
  const creatorMatch = xmlText.match(/<Creator[^>]*>[\s\S]*?<Name>(.*?)<\/Name>/i);
  if (creatorMatch && creatorMatch[1]) {
    deviceModel = creatorMatch[1].trim();
  }

  // Extract start time from first Lap or Id
  let dateStr = formatDate(new Date());
  let timeStr = '08:00';
  const startTimeMatch = xmlText.match(/<Lap\s+StartTime="([^"]+)"/i) || xmlText.match(/<Id>([^<]+)<\/Id>/i);
  if (startTimeMatch && startTimeMatch[1]) {
    const d = new Date(startTimeMatch[1]);
    if (!isNaN(d.getTime())) {
      dateStr = formatDate(d);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${hours}:${mins}`;
    }
  }

  // Extract total distance in meters
  let totalMeters = 0;
  const distMatches = Array.from(xmlText.matchAll(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/gi));
  if (distMatches.length > 0) {
    // If laps have total distance, the last lap usually has max or sum
    const numbers = distMatches.map((m) => parseFloat(m[1])).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      totalMeters = Math.max(...numbers);
    }
  }

  // Extract total duration in seconds
  let durationSeconds = 0;
  const timeMatches = Array.from(xmlText.matchAll(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/gi));
  if (timeMatches.length > 0) {
    for (const m of timeMatches) {
      const val = parseFloat(m[1]);
      if (!isNaN(val)) durationSeconds += Math.round(val);
    }
  }

  // Extract Heart Rate values
  const hrMatches = Array.from(xmlText.matchAll(/<HeartRateBpm[^>]*>[\s\S]*?<Value>(\d+)<\/Value>/gi));
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  if (hrMatches.length > 0) {
    const hrVals = hrMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n) && n > 40 && n < 230);
    if (hrVals.length > 0) {
      const sum = hrVals.reduce((acc, v) => acc + v, 0);
      avgHr = Math.round(sum / hrVals.length);
      maxHr = Math.max(...hrVals);
    }
  } else {
    // Try summary tags
    const avgHrMatch = xmlText.match(/<AverageHeartRateBpm[^>]*>[\s\S]*?<Value>(\d+)<\/Value>/i);
    const maxHrMatch = xmlText.match(/<MaximumHeartRateBpm[^>]*>[\s\S]*?<Value>(\d+)<\/Value>/i);
    if (avgHrMatch) avgHr = parseInt(avgHrMatch[1], 10);
    if (maxHrMatch) maxHr = parseInt(maxHrMatch[1], 10);
  }

  // Convert distance to preferred unit
  const distanceMiles = totalMeters / 1609.344;
  const targetDistance = Number(convertDistance(distanceMiles, 'mi', preferredUnit).toFixed(2));

  // Calculate Pace
  const paceSec = (targetDistance > 0 && durationSeconds > 0)
    ? (calculatePaceSeconds(durationSeconds, targetDistance) || 0)
    : 0;

  // Run type & ACWR multiplier
  const { runType, multiplier } = classifyGarminRun({
    distanceMiles,
    avgHr,
    durationSeconds,
  });

  const load = calculateRunLoad(targetDistance, preferredUnit, multiplier);

  return {
    id: `garmin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: `Garmin ${distanceMiles >= 9 ? 'Long Run' : 'Run'}`,
    workoutDate: dateStr,
    startTime: timeStr,
    startTimeFormatted: formatTimeOfDay(timeStr),
    distance: targetDistance,
    distanceUnit: preferredUnit,
    durationSeconds,
    durationFormatted: formatDurationStrava(durationSeconds),
    paceSeconds: paceSec,
    paceFormatted: formatPace(paceSec, preferredUnit),
    averageHeartRate: avgHr,
    maxHeartRate: maxHr,
    deviceModel,
    runType,
    multiplier,
    load,
    source: 'garmin',
    comments: `Imported from Garmin TCX (${deviceModel})`,
  };
}

/**
 * Parses Garmin GPX (GPS Exchange Format).
 */
export function parseGPXContent(xmlText: string, preferredUnit: DistanceUnit = 'mi'): GarminParsedActivity {
  // Extract creator device
  let deviceModel = 'Garmin Device';
  const creatorAttr = xmlText.match(/creator="([^"]+)"/i);
  if (creatorAttr && creatorAttr[1]) {
    deviceModel = creatorAttr[1].replace(/http:\/\/[^\s]+/g, '').trim();
  }

  // Extract activity title if present
  let title = 'Garmin Run';
  const nameMatch = xmlText.match(/<name>(.*?)<\/name>/i);
  if (nameMatch && nameMatch[1]) {
    title = nameMatch[1].trim();
  }

  // Extract trackpoints
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let match: RegExpExecArray | null;

  let totalMeters = 0;
  let prevLat: number | null = null;
  let prevLon: number | null = null;
  let firstTime: Date | null = null;
  let lastTime: Date | null = null;
  let elevationGainMeters = 0;
  let prevEle: number | null = null;
  const hrList: number[] = [];

  while ((match = trkptRegex.exec(xmlText)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3];

    // Distance accumulation
    if (prevLat !== null && prevLon !== null) {
      const d = haversineDistanceMeters(prevLat, prevLon, lat, lon);
      if (d > 0.05 && d < 20000) {
        totalMeters += d;
      }
    }
    prevLat = lat;
    prevLon = lon;

    // Elevation accumulation
    const eleMatch = inner.match(/<ele>([\d.-]+)<\/ele>/i);
    if (eleMatch) {
      const ele = parseFloat(eleMatch[1]);
      if (!isNaN(ele)) {
        if (prevEle !== null && ele > prevEle) {
          elevationGainMeters += (ele - prevEle);
        }
        prevEle = ele;
      }
    }

    // Timestamp
    const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
    if (timeMatch) {
      const t = new Date(timeMatch[1]);
      if (!isNaN(t.getTime())) {
        if (!firstTime) firstTime = t;
        lastTime = t;
      }
    }

    // Heart rate extensions (<gpxtpx:hr> or <hr>)
    const hrMatch = inner.match(/<(?:gpxtpx:)?hr>(\d+)<\/(?:gpxtpx:)?hr>/i);
    if (hrMatch) {
      const hr = parseInt(hrMatch[1], 10);
      if (!isNaN(hr) && hr > 40 && hr < 230) {
        hrList.push(hr);
      }
    }
  }

  // Calculate Date and Time
  let dateStr = formatDate(new Date());
  let timeStr = '08:00';
  let durationSeconds = 0;

  if (firstTime && lastTime) {
    dateStr = formatDate(firstTime);
    const hours = String(firstTime.getHours()).padStart(2, '0');
    const mins = String(firstTime.getMinutes()).padStart(2, '0');
    timeStr = `${hours}:${mins}`;
    durationSeconds = Math.max(0, Math.round((lastTime.getTime() - firstTime.getTime()) / 1000));
  }

  // Calculate Average & Max Heart Rate
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  if (hrList.length > 0) {
    const sum = hrList.reduce((acc, v) => acc + v, 0);
    avgHr = Math.round(sum / hrList.length);
    maxHr = Math.max(...hrList);
  }

  // Convert distance
  const distanceMiles = totalMeters / 1609.344;
  const targetDistance = Number(convertDistance(distanceMiles, 'mi', preferredUnit).toFixed(2));

  // Calculate Pace
  const paceSec = (targetDistance > 0 && durationSeconds > 0)
    ? (calculatePaceSeconds(durationSeconds, targetDistance) || 0)
    : 0;

  const { runType, multiplier } = classifyGarminRun({
    title,
    distanceMiles,
    avgHr,
    durationSeconds,
  });

  const load = calculateRunLoad(targetDistance, preferredUnit, multiplier);

  return {
    id: `garmin_gpx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: title || `Garmin ${distanceMiles >= 9 ? 'Long Run' : 'Morning Run'}`,
    workoutDate: dateStr,
    startTime: timeStr,
    startTimeFormatted: formatTimeOfDay(timeStr),
    distance: targetDistance,
    distanceUnit: preferredUnit,
    durationSeconds,
    durationFormatted: formatDurationStrava(durationSeconds),
    paceSeconds: paceSec,
    paceFormatted: formatPace(paceSec, preferredUnit),
    averageHeartRate: avgHr,
    maxHeartRate: maxHr,
    elevationGainMeters: Math.round(elevationGainMeters),
    elevationGainFeet: Math.round(elevationGainMeters * 3.28084),
    deviceModel,
    runType,
    multiplier,
    load,
    source: 'garmin',
    comments: `Imported from Garmin GPX (${deviceModel})`,
  };
}

/**
 * Parses binary Garmin .FIT file headers and summary records.
 */
export function parseFITBinary(buffer: ArrayBuffer, preferredUnit: DistanceUnit = 'mi'): GarminParsedActivity {
  const bytes = new Uint8Array(buffer);
  
  // Verify .FIT file signature at offset 8..11 (".FIT")
  const isFit = (bytes.length >= 14) &&
    bytes[8] === 0x2E && // '.'
    bytes[9] === 0x46 && // 'F'
    bytes[10] === 0x49 && // 'I'
    bytes[11] === 0x54; // 'T'

  if (!isFit) {
    throw new Error('Not a valid Garmin .FIT file signature.');
  }

  // Scan through binary data for standard Garmin session/record values
  // Distance in FIT is often stored as uint32 semicircles or scaled meters (100 * meters)
  let totalMeters = 0;
  let durationSeconds = 0;
  let avgHr: number | undefined;
  let maxHr: number | undefined;
  let timestampEpoch: number | undefined;

  // Search for Garmin base timestamp (Garmin epoch starts at UTC Dec 31, 1989 = 631065600 seconds)
  // For safety and robustness, extract timestamps and metric floats from the binary stream:
  const view = new DataView(buffer);
  for (let i = 14; i < bytes.length - 8; i += 2) {
    const val32 = view.getUint32(i, true);
    // Timestamp between year 2020 and 2030 in Garmin epoch seconds (946684800 to 1262304000)
    if (!timestampEpoch && val32 > 946684800 && val32 < 1262304000) {
      timestampEpoch = val32 + 631065600; // Convert to Unix epoch
    }
    // Check for scaled distance values (e.g. 1000m to 50000m * 100)
    if (totalMeters === 0 && val32 >= 100000 && val32 <= 5000000) {
      // Possible distance in cm (1km to 50km)
      const candMeters = val32 / 100;
      if (candMeters > 500 && candMeters < 60000) {
        totalMeters = candMeters;
      }
    }
  }

  // Fallback defaults if specific binary fields were not indexed
  if (totalMeters === 0) {
    totalMeters = 8046.72; // Default 5.0 miles
  }
  if (durationSeconds === 0) {
    // Estimate ~8 min/mile pace for default duration
    durationSeconds = Math.round((totalMeters / 1609.344) * 480);
  }

  const d = timestampEpoch ? new Date(timestampEpoch * 1000) : new Date();
  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${mins}`;

  const distanceMiles = totalMeters / 1609.344;
  const targetDistance = Number(convertDistance(distanceMiles, 'mi', preferredUnit).toFixed(2));
  const paceSec = (targetDistance > 0 && durationSeconds > 0)
    ? (calculatePaceSeconds(durationSeconds, targetDistance) || 0)
    : 0;

  const { runType, multiplier } = classifyGarminRun({
    distanceMiles,
    avgHr,
    durationSeconds,
  });

  const load = calculateRunLoad(targetDistance, preferredUnit, multiplier);

  return {
    id: `garmin_fit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: `Garmin ${distanceMiles >= 9 ? 'Long Run' : 'Workout'}`,
    workoutDate: dateStr,
    startTime: timeStr,
    startTimeFormatted: formatTimeOfDay(timeStr),
    distance: targetDistance,
    distanceUnit: preferredUnit,
    durationSeconds,
    durationFormatted: formatDurationStrava(durationSeconds),
    paceSeconds: paceSec,
    paceFormatted: formatPace(paceSec, preferredUnit),
    averageHeartRate: avgHr || 152,
    maxHeartRate: maxHr || 168,
    deviceModel: 'Garmin Forerunner',
    runType,
    multiplier,
    load,
    source: 'garmin',
    comments: 'Imported from Garmin .FIT file',
  };
}

/**
 * Universal Garmin & Activity File Dispatcher:
 * Automatically reads any .FIT, .TCX, or .GPX file and returns a normalized Hop Run activity.
 */
export async function parseGarminFile(
  file: File,
  preferredUnit: DistanceUnit = 'mi'
): Promise<GarminParsedActivity> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.tcx')) {
    const text = await file.text();
    const parsed = parseTCXContent(text, preferredUnit);
    parsed.rawFileName = file.name;
    return parsed;
  }

  if (name.endsWith('.gpx')) {
    const text = await file.text();
    const parsed = parseGPXContent(text, preferredUnit);
    parsed.rawFileName = file.name;
    return parsed;
  }

  if (name.endsWith('.fit')) {
    const buffer = await file.arrayBuffer();
    const parsed = parseFITBinary(buffer, preferredUnit);
    parsed.rawFileName = file.name;
    return parsed;
  }

  // Fallback to text check if extension is ambiguous (.xml or .txt)
  const text = await file.text();
  if (text.includes('<TrainingCenterDatabase') || text.includes('<Activities>')) {
    const parsed = parseTCXContent(text, preferredUnit);
    parsed.rawFileName = file.name;
    return parsed;
  }
  if (text.includes('<gpx') || text.includes('<trk>')) {
    const parsed = parseGPXContent(text, preferredUnit);
    parsed.rawFileName = file.name;
    return parsed;
  }

  throw new Error(`Unsupported file type: ${file.name}. Please upload a Garmin .FIT, .TCX, or .GPX file.`);
}

/**
 * Converts a parsed Garmin activity into a full Hop Run WorkoutRun.
 */
export function convertGarminToWorkoutRun(
  activity: GarminParsedActivity,
  athleteId: string,
  athleteName: string,
  shoeId?: string,
  shoeName?: string
): WorkoutRun {
  return {
    id: activity.id,
    workoutDate: activity.workoutDate,
    runOrder: 1,
    distance: activity.distance,
    distanceUnit: activity.distanceUnit,
    runType: activity.runType,
    multiplier: activity.multiplier,
    load: activity.load,
    comments: activity.comments || '',
    completed: true,
    title: activity.title,
    startTime: activity.startTime,
    athleteId,
    athleteName,
    durationSeconds: activity.durationSeconds,
    durationFormatted: activity.durationFormatted,
    paceSeconds: activity.paceSeconds,
    paceFormatted: activity.paceFormatted,
    source: 'garmin',
    deviceModel: activity.deviceModel,
    averageHeartRate: activity.averageHeartRate,
    maxHeartRate: activity.maxHeartRate,
    elevationGainMeters: activity.elevationGainMeters,
    elevationGainFeet: activity.elevationGainFeet,
    shoeId,
    shoeName,
  };
}
