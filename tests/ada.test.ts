import { describe, expect, it } from 'vitest';
import type { SchematicCategory, SchematicEntry } from '../src/model.js';
import type { BuildingDelta, ItemAmountDelta, WorldDelta } from '../src/diff/compare.js';
import { ADA_LINES, categorizeActivity, pickAdaLine } from '../src/summary/ada.js';

function emptySchematicGroups(): Record<SchematicCategory, SchematicEntry[]> {
  return {
    milestone: [],
    research: [],
    alternateRecipe: [],
    tutorial: [],
    customization: [],
    other: [],
  };
}

function schematic(category: SchematicCategory, id: string): SchematicEntry {
  return { id, path: id, category, name: id };
}

function building(delta: number): BuildingDelta {
  return { id: 'Build_X', name: 'X', category: 'production', before: 0, after: delta, delta };
}

function delivery(delta: number): ItemAmountDelta {
  return { itemId: 'Desc_Part', name: 'Part', before: 0, after: delta, delta };
}

function delta(overrides: Partial<WorldDelta> = {}): WorldDelta {
  return {
    sessionName: 'Test World',
    playtimeDeltaSeconds: 0,
    realTimeDeltaMs: 0,
    playtimeBeforeSeconds: 0,
    playtimeAfterSeconds: 0,
    newSchematics: emptySchematicGroups(),
    phaseDeliveryDeltas: [],
    buildingDeltas: [],
    isEmpty: false,
    ...overrides,
  };
}

describe('categorizeActivity', () => {
  it('returns "idle" when nothing meaningful changed', () => {
    expect(categorizeActivity(delta({ isEmpty: true, playtimeDeltaSeconds: 7200 }))).toBe('idle');
  });

  it('mocks long sessions that produced almost nothing', () => {
    // 2 hours played, only a single building placed.
    const d = delta({ playtimeDeltaSeconds: 7200, buildingDeltas: [building(1)] });
    expect(categorizeActivity(d)).toBe('idle');
  });

  it('returns "modest" for a small amount of progress', () => {
    const groups = emptySchematicGroups();
    groups.research.push(schematic('research', 'R1'));
    const d = delta({ playtimeDeltaSeconds: 600, newSchematics: groups });
    expect(categorizeActivity(d)).toBe('modest');
  });

  it('returns "productive" for a solid, steady session', () => {
    const groups = emptySchematicGroups();
    groups.milestone.push(schematic('milestone', 'M1'));
    groups.research.push(schematic('research', 'R1'));
    const d = delta({
      playtimeDeltaSeconds: 3600,
      newSchematics: groups,
      buildingDeltas: [building(30)],
    });
    expect(categorizeActivity(d)).toBe('productive');
  });

  it('returns "exceptional" when a phase advances and lots is unlocked', () => {
    const groups = emptySchematicGroups();
    groups.milestone.push(schematic('milestone', 'M1'));
    groups.milestone.push(schematic('milestone', 'M2'));
    groups.research.push(schematic('research', 'R1'));
    const d = delta({
      playtimeDeltaSeconds: 10_800,
      newSchematics: groups,
      buildingDeltas: [building(80)],
      phaseChanged: { before: 'GP_Project_Assembly_Phase_1', after: 'GP_Project_Assembly_Phase_2' },
      phaseDeliveryDeltas: [delivery(500)],
    });
    expect(categorizeActivity(d)).toBe('exceptional');
  });
});

describe('pickAdaLine', () => {
  it('picks a line from the matching tone category', () => {
    const d = delta({ isEmpty: true });
    const line = pickAdaLine(d, () => 0);
    expect(ADA_LINES.idle).toContain(line);
  });

  it('is deterministic for a given rng value', () => {
    const groups = emptySchematicGroups();
    groups.milestone.push(schematic('milestone', 'M1'));
    groups.research.push(schematic('research', 'R1'));
    const d = delta({ newSchematics: groups, buildingDeltas: [building(30)] });
    expect(pickAdaLine(d, () => 0.5)).toBe(pickAdaLine(d, () => 0.5));
  });

  it('stays within bounds when rng returns its maximum', () => {
    const d = delta({ isEmpty: true });
    const line = pickAdaLine(d, () => 0.999999);
    expect(ADA_LINES.idle).toContain(line);
  });
});
