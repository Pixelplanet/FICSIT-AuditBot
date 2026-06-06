/**
 * Extract header-level facts (playtime, timestamps, identity) from a save.
 */
import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';

export interface HeaderInfo {
  saveName: string;
  sessionName: string;
  buildVersion: number;
  playDurationSeconds: number;
  saveTimestampMs: number;
}

export function extractHeader(save: SatisfactorySave): HeaderInfo {
  const h = save.header;
  return {
    saveName: save.name,
    sessionName: h.sessionName ?? '',
    buildVersion: h.buildVersion ?? 0,
    playDurationSeconds: Math.round(h.playDurationSeconds ?? 0),
    saveTimestampMs: parseSaveTimestamp(h.saveDateTime),
  };
}

/**
 * The header `saveDateTime` is a string. In the saves we tested it is epoch
 * milliseconds; older formats used .NET tick counts. Detect and normalize to
 * epoch milliseconds, returning 0 if it cannot be parsed.
 */
export function parseSaveTimestamp(saveDateTime: string | undefined): number {
  if (!saveDateTime) return 0;
  const raw = Number(saveDateTime);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  // .NET ticks are 100ns intervals since year 1 (~6.2e17 for modern dates).
  // Epoch millis for modern dates are ~1.7e12. Use magnitude to disambiguate.
  if (raw > 1e16) {
    const TICKS_PER_MS = 10_000n;
    const EPOCH_OFFSET_TICKS = 621_355_968_000_000_000n; // ticks from year 1 to 1970
    const ms = (BigInt(Math.trunc(raw)) - EPOCH_OFFSET_TICKS) / TICKS_PER_MS;
    return Number(ms);
  }
  return raw;
}
