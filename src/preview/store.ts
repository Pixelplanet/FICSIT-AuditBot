/**
 * In-memory store of the most recent generated summaries, so the web UI can
 * show what was (or would be) posted without re-running the pipeline.
 */
import type { SummaryResult } from '../summary/format.js';

export interface PreviewEntry {
  /** ISO timestamp when this preview was generated. */
  generatedAt: string;
  /** Human-readable origin, e.g. "baseline → current" or "fileA → fileB". */
  source: string;
  /** Whether this came from a live processing run (vs. a manual preview). */
  live: boolean;
  /** Disposition of the change. */
  kind: 'summary' | 'empty' | 'first-run' | 'unchanged';
  /** Status from a live run, if applicable (posted / console-only / …). */
  status?: string;
  summary?: SummaryResult;
}

export class PreviewStore {
  private latest?: PreviewEntry;
  private readonly history: PreviewEntry[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 20) {
    this.maxHistory = maxHistory;
  }

  set(entry: PreviewEntry): void {
    this.latest = entry;
    this.history.unshift(entry);
    if (this.history.length > this.maxHistory) {
      this.history.length = this.maxHistory;
    }
  }

  getLatest(): PreviewEntry | undefined {
    return this.latest;
  }

  getHistory(): PreviewEntry[] {
    return this.history;
  }
}
