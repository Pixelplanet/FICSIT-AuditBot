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

  const power: PowerState = {
    generators: buildings.filter((b) => b.category === 'power'),
  };

  const logistics = extractLogistics(classCounts);

  return { buildings, power, logistics };
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
