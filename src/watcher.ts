/**
 * Locate the canonical (non-autosave) save file and watch the saves directory
 * for changes to it, invoking a debounced callback when it is updated.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { AppConfig } from './config.js';

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

  let newest: { path: string; mtimeMs: number } | undefined;
  for (const name of candidates) {
    const path = join(config.savesDir, name);
    const info = await stat(path).catch(() => undefined);
    if (info && (!newest || info.mtimeMs > newest.mtimeMs)) {
      newest = { path, mtimeMs: info.mtimeMs };
    }
  }
  return newest?.path;
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
    timer = setTimeout(() => onCanonicalSave(path), config.watchDebounceMs);
  };

  watcher.on('add', trigger).on('change', trigger);

  return {
    async close() {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
