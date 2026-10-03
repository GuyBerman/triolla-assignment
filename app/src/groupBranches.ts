import type { FridgeStatus, FridgeSummary } from './api/types';
import { statusOrder, statusesWorstFirst } from './theme';

export interface BranchGroup {
  name: string;
  fridges: FridgeSummary[];
  status: FridgeStatus;
}

/** Only the states worth calling out on their own; "ok" is the absence of news. */
const SUMMARY_STATUSES: FridgeStatus[] = ['alarm', 'no_data', 'warning'];

export function countStatuses(
  fridges: Pick<FridgeSummary, 'status'>[],
): { status: FridgeStatus; count: number }[] {
  return statusesWorstFirst.map((status) => ({
    status,
    count: fridges.filter((fridge) => fridge.status === status).length,
  }));
}

export function countProblemStatuses(
  fridges: Pick<FridgeSummary, 'status'>[],
): { status: FridgeStatus; count: number }[] {
  return SUMMARY_STATUSES.map((status) => ({
    status,
    count: fridges.filter((fridge) => fridge.status === status).length,
  })).filter((entry) => entry.count > 0);
}

/**
 * One card per branch, in the same worst-first order the API already sorted
 * the fridges. Insertion order of a Map is enough: the first time a branch
 * appears is the appearance of its worst fridge.
 */
export function groupByBranch(fridges: FridgeSummary[]): BranchGroup[] {
  const groups = new Map<string, FridgeSummary[]>();

  for (const fridge of fridges) {
    const list = groups.get(fridge.branchName);
    if (list) list.push(fridge);
    else groups.set(fridge.branchName, [fridge]);
  }

  return [...groups.entries()].map(([name, branchFridges]) => ({
    name,
    fridges: branchFridges,
    status: worstStatus(branchFridges),
  }));
}

function worstStatus(fridges: FridgeSummary[]): FridgeStatus {
  return fridges.reduce<FridgeStatus>(
    (worst, fridge) => (statusOrder[fridge.status] < statusOrder[worst] ? fridge.status : worst),
    fridges[0]?.status ?? 'ok',
  );
}
