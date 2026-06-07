/**
 * Locate the canonical (non-autosave) save file and watch the saves directory
 * for changes to it, invoking a debounced callback when it is updated.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { AppConfig } from './config.js';

interface SaveCandidate {
  name: string;
  path: string;
  mtimeMs: number;
}

/**
 * Find the newest file in the saves dir whose name ends with the canonical
 * suffix (default `_continue.sav`). Returns undefined if none exist.
 */
export async function findCanonicalSave(config: AppConfig): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await readdir(config.savesDir);
  } catch {
    return undefined;
  }

  const suffix = config.canonicalSaveSuffix.toLowerCase();
  const candidates = entries.filter((name) => name.toLowerCase().endsWith(suffix));
  if (candidates.length === 0) return undefined;

  const detailed: SaveCandidate[] = [];
  for (const name of candidates) {
    const path = join(config.savesDir, name);
    const info = await stat(path).catch(() => undefined);
    if (!info) continue;
    detailed.push({ name, path, mtimeMs: info.mtimeMs });
  }
  return pickTrackedSaveCandidate(detailed, config)?.path;
}

/**
 * Pick the save to track from a candidate list.
 *
 * Default behavior: newest file by suffix.
 * Dedicated-server behavior (AUTOSAVE_INTERVAL_MINUTES > 0): infer the
 * autosave cadence phase from autosave files and prefer the newest off-cadence
 * save, which usually corresponds to a player/disconnect-triggered save.
 */
export function pickTrackedSaveCandidate(
  candidates: SaveCandidate[],
  config: Pick<AppConfig, 'autosaveIntervalMinutes' | 'autosaveTimeToleranceSeconds'>,
): SaveCandidate | undefined {
  if (candidates.length === 0) return undefined;
  const newest = [...candidates].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

  const intervalSec = Math.floor(config.autosaveIntervalMinutes * 60);
  if (intervalSec <= 0) return newest;

  const toleranceSec = Math.max(0, Math.floor(config.autosaveTimeToleranceSeconds));
  const autosaves = candidates.filter((c) => /_autosave_\d+\.sav$/i.test(c.name));
  if (autosaves.length < 3) return newest;

  const residues = autosaves.map((c) => modSeconds(c.mtimeMs, intervalSec));
  const dominant = dominantResidue(residues, intervalSec, toleranceSec);

  const unscheduled = candidates
    .filter((c) => circularDistance(modSeconds(c.mtimeMs, intervalSec), dominant, intervalSec) > toleranceSec)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return unscheduled[0] ?? newest;
}

/** True if a file name matches the canonical suffix. */
export function isCanonicalSave(fileName: string, config: AppConfig): boolean {
  return fileName.toLowerCase().endsWith(config.canonicalSaveSuffix.toLowerCase());
}

export interface SaveWatcher {
  close(): Promise<void>;
}

/**
 * Watch the saves directory and call `onCanonicalSave` (debounced) whenever the
 * canonical save is added or changed.
 */
export function watchSaves(
  config: AppConfig,
  onCanonicalSave: (savePath: string) => void,
): SaveWatcher {
  const watcher: FSWatcher = chokidar.watch(config.savesDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: config.watchDebounceMs,
      pollInterval: Math.min(1000, config.watchDebounceMs),
    },
    usePolling: config.watchUsePolling,
    interval: config.watchUsePolling ? Math.min(2000, Math.max(500, config.watchDebounceMs)) : undefined,
    depth: 0,
  });

  let timer: NodeJS.Timeout | undefined;
  const trigger = (path: string) => {
    const name = path.split(/[\\/]/).pop() ?? '';
    if (!isCanonicalSave(name, config)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void findCanonicalSave(config)
        .then((selected) => {
          if (selected) onCanonicalSave(selected);
        })
        .catch((err) => {
          console.error('[watch] failed to resolve tracked save:', err);
        });
    }, config.watchDebounceMs);
  };

  watcher.on('add', trigger).on('change', trigger);

  return {
    async close() {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}

function modSeconds(mtimeMs: number, intervalSec: number): number {
  const sec = Math.round(mtimeMs / 1000);
  const mod = sec % intervalSec;
  return mod >= 0 ? mod : mod + intervalSec;
}

function circularDistance(a: number, b: number, modulus: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, modulus - direct);
}

function dominantResidue(residues: number[], intervalSec: number, toleranceSec: number): number {
  let best = residues[0] ?? 0;
  let bestCount = -1;
  for (const center of residues) {
    const count = residues.filter((r) => circularDistance(r, center, intervalSec) <= toleranceSec).length;
    if (count > bestCount) {
      best = center;
      bestCount = count;
    }
  }
  return best;
}
