import type { WeekWorkload, DistanceUnit } from '../types/acr';
import { MILES_TO_KM, KM_TO_MILES } from './calculations';

export function exportWorkloadToCsv(
  weeks: WeekWorkload[],
  preferredUnit: DistanceUnit = 'mi'
): void {
  const headers = [
    'Week #',
    'Date',
    'Day',
    'Run Order',
    'Run Type',
    `Distance (${preferredUnit.toUpperCase()})`,
    'Distance (MI)',
    'Distance (KM)',
    'Multiplier',
    'Calculated Load',
    'Completed',
    'Runner Comments / Notes',
    'Week Total Miles',
    'Week Total KM',
    'Week Acute Workload',
    '4-Week Chronic Workload',
    'ACR Ratio',
    'ACR Status',
  ];

  const rows: string[][] = [];

  for (const w of weeks) {
    for (const d of w.days) {
      if (d.runs.length === 0) {
        // Output rest/empty day line
        rows.push([
          String(w.weekNumber),
          d.date,
          d.dayName,
          '-',
          'Rest / No Run',
          '0.00',
          '0.00',
          '0.00',
          '0.0',
          '0.0',
          'Yes',
          '""',
          String(w.totalMiles.toFixed(2)),
          String(w.totalKm.toFixed(2)),
          String(w.acuteWorkload.toFixed(1)),
          w.chronicWorkload !== null ? String(w.chronicWorkload.toFixed(2)) : 'N/A',
          w.acr !== null ? String(w.acr.toFixed(4)) : 'N/A',
          w.status.toUpperCase(),
        ]);
      } else {
        for (const run of d.runs) {
          const mi = run.distanceUnit === 'mi' ? run.distance : run.distance * KM_TO_MILES;
          const km = run.distanceUnit === 'km' ? run.distance : run.distance * MILES_TO_KM;
          const prefDist = preferredUnit === 'mi' ? mi : km;

          // Escape quotes in comments
          const escapedComment = `"${(run.comments || '').replace(/"/g, '""')}"`;

          rows.push([
            String(w.weekNumber),
            d.date,
            d.dayName,
            String(run.runOrder),
            run.runType,
            prefDist.toFixed(2),
            mi.toFixed(2),
            km.toFixed(2),
            String(run.multiplier),
            run.load.toFixed(1),
            run.completed ? 'Yes' : 'Planned',
            escapedComment,
            String(w.totalMiles.toFixed(2)),
            String(w.totalKm.toFixed(2)),
            String(w.acuteWorkload.toFixed(1)),
            w.chronicWorkload !== null ? String(w.chronicWorkload.toFixed(2)) : 'N/A',
            w.acr !== null ? String(w.acr.toFixed(4)) : 'N/A',
            w.status.toUpperCase(),
          ]);
        }
      }
    }
  }

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ACR_Running_Workload_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
