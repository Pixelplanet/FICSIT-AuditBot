/**
 * Compare two {@link WorldState} snapshots and produce a structured delta of
 * what changed. The summary formatter renders this into human-readable text.
 */
import type {
  BuildingCount,
  ItemAmount,
  SchematicCategory,
  SchematicEntry,
  WorldState,
} from '../model.js';
import { itemName, phaseRequirements } from '../data/gameData.js';

/** A building count that changed between two snapshots. */
export interface BuildingDelta {
  id: string;
  name: string;
  category: BuildingCount['category'];
  before: number;
  after: number;
  delta: number;
}

/** A delivered-item amount that changed for the current target phase. */
export interface ItemAmountDelta {
  itemId: string;
  name: string;
  before: number;
  after: number;
  delta: number;
}

/** Progress of one part toward the current target phase. */
export interface PhasePartProgress {
  itemId: string;
  name: string;
  delivered: number;
  required: number;
}

/** Overview of progress toward the current target project-assembly phase. */
export interface PhaseProgress {
  phaseId: string;
  phaseName: string;
  parts: PhasePartProgress[];
  /** Overall completion fraction in [0,1] across all required parts. */
  fraction: number;
  complete: boolean;
  /** Effective parts cost multiplier applied to the base requirements. */
  multiplier: number;
  /** Where the multiplier came from. */
  multiplierSource: 'save' | 'override' | 'default';
}

/** Options influencing the diff computation. */
export interface DiffOptions {
  /**
   * Override for the Space Elevator parts cost multiplier. When > 0 it takes
   * precedence over the value detected in the save.
   */
  phaseCostMultiplierOverride?: number;
}

export interface WorldDelta {
  sessionName: string;
  /** Elapsed in-game seconds between the two saves (after - before). */
  playtimeDeltaSeconds: number;
  /** Real-world milliseconds between the two saves (after - before). */
  realTimeDeltaMs: number;
  /** Absolute playtime values for context. */
  playtimeBeforeSeconds: number;
  playtimeAfterSeconds: number;

  /** Schematics present in `after` but not in `before`, grouped by category. */
  newSchematics: Record<SchematicCategory, SchematicEntry[]>;
  /** Active milestone changed. */
  activeMilestoneChanged?: { before?: string; after?: string };

  /** Game phase progression changes. */
  phaseChanged?: { before?: string; after?: string };
  targetPhaseChanged?: { before?: string; after?: string };
  phaseDeliveryDeltas: ItemAmountDelta[];
  /** Current progress toward the target phase (needed vs delivered). */
  phaseProgress?: PhaseProgress;

  /** Building count increases (and decreases). */
  buildingDeltas: BuildingDelta[];

  /** True when nothing meaningful changed besides time. */
  isEmpty: boolean;
}

const SCHEMATIC_CATEGORIES: SchematicCategory[] = [
  'milestone',
  'research',
  'alternateRecipe',
  'tutorial',
  'customization',
  'other',
];

export function diffWorldStates(
  before: WorldState,
  after: WorldState,
  options: DiffOptions = {},
): WorldDelta {
  const newSchematics = emptySchematicGroups();
  const beforeIds = new Set(before.schematics.map((s) => s.id));
  for (const schematic of after.schematics) {
    if (!beforeIds.has(schematic.id)) {
      newSchematics[schematic.category].push(schematic);
    }
  }

  const buildingDeltas = diffBuildings(before.buildings, after.buildings);
  const phaseDeliveryDeltas = diffDeliveries(
    before.gamePhase.deliveredToTarget,
    after.gamePhase.deliveredToTarget,
    before.gamePhase.targetPhase,
    after.gamePhase.targetPhase,
  );

  const activeMilestoneChanged =
    before.activeSchematicId !== after.activeSchematicId
      ? { before: before.activeSchematicId, after: after.activeSchematicId }
      : undefined;

  const phaseChanged =
    before.gamePhase.currentPhase !== after.gamePhase.currentPhase
      ? { before: before.gamePhase.currentPhase, after: after.gamePhase.currentPhase }
      : undefined;

  const targetPhaseChanged =
    before.gamePhase.targetPhase !== after.gamePhase.targetPhase
      ? { before: before.gamePhase.targetPhase, after: after.gamePhase.targetPhase }
      : undefined;

  const totalNewSchematics = SCHEMATIC_CATEGORIES.reduce(
    (n, c) => n + newSchematics[c].length,
    0,
  );

  const phaseProgress = computePhaseProgress(after, options.phaseCostMultiplierOverride);

  const isEmpty =
    totalNewSchematics === 0 &&
    buildingDeltas.length === 0 &&
    phaseDeliveryDeltas.length === 0 &&
    !phaseChanged &&
    !targetPhaseChanged &&
    !activeMilestoneChanged;

  return {
    sessionName: after.sessionName,
    playtimeDeltaSeconds: after.playDurationSeconds - before.playDurationSeconds,
    realTimeDeltaMs: after.saveTimestampMs - before.saveTimestampMs,
    playtimeBeforeSeconds: before.playDurationSeconds,
    playtimeAfterSeconds: after.playDurationSeconds,
    newSchematics,
    activeMilestoneChanged,
    phaseChanged,
    targetPhaseChanged,
    phaseDeliveryDeltas,
    phaseProgress,
    buildingDeltas,
    isEmpty,
  };
}

/**
 * Compute progress toward the current target phase by combining the curated
 * phase requirements with the delivered amounts from the save. Base
 * requirements are scaled by the parts cost multiplier (override if provided,
 * otherwise the value detected in the save, otherwise 1). Returns undefined
 * when the target phase requirements are unknown.
 */
function computePhaseProgress(
  after: WorldState,
  multiplierOverride?: number,
): PhaseProgress | undefined {
  const phaseId = after.gamePhase.targetPhase;
  const req = phaseRequirements(phaseId);
  if (!phaseId || !req) return undefined;

  let multiplier = 1;
  let multiplierSource: PhaseProgress['multiplierSource'] = 'default';
  if (typeof multiplierOverride === 'number' && multiplierOverride > 0) {
    multiplier = multiplierOverride;
    multiplierSource = 'override';
  } else if (typeof after.gamePhase.partsCostMultiplier === 'number' && after.gamePhase.partsCostMultiplier > 0) {
    multiplier = after.gamePhase.partsCostMultiplier;
    multiplierSource = 'save';
  }

  const deliveredById = new Map(after.gamePhase.deliveredToTarget.map((d) => [d.itemId, d.amount]));
  let totalRequired = 0;
  let totalDelivered = 0;

  const parts: PhasePartProgress[] = req.parts.map((p) => {
    const required = Math.round(p.amount * multiplier);
    const delivered = Math.min(deliveredById.get(p.itemId) ?? 0, required);
    totalRequired += required;
    totalDelivered += delivered;
    return {
      itemId: p.itemId,
      name: itemName(p.itemId),
      delivered: deliveredById.get(p.itemId) ?? 0,
      required,
    };
  });

  const fraction = totalRequired > 0 ? totalDelivered / totalRequired : 0;
  return {
    phaseId,
    phaseName: req.name,
    parts,
    fraction,
    complete: fraction >= 1,
    multiplier,
    multiplierSource,
  };
}

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

function diffBuildings(before: BuildingCount[], after: BuildingCount[]): BuildingDelta[] {
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterById = new Map(after.map((b) => [b.id, b]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  const deltas: BuildingDelta[] = [];
  for (const id of ids) {
    const b = beforeById.get(id);
    const a = afterById.get(id);
    const beforeCount = b?.count ?? 0;
    const afterCount = a?.count ?? 0;
    if (beforeCount === afterCount) continue;
    deltas.push({
      id,
      name: a?.name ?? b?.name ?? id,
      category: a?.category ?? b?.category ?? 'other',
      before: beforeCount,
      after: afterCount,
      delta: afterCount - beforeCount,
    });
  }
  // Largest positive change first.
  deltas.sort((x, y) => y.delta - x.delta);
  return deltas;
}

function diffDeliveries(
  before: ItemAmount[],
  after: ItemAmount[],
  beforeTarget: string | undefined,
  afterTarget: string | undefined,
): ItemAmountDelta[] {
  // Only meaningful when both snapshots are working toward the same target phase.
  if (beforeTarget !== afterTarget) return [];

  const beforeById = new Map(before.map((i) => [i.itemId, i]));
  const afterById = new Map(after.map((i) => [i.itemId, i]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  const deltas: ItemAmountDelta[] = [];
  for (const id of ids) {
    const b = beforeById.get(id)?.amount ?? 0;
    const a = afterById.get(id)?.amount ?? 0;
    if (a === b) continue;
    deltas.push({
      itemId: id,
      name: afterById.get(id)?.name ?? beforeById.get(id)?.name ?? id,
      before: b,
      after: a,
      delta: a - b,
    });
  }
  deltas.sort((x, y) => y.delta - x.delta);
  return deltas;
}
