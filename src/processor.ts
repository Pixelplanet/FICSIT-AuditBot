/**
 * Core processing pipeline: given a canonical save file, decide whether it is
 * new, parse + extract its world state, diff against the stored baseline,
 * format a summary, deliver it, and persist the new baseline.
 *
 * Computation ({@link computeSummary}) is separated from delivery + persistence
 * ({@link processSave}) so the web UI can preview the summary without posting.
 */
import type { AppConfig } from './config.js';
import type { DiscordDispatcher } from './discord/index.js';
import type { StateStore } from './state/store.js';
import type { WorldState } from './model.js';
import { parseSaveFile } from './save/parser.js';
import { hashFile, storeSnapshot } from './save/snapshot.js';
import { extractWorldState } from './extract/index.js';
import { diffWorldStates, type WorldDelta } from './diff/compare.js';
import { formatSummary, type SummaryResult } from './summary/format.js';

export interface ProcessResult {
  status: 'skipped-unchanged' | 'baseline-set' | 'posted' | 'skipped-empty' | 'console-only';
  message: string;
  /** Present when a comparison was made. */
  summary?: SummaryResult;
}

/**
 * Parse a save and compute (but do not deliver or persist) the summary versus
 * the current baseline. Used by both the live processor and the web preview.
 */
export interface ComputeResult {
  hash: string;
  worldState: WorldState;
  /** Undefined on the very first run (no baseline to diff against). */
  delta?: WorldDelta;
  summary?: SummaryResult;
  isFirstRun: boolean;
  unchanged: boolean;
}

export async function computeSummary(
  savePath: string,
  store: StateStore,
  options: { phaseCostMultiplierOverride?: number } = {},
): Promise<ComputeResult> {
  const hash = await hashFile(savePath);
  const previous = store.get();
  const unchanged = previous.lastSaveHash === hash;

  const save = await parseSaveFile(savePath);
  const worldState = extractWorldState(save);

  if (!previous.lastWorldState) {
    return { hash, worldState, isFirstRun: true, unchanged };
  }

  const delta = diffWorldStates(previous.lastWorldState, worldState, {
    phaseCostMultiplierOverride: options.phaseCostMultiplierOverride,
  });
  const summary = formatSummary(delta);
  return { hash, worldState, delta, summary, isFirstRun: false, unchanged };
}

/** Compute a summary between two arbitrary save files (no baseline involved). */
export async function computeSummaryBetween(
  beforePath: string,
  afterPath: string,
  options: { phaseCostMultiplierOverride?: number } = {},
): Promise<{ before: WorldState; after: WorldState; delta: WorldDelta; summary: SummaryResult }> {
  const [beforeSave, afterSave] = await Promise.all([
    parseSaveFile(beforePath),
    parseSaveFile(afterPath),
  ]);
  const before = extractWorldState(beforeSave);
  const after = extractWorldState(afterSave);
  const delta = diffWorldStates(before, after, {
    phaseCostMultiplierOverride: options.phaseCostMultiplierOverride,
  });
  const summary = formatSummary(delta);
  return { before, after, delta, summary };
}

export async function processSave(
  savePath: string,
  config: AppConfig,
  store: StateStore,
  dispatcher: DiscordDispatcher | undefined,
): Promise<ProcessResult> {
  const computed = await computeSummary(savePath, store, {
    phaseCostMultiplierOverride: config.phaseCostMultiplier,
  });

  if (computed.unchanged) {
    return { status: 'skipped-unchanged', message: 'Save unchanged since last run.' };
  }

  // First run: just establish the baseline, nothing to diff against.
  if (computed.isFirstRun) {
    await persistBaseline(config, store, savePath, computed.hash, computed.worldState);
    return {
      status: 'baseline-set',
      message: 'Baseline established from first save (no previous state to compare).',
    };
  }

  const { delta, summary } = computed;
  // delta/summary are always defined when not first run.
  const safeSummary = summary!;
  const isEmpty = delta?.isEmpty ?? true;

  // Always log to console so the operator can see what happened.
  console.log('\n' + safeSummary.text + '\n');

  let status: ProcessResult['status'] = 'console-only';

  const shouldPost = config.postToDiscord && (!config.skipEmptySummaries || !isEmpty);
  if (config.postToDiscord && config.skipEmptySummaries && isEmpty) {
    status = 'skipped-empty';
  } else if (shouldPost && dispatcher) {
    const delivered = await dispatcher.dispatch(safeSummary);
    status = delivered ? 'posted' : 'console-only';
  }

  // Persist the new baseline regardless of delivery outcome.
  await persistBaseline(config, store, savePath, computed.hash, computed.worldState);

  return { status, message: statusMessage(status, isEmpty), summary: safeSummary };
}

async function persistBaseline(
  config: AppConfig,
  store: StateStore,
  savePath: string,
  hash: string,
  worldState: WorldState,
): Promise<void> {
  await storeSnapshot(config.stateDir, savePath);
  await store.update({
    lastSaveHash: hash,
    lastSaveName: worldState.saveName,
    lastProcessedAt: new Date().toISOString(),
    lastWorldState: worldState,
  });
}

function statusMessage(status: ProcessResult['status'], isEmpty: boolean): string {
  switch (status) {
    case 'posted':
      return 'Summary posted to Discord.';
    case 'skipped-empty':
      return 'No meaningful changes; skipped posting (SKIP_EMPTY_SUMMARIES).';
    case 'console-only':
      return isEmpty
        ? 'No meaningful changes; printed to console.'
        : 'Summary printed to console (Discord not configured/enabled).';
    default:
      return status;
  }
}
