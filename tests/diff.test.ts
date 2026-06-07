import { describe, expect, it } from 'vitest';
import { diffWorldStates } from '../src/diff/compare.js';
import { formatSummary } from '../src/summary/format.js';
import { WORLD_STATE_SCHEMA_VERSION, type PowerState, type WorldState } from '../src/model.js';

function baseState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    schemaVersion: WORLD_STATE_SCHEMA_VERSION,
    saveName: 'test',
    sessionName: 'Test World',
    buildVersion: 491125,
    playDurationSeconds: 3600,
    saveTimestampMs: 1_000_000,
    totalObjects: 100,
    schematics: [],
    gamePhase: { deliveredToTarget: [] },
    power: { generators: [], maxProductionMW: 0, maxConsumptionMW: 0, circuitCount: 0 },
    logistics: {
      locomotives: 0,
      freightWagons: 0,
      trainStations: 0,
      freightPlatforms: 0,
      truckStations: 0,
      vehicles: 0,
      droneStations: 0,
      drones: 0,
    },
    buildings: [],
    ...overrides,
  };
}

describe('diffWorldStates', () => {
  it('reports elapsed playtime between saves', () => {
    const before = baseState({ playDurationSeconds: 3600 });
    const after = baseState({ playDurationSeconds: 7200 });
    const delta = diffWorldStates(before, after);
    expect(delta.playtimeDeltaSeconds).toBe(3600);
    expect(delta.playtimeAfterSeconds).toBe(7200);
  });

  it('detects newly purchased schematics by category', () => {
    const before = baseState();
    const after = baseState({
      schematics: [
        { id: 'Schematic_4-1', path: 'p1', category: 'milestone', name: 'Tier 4 – Milestone 1' },
        { id: 'Research_Quartz_0', path: 'p2', category: 'research', name: 'Quartz 0' },
      ],
    });
    const delta = diffWorldStates(before, after);
    expect(delta.newSchematics.milestone).toHaveLength(1);
    expect(delta.newSchematics.research).toHaveLength(1);
    expect(delta.isEmpty).toBe(false);
  });

  it('does not report schematics that already existed', () => {
    const existing = {
      id: 'Schematic_1-1',
      path: 'p',
      category: 'milestone' as const,
      name: 'Tier 1 – Milestone 1',
    };
    const before = baseState({ schematics: [existing] });
    const after = baseState({ schematics: [existing] });
    const delta = diffWorldStates(before, after);
    expect(delta.newSchematics.milestone).toHaveLength(0);
    expect(delta.isEmpty).toBe(true);
  });

  it('computes building count increases', () => {
    const before = baseState({
      buildings: [{ id: 'Build_GeneratorCoal', name: 'Coal Generator', category: 'power', count: 2 }],
    });
    const after = baseState({
      buildings: [{ id: 'Build_GeneratorCoal', name: 'Coal Generator', category: 'power', count: 5 }],
    });
    const delta = diffWorldStates(before, after);
    expect(delta.buildingDeltas).toHaveLength(1);
    expect(delta.buildingDeltas[0].delta).toBe(3);
    expect(delta.buildingDeltas[0].after).toBe(5);
  });

  it('diffs phase deliveries only when target phase is unchanged', () => {
    const before = baseState({
      gamePhase: {
        targetPhase: 'GP_Project_Assembly_Phase_2',
        deliveredToTarget: [{ itemId: 'Desc_SpaceElevatorPart_1', name: 'Smart Plating', amount: 100 }],
      },
    });
    const after = baseState({
      gamePhase: {
        targetPhase: 'GP_Project_Assembly_Phase_2',
        deliveredToTarget: [{ itemId: 'Desc_SpaceElevatorPart_1', name: 'Smart Plating', amount: 175 }],
      },
    });
    const delta = diffWorldStates(before, after);
    expect(delta.phaseDeliveryDeltas).toHaveLength(1);
    expect(delta.phaseDeliveryDeltas[0].delta).toBe(75);
  });

  it('computes phase progress (needed vs delivered) for the target phase', () => {
    const state = baseState({
      gamePhase: {
        currentPhase: 'GP_Project_Assembly_Phase_1',
        targetPhase: 'GP_Project_Assembly_Phase_2',
        deliveredToTarget: [{ itemId: 'Desc_SpaceElevatorPart_1', name: 'Smart Plating', amount: 883 }],
      },
    });
    const delta = diffWorldStates(state, state);
    const progress = delta.phaseProgress;
    expect(progress).toBeDefined();
    expect(progress!.phaseName).toBe('Construction Dock');
    const smart = progress!.parts.find((p) => p.itemId === 'Desc_SpaceElevatorPart_1');
    expect(smart).toMatchObject({ delivered: 883, required: 1000 });
    // 883/1000 + 0/1000 + 0/100 => 883/2100 ≈ 0.42
    expect(Math.round(progress!.fraction * 100)).toBe(42);
  });

  it('scales phase requirements by the save parts cost multiplier', () => {
    const state = baseState({
      gamePhase: {
        currentPhase: 'GP_Project_Assembly_Phase_1',
        targetPhase: 'GP_Project_Assembly_Phase_2',
        partsCostMultiplier: 2,
        deliveredToTarget: [{ itemId: 'Desc_SpaceElevatorPart_1', name: 'Smart Plating', amount: 883 }],
      },
    });
    const progress = diffWorldStates(state, state).phaseProgress!;
    expect(progress.multiplier).toBe(2);
    expect(progress.multiplierSource).toBe('save');
    const smart = progress.parts.find((p) => p.itemId === 'Desc_SpaceElevatorPart_1');
    expect(smart!.required).toBe(2000);
    // 883/2000 + 0/2000 + 0/200 => 883/4200 ≈ 0.21
    expect(Math.round(progress.fraction * 100)).toBe(21);
  });

  it('lets the config override take precedence over the save multiplier', () => {
    const state = baseState({
      gamePhase: {
        targetPhase: 'GP_Project_Assembly_Phase_1',
        partsCostMultiplier: 2,
        deliveredToTarget: [{ itemId: 'Desc_SpaceElevatorPart_1', name: 'Smart Plating', amount: 50 }],
      },
    });
    const progress = diffWorldStates(state, state, { phaseCostMultiplierOverride: 1 }).phaseProgress!;
    expect(progress.multiplier).toBe(1);
    expect(progress.multiplierSource).toBe('override');
    // Phase 1 base = 50 Smart Plating; 50 delivered => complete.
    expect(progress.parts[0].required).toBe(50);
    expect(progress.complete).toBe(true);
  });

  it('treats only-time-changed saves as empty', () => {
    const before = baseState({ playDurationSeconds: 100 });
    const after = baseState({ playDurationSeconds: 5000 });
    const delta = diffWorldStates(before, after);
    expect(delta.isEmpty).toBe(true);
  });
});

function power(overrides: Partial<PowerState> = {}): PowerState {
  return { generators: [], maxProductionMW: 0, maxConsumptionMW: 0, circuitCount: 0, ...overrides };
}

describe('power delta', () => {
  it('computes production/consumption change and balance', () => {
    const before = baseState({ power: power({ maxProductionMW: 690, maxConsumptionMW: 3304, circuitCount: 2 }) });
    const after = baseState({
      power: power({ maxProductionMW: 990, maxConsumptionMW: 3504, circuitCount: 2 }),
    });
    const delta = diffWorldStates(before, after);
    expect(delta.power.maxProductionAfterMW).toBe(990);
    expect(delta.power.maxProductionDeltaMW).toBe(300);
    expect(delta.power.maxConsumptionDeltaMW).toBe(200);
    expect(delta.power.balanceAfterMW).toBe(990 - 3504);
    expect(delta.power.circuitCount).toBe(2);
  });

  it('renders a deficit warning in the summary', () => {
    const before = baseState({ power: power({ maxProductionMW: 100, maxConsumptionMW: 100 }) });
    const after = baseState({
      playDurationSeconds: 7200,
      buildings: [{ id: 'Build_GeneratorCoal', name: 'Coal Generator', category: 'power', count: 2 }],
      power: power({ maxProductionMW: 150, maxConsumptionMW: 600, circuitCount: 1 }),
    });
    const { text } = formatSummary(diffWorldStates(before, after), { includeAda: false });
    expect(text).toContain('Max production: **150 MW**');
    expect(text).toContain('Max consumption: **600 MW**');
    expect(text).toContain('more power needed');
  });

  it('renders a surplus when production exceeds consumption', () => {
    const before = baseState({ power: power({ maxProductionMW: 100, maxConsumptionMW: 50 }) });
    const after = baseState({
      buildings: [{ id: 'Build_GeneratorCoal', name: 'Coal Generator', category: 'power', count: 1 }],
      power: power({ maxProductionMW: 800, maxConsumptionMW: 300, circuitCount: 1 }),
    });
    const { text } = formatSummary(diffWorldStates(before, after), { includeAda: false });
    expect(text).toContain('Balance: **+500 MW** ✅ surplus');
  });
});
