import { analyseReadings } from '../analysis';
import { config } from '../config';
import { getAsOf, listFridges, readingsByFridge } from '../repository';
import type { ExcursionReport, ExcursionReportRow } from '../types';

/**
 * The inspector answer: when each fridge went above its limit, and for how
 * long. Fridges with zero excursions stay in the result — "never above the
 * limit" is the sentence they most often want.
 */
export async function buildExcursionReport(
  from: Date,
  to: Date,
  fridgeId: number | null,
): Promise<ExcursionReport | null> {
  const asOf = (await getAsOf()) ?? new Date();
  const [allFridges, readings] = await Promise.all([
    listFridges(),
    readingsByFridge(from, to),
  ]);

  const fridges =
    fridgeId === null ? allFridges : allFridges.filter((fridge) => fridge.id === fridgeId);

  if (fridgeId !== null && fridges.length === 0) return null;

  const rows: ExcursionReportRow[] = fridges.map((fridge) => {
    const analysis = analyseReadings({
      readings: readings.get(fridge.id) ?? [],
      thresholdC: fridge.thresholdC,
      asOfMs: Math.min(asOf.getTime(), to.getTime()),
      timeZone: config.timezone,
    });

    return {
      fridgeId: fridge.id,
      fridgeName: fridge.name,
      branchName: fridge.branchName,
      thresholdC: fridge.thresholdC,
      excursions: analysis.excursions,
    };
  });

  // Worst first within the report too, so the page does not open on a wall of
  // fridges that were fine.
  rows.sort((a, b) => {
    const byCount = b.excursions.length - a.excursions.length;
    if (byCount !== 0) return byCount;
    return `${a.branchName} ${a.fridgeName}`.localeCompare(`${b.branchName} ${b.fridgeName}`);
  });

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    rows,
    totalExcursions: rows.reduce((total, row) => total + row.excursions.length, 0),
  };
}
