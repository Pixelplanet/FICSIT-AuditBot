/**
 * Tally buildings by class and derive the power and logistics summaries.
 */
import type { SaveObject } from '../save/parser.js';
import type {
  BuildingCount,
  LogisticsState,
  PowerState,
} from '../model.js';
import {
  GENERATOR_NAMES,
  GENERATOR_RATED_MW,
  LOGISTICS_CLASS_IDS,
  TRACKED_BUILDING_IDS,
  buildingCategory,
  buildingName,
  shortId,
} from '../data/gameData.js';

export interface BuildingsInfo {
  buildings: BuildingCount[];
  power: PowerState;
  logistics: LogisticsState;
}

export function extractBuildings(objects: SaveObject[]): BuildingsInfo {
  // Count every class once.
  const classCounts = new Map<string, number>();
  for (const obj of objects) {
    const id = shortId(obj.typePath);
    classCounts.set(id, (classCounts.get(id) ?? 0) + 1);
  }

  const buildings: BuildingCount[] = [];
  for (const id of TRACKED_BUILDING_IDS) {
    const count = classCounts.get(id);
    if (count && count > 0) {
      buildings.push({ id, name: buildingName(id), category: buildingCategory(id), count });
    }
  }
  buildings.sort((a, b) => b.count - a.count);

  const generators = buildings.filter((b) => b.category === 'power');
  const power = extractPower(objects, generators);

  const logistics = extractLogistics(classCounts);

  return { buildings, power, logistics };
}

/**
 * Derive grid-wide power figures from the save's power components.
 *
 * Satisfactory serializes, on each {@link https://satisfactory.wiki.gg | FGPowerInfoComponent}:
 *  - `mDynamicProductionCapacity` for generators — the MW they can produce, and
 *  - `mTargetConsumption` for consumers — the MW they draw at full tilt.
 *
 * Summing these gives the maximum the world can produce vs. the maximum it
 * could consume if everything ran at once. The number of `FGPowerCircuit`
 * objects tells us how many independent grids exist.
 */
function extractPower(objects: SaveObject[], generators: BuildingCount[]): PowerState {
  let maxProductionMW = 0;
  let maxConsumptionMW = 0;
  let circuitCount = 0;

  for (const obj of objects) {
    const id = shortId(obj.typePath);
    if (id === 'FGPowerCircuit') {
      circuitCount++;
      continue;
    }
    if (id !== 'FGPowerInfoComponent') continue;

    const props = obj.properties as Record<string, any> | undefined;
    const capacity = props?.mDynamicProductionCapacity?.value;
    const consumption = props?.mTargetConsumption?.value;
    if (typeof capacity === 'number' && capacity > 0) maxProductionMW += capacity;
    if (typeof consumption === 'number' && consumption > 0) maxConsumptionMW += consumption;
  }

  // Fallback: if the save serialized no production capacity (e.g. all generators
  // idle/unfueled), estimate from generator counts × rated output.
  if (maxProductionMW === 0 && generators.length > 0) {
    maxProductionMW = generators.reduce(
      (sum, g) => sum + g.count * (GENERATOR_RATED_MW[g.id] ?? 0),
      0,
    );
  }

  return {
    generators,
    maxProductionMW: round1(maxProductionMW),
    maxConsumptionMW: round1(maxConsumptionMW),
    circuitCount,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sumClasses(counts: Map<string, number>, ids: readonly string[]): number {
  return ids.reduce((total, id) => total + (counts.get(id) ?? 0), 0);
}

function extractLogistics(counts: Map<string, number>): LogisticsState {
  return {
    locomotives: sumClasses(counts, LOGISTICS_CLASS_IDS.locomotive),
    freightWagons: sumClasses(counts, LOGISTICS_CLASS_IDS.freightWagon),
    trainStations: sumClasses(counts, LOGISTICS_CLASS_IDS.trainStation),
    freightPlatforms: sumClasses(counts, LOGISTICS_CLASS_IDS.freightPlatform),
    truckStations: sumClasses(counts, LOGISTICS_CLASS_IDS.truckStation),
    vehicles: sumClasses(counts, LOGISTICS_CLASS_IDS.vehicle),
    droneStations: sumClasses(counts, LOGISTICS_CLASS_IDS.droneStation),
    drones: sumClasses(counts, LOGISTICS_CLASS_IDS.drone),
  };
}

/** Re-export so other modules can reference the generator name map if needed. */
export { GENERATOR_NAMES };
