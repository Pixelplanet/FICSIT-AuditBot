/**
 * Persistent state store backed by a JSON file (`db.json`) in the state dir.
 * Tracks the last processed save (by content hash) and the last extracted
 * {@link WorldState} so we can diff the next save against it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorldState } from '../model.js';

export interface StoreData {
  /** Content hash of the last save we processed (to avoid reprocessing). */
  lastSaveHash?: string;
  /** File name of the last processed save. */
  lastSaveName?: string;
  /** ISO timestamp when we last processed a save. */
  lastProcessedAt?: string;
  /** The last extracted world state, used as the diff baseline. */
  lastWorldState?: WorldState;
}

export class StateStore {
  private readonly filePath: string;
  private data: StoreData = {};

  constructor(stateDir: string) {
    this.filePath = join(stateDir, 'db.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.data = JSON.parse(raw) as StoreData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.data = {};
        return;
      }
      throw err;
    }
  }

  get(): Readonly<StoreData> {
    return this.data;
  }

  async update(patch: Partial<StoreData>): Promise<void> {
    this.data = { ...this.data, ...patch };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}
