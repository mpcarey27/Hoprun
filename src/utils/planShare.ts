import type { TrainingPlan, PlanDayItem } from '../types/acr';

interface CompactPlan {
  i: string; // id
  t: string; // title
  c: string; // coachName
  s: string; // startDate
  w: number; // weeksCount
  k: string; // code
  // days: [dayIndex, runType, targetDistance, unit (0=mi, 1=km), instructions]
  d: [number, string, number, number, string][];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compresses a training plan into an ultra-compact Base64URL string for fast,
 * high-contrast QR code scanning on mobile devices.
 */
export async function compressPlan(plan: TrainingPlan): Promise<string> {
  const compact: CompactPlan = {
    i: plan.id,
    t: plan.title,
    c: plan.coachName,
    s: plan.startDate,
    w: plan.weeksCount || Math.ceil(plan.days.length / 7),
    k: plan.code,
    d: plan.days.map((day) => [
      day.dayIndex,
      day.runType,
      day.targetDistance,
      day.distanceUnit === 'km' ? 1 : 0,
      day.instructions || '',
    ]),
  };

  const jsonStr = JSON.stringify(compact);

  // Modern browser compression via CompressionStream (Gzip)
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(new TextEncoder().encode(jsonStr));
      writer.close();
      const buffer = await new Response(cs.readable).arrayBuffer();
      return bytesToBase64Url(new Uint8Array(buffer));
    } catch (err) {
      console.warn('CompressionStream failed, falling back to base64url:', err);
    }
  }

  // Fallback: direct base64url of JSON
  return bytesToBase64Url(new TextEncoder().encode(jsonStr));
}

/**
 * Decompresses and restores a full TrainingPlan from a compressed Base64URL payload.
 */
export async function decompressPlan(payload: string): Promise<TrainingPlan | null> {
  if (!payload) return null;

  try {
    let jsonStr = '';

    // Attempt Gzip decompression
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const rawBytes = base64UrlToBytes(payload);
        const ds = new DecompressionStream('gzip');
        const dWriter = ds.writable.getWriter();
        dWriter.write(rawBytes as unknown as BufferSource);
        dWriter.close();
        jsonStr = await new Response(ds.readable).text();
      } catch {
        // Fallback: try plain base64 decode if not gzipped
        const rawBytes = base64UrlToBytes(payload);
        jsonStr = new TextDecoder().decode(rawBytes);
      }
    } else {
      const rawBytes = base64UrlToBytes(payload);
      jsonStr = new TextDecoder().decode(rawBytes);
    }

    const compact: CompactPlan = JSON.parse(jsonStr);

    const days: PlanDayItem[] = compact.d.map((item) => ({
      dayIndex: item[0],
      runType: item[1],
      targetDistance: item[2],
      distanceUnit: item[3] === 1 ? 'km' : 'mi',
      instructions: item[4] || '',
    }));

    return {
      id: compact.i,
      title: compact.t,
      coachId: 'coach_shared',
      coachName: compact.c,
      startDate: compact.s,
      weeksCount: compact.w,
      days,
      createdAt: new Date().toISOString(),
      code: compact.k,
    };
  } catch (err) {
    console.error('Failed to decompress plan payload:', err);
    return null;
  }
}

/**
 * Returns total weeks represented in a plan's days list.
 */
export function getPlanWeeksCount(days: PlanDayItem[]): number {
  return Math.max(1, Math.ceil(days.length / 7));
}

/**
 * Extracts a 7-day chunk of PlanDayItems for a specified zero-indexed week tab.
 */
export function getPlanWeekChunk(days: PlanDayItem[], weekIndex: number): PlanDayItem[] {
  return days.slice(weekIndex * 7, (weekIndex + 1) * 7);
}
