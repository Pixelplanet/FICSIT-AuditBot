/**
 * Snapshot management: keep a copy of the last processed canonical save so we
 * always have a stable baseline to diff against, and compute content hashes to
 * detect whether a save actually changed.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SnapshotPaths {
  /** Directory where snapshots live. */
  dir: string;
  /** Path to the retained copy of the previous canonical save. */
  previousSave: string;
}

export function snapshotPaths(stateDir: string): SnapshotPaths {
  const dir = join(stateDir, 'snapshots');
  return { dir, previousSave: join(dir, 'previous.sav') };
}

/** Compute a stable SHA-256 hash of a file's contents. */
export async function hashFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/** Copy the current save into the snapshot directory as the new baseline. */
export async function storeSnapshot(stateDir: string, sourceSave: string): Promise<string> {
  const { dir, previousSave } = snapshotPaths(stateDir);
  await mkdir(dir, { recursive: true });
  await copyFile(sourceSave, previousSave);
  return previousSave;
}
