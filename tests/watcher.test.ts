import { describe, expect, it } from 'vitest';
import { pickTrackedSaveCandidate } from '../src/watcher.js';

function c(name: string, sec: number) {
  return {
    name,
    path: `/saves/${name}`,
    mtimeMs: sec * 1000,
  };
}

describe('pickTrackedSaveCandidate', () => {
  it('falls back to newest when autosave interval mode is disabled', () => {
    const picked = pickTrackedSaveCandidate(
      [
        c('World_autosave_3.sav', 1000),
        c('World_autosave_4.sav', 1300),
        c('World_continue.sav', 900),
      ],
      { autosaveIntervalMinutes: 0, autosaveTimeToleranceSeconds: 2 },
    );
    expect(picked?.name).toBe('World_autosave_4.sav');
  });

  it('prefers newest off-cadence save when autosave interval mode is enabled', () => {
    const picked = pickTrackedSaveCandidate(
      [
        // Scheduled cadence residue: 298 in a 300s interval.
        c('World_autosave_1.sav', 298),
        c('World_autosave_2.sav', 598),
        c('World_autosave_3.sav', 898),
        c('World_autosave_4.sav', 1198),
        // Unscheduled/disconnect save.
        c('World_autosave_0.sav', 1267),
      ],
      { autosaveIntervalMinutes: 5, autosaveTimeToleranceSeconds: 2 },
    );
    expect(picked?.name).toBe('World_autosave_0.sav');
  });

  it('falls back to newest when every candidate is on-cadence', () => {
    const picked = pickTrackedSaveCandidate(
      [
        c('World_autosave_0.sav', 298),
        c('World_autosave_1.sav', 598),
        c('World_autosave_2.sav', 898),
        c('World_autosave_3.sav', 1198),
      ],
      { autosaveIntervalMinutes: 5, autosaveTimeToleranceSeconds: 2 },
    );
    expect(picked?.name).toBe('World_autosave_3.sav');
  });
});
