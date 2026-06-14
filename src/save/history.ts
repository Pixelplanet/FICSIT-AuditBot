/**
 * Save-file history: automatically keeps timestamped copies of canonical saves
 * whenever the playtime changes vs. the last stored entry.  Serves as both a
 * comparison archive (users can diff any two points in time) and a lightweight
 * backup (they can restore from any captured copy).
 */
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface HistoryEntry {
  /** File name inside the history directory (timestamp + original name). */
  name: string;
  /** Absolute path on disk. */
  path: string;
  /** Original save file name when it was captured. */
  originalName: string;
  /** File modification time (ms since epoch). */
  mtimeMs: number;
  /** File size in bytes. */
  sizeBytes: number;
  /** In-game play duration in seconds at the time of capture. */
  playDurationSeconds: number;
  /** ISO timestamp when this copy was created. */
  capturedAt: string;
}

interface HistoryIndex {
  /** Play duration of the last stored entry (used to skip duplicates). */
  lastPlayDurationSeconds: number;
  entries: {
    name: string;
    originalName: string;
    capturedAt: string;
    playDurationSeconds: number;
  }[];
}

const MAX_HISTORY = 100;

function historyDir(stateDir: string): string {
  return join(stateDir, 'history');
}

function indexPath(stateDir: string): string {
  return join(historyDir(stateDir), 'index.json');
}

async function loadIndex(stateDir: string): Promise<HistoryIndex> {
  try {
    const raw = await readFile(indexPath(stateDir), 'utf8');
    return JSON.parse(raw) as HistoryIndex;
  } catch {
    return { lastPlayDurationSeconds: -1, entries: [] };
  }
}

async function saveIndex(stateDir: string, index: HistoryIndex): Promise<void> {
  await mkdir(historyDir(stateDir), { recursive: true });
  await writeFile(indexPath(stateDir), JSON.stringify(index, null, 2), 'utf8');
}

/**
 * Store a timestamped copy of `sourcePath` in the history directory – but only
 * when the playtime differs from the last stored entry.  Returns the new entry
 * or `null` when the save was skipped (duplicate playtime).
 */
export async function storeHistoryEntry(
  stateDir: string,
  sourcePath: string,
  playDurationSeconds: number,
): Promise<HistoryEntry | null> {
  const index = await loadIndex(stateDir);

  // Skip when playtime hasn't advanced (server paused / duplicate save).
  if (playDurationSeconds === index.lastPlayDurationSeconds) return null;

  const dir = historyDir(stateDir);
  await mkdir(dir, { recursive: true });

  const originalName = basename(sourcePath);
  // Sanitise timestamp for use in a filename (colons → dashes).
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${ts}_${originalName}`;
  const destPath = join(dir, name);

  await copyFile(sourcePath, destPath);
  const info = await stat(destPath);

  const entry: HistoryEntry = {
    name,
    path: destPath,
    originalName,
    mtimeMs: info.mtimeMs,
    sizeBytes: info.size,
    playDurationSeconds,
    capturedAt: new Date().toISOString(),
  };

  index.lastPlayDurationSeconds = playDurationSeconds;
  index.entries.push({
    name,
    originalName,
    capturedAt: entry.capturedAt,
    playDurationSeconds,
  });

  // Prune oldest entries when the history grows too large.
  while (index.entries.length > MAX_HISTORY) {
    index.entries.shift();
  }

  await saveIndex(stateDir, index);
  console.log(`[history] Stored ${name} (playtime ${playDurationSeconds}s)`);
  return entry;
}

/**
 * List all history entries, newest first.
 */
export async function listHistory(stateDir: string): Promise<HistoryEntry[]> {
  const index = await loadIndex(stateDir);
  const dir = historyDir(stateDir);
  const result: HistoryEntry[] = [];

  for (const entry of [...index.entries].reverse()) {
    const path = join(dir, entry.name);
    try {
      const info = await stat(path);
      result.push({
        name: entry.name,
        path,
        originalName: entry.originalName,
        mtimeMs: info.mtimeMs,
        sizeBytes: info.size,
        playDurationSeconds: entry.playDurationSeconds,
        capturedAt: entry.capturedAt,
      });
    } catch {
      // File was deleted externally – skip.
    }
  }

  return result;
}
