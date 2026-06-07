/**
 * Tally buildings by class and derive the power and logistics summaries.
 */
import type { SaveObject } from '../save/parser.js';
import type {
  BuildingCount,
  LogisticsState,
  PowerState,
  StorageState,
} from '../model.js';
import {
  GENERATOR_NAMES,
  GENERATOR_RATED_MW,
  LOGISTICS_CLASS_IDS,
  itemName,
  TRACKED_BUILDING_IDS,
  buildingCategory,
  buildingName,
  shortId,
} from '../data/gameData.js';

export interface BuildingsInfo {
  buildings: BuildingCount[];
  power: PowerState;
  logistics: LogisticsState;
  storage: StorageState;
}

export function extractBuildings(objects: SaveObject[], decompressedBody?: Uint8Array): BuildingsInfo {
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
  const storage = extractStorage(objects, classCounts, decompressedBody);

  return { buildings, power, logistics, storage };
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
  const connectedOwners = collectConnectedOwners(objects);
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

    const owner = ownerPath(obj.instanceName);
    if (!connectedOwners.has(owner)) continue;

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

/** Build a set of owner object paths that are attached to at least one power circuit. */
function collectConnectedOwners(objects: SaveObject[]): Set<string> {
  const connectedOwners = new Set<string>();
  for (const obj of objects) {
    if (shortId(obj.typePath) !== 'FGPowerCircuit') continue;
    const props = obj.properties as Record<string, any> | undefined;
    const members = Array.isArray(props?.mComponents?.values) ? props.mComponents.values : [];
    for (const member of members) {
      const pathName = typeof member?.pathName === 'string' ? member.pathName : undefined;
      if (!pathName) continue;
      connectedOwners.add(ownerPath(pathName));
    }
  }
  return connectedOwners;
}

/** Strip a component path down to its owning actor path. */
function ownerPath(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(0, idx) : path;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sumClasses(counts: Map<string, number>, ids: readonly string[]): number {
  return ids.reduce((total, id) => total + (counts.get(id) ?? 0), 0);
}

function extractLogistics(counts: Map<string, number>): LogisticsState {
  return {
    railroadTracks: sumClasses(counts, LOGISTICS_CLASS_IDS.railroadTrack),
    railroadBlockSignals: sumClasses(counts, LOGISTICS_CLASS_IDS.railroadBlockSignal),
    railroadSwitchControls: sumClasses(counts, LOGISTICS_CLASS_IDS.railroadSwitchControl),
    locomotives: sumClasses(counts, LOGISTICS_CLASS_IDS.locomotive),
    freightWagons: sumClasses(counts, LOGISTICS_CLASS_IDS.freightWagon),
    trainStations: sumClasses(counts, LOGISTICS_CLASS_IDS.trainStation),
    freightPlatforms: sumClasses(counts, LOGISTICS_CLASS_IDS.freightPlatform),
    vehiclePathUniversal: sumClasses(counts, LOGISTICS_CLASS_IDS.vehiclePathUniversal),
    vehiclePathTruck: sumClasses(counts, LOGISTICS_CLASS_IDS.vehiclePathTruck),
    vehiclePathTractor: sumClasses(counts, LOGISTICS_CLASS_IDS.vehiclePathTractor),
    vehiclePathExplorer: sumClasses(counts, LOGISTICS_CLASS_IDS.vehiclePathExplorer),
    vehiclePathFactoryCart: sumClasses(counts, LOGISTICS_CLASS_IDS.vehiclePathFactoryCart),
    truckStations: sumClasses(counts, LOGISTICS_CLASS_IDS.truckStation),
    vehicles: sumClasses(counts, LOGISTICS_CLASS_IDS.vehicle),
    droneStations: sumClasses(counts, LOGISTICS_CLASS_IDS.droneStation),
    drones: sumClasses(counts, LOGISTICS_CLASS_IDS.drone),
  };
}

function extractStorage(
  objects: SaveObject[],
  counts: Map<string, number>,
  decompressedBody?: Uint8Array,
): StorageState {
  const dimensionalDepotUploaders = sumClasses(counts, ['Build_CentralStorage', 'Desc_CentralStorage']);
  return {
    dimensionalDepotUploaders,
    dimensionalDepotItems: extractCentralStorageItems(objects, decompressedBody),
  };
}

function extractCentralStorageItems(
  objects: SaveObject[],
  decompressedBody?: Uint8Array,
): StorageState['dimensionalDepotItems'] {
  const items = new Map<string, number>();
  const seen = new WeakSet<object>();
  for (const obj of objects) {
    if (shortId(obj.typePath) !== 'FGCentralStorageSubsystem') continue;
    collectItemAmounts(obj.properties, items, seen);
  }

  // Some saves keep dimensional-depot amounts in opaque payload sections.
  // Fall back to decoding ItemAmounts blocks directly from the decompressed body.
  if (items.size === 0 && decompressedBody && decompressedBody.length > 0) {
    return extractCentralStorageItemsFromRawBody(decompressedBody);
  }

  return [...items.entries()]
    .map(([itemId, amount]) => ({ itemId, name: itemName(itemId), amount: round1(amount) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extractCentralStorageItemsFromRawBody(
  decompressedBody: Uint8Array,
): StorageState['dimensionalDepotItems'] {
  const buffer = Buffer.from(decompressedBody);
  const text = buffer.toString('latin1');
  const anchorOffsets = findAll(text, 'ItemAmounts');
  if (anchorOffsets.length === 0) return [];

  const bestWindow = new Map<string, number>();
  let bestScore = -1;

  for (const anchor of anchorOffsets) {
    const windowItems = decodeItemAmountsWindow(buffer, text, anchor, 16_384);
    if (windowItems.size === 0) continue;

    const total = [...windowItems.values()].reduce((sum, value) => sum + value, 0);
    const score = windowItems.size * 1_000_000 + Math.min(total, 999_999);
    if (score > bestScore) {
      bestScore = score;
      bestWindow.clear();
      for (const [itemId, amount] of windowItems.entries()) {
        bestWindow.set(itemId, amount);
      }
    }
  }

  return [...bestWindow.entries()]
    .map(([itemId, amount]) => ({ itemId, name: itemName(itemId), amount: round1(amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function decodeItemAmountsWindow(
  bytes: Buffer,
  text: string,
  anchor: number,
  maxSpan: number,
): Map<string, number> {
  const end = Math.min(text.length, anchor + maxSpan);
  const slice = text.slice(anchor, end);
  const matches = slice.matchAll(/\/Game\/FactoryGame\/[^\x00\n\r]{0,240}\/(Desc_[A-Za-z0-9_]+)\.\1_C/g);
  const items = new Map<string, number>();

  for (const match of matches) {
    if (match.index === undefined) continue;
    const itemId = match[1];
    const path = match[0];
    const absolute = anchor + match.index;
    const amountPos = absolute + path.length + 1;
    if (amountPos < 0 || amountPos + 4 > bytes.length) continue;

    const amount = bytes.readInt32LE(amountPos);
    if (amount <= 0 || amount > 2_000_000_000) continue;

    // Keep the largest amount encountered for each item in this ItemAmounts block.
    const previous = items.get(itemId) ?? 0;
    if (amount > previous) items.set(itemId, amount);
  }

  return items;
}

function findAll(haystack: string, needle: string): number[] {
  const offsets: number[] = [];
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    offsets.push(idx);
    from = idx + needle.length;
  }
  return offsets;
}

function collectItemAmounts(value: unknown, items: Map<string, number>, seen: WeakSet<object>): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value as object)) return;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const entry of value) collectItemAmounts(entry, items, seen);
    return;
  }

  const record = value as Record<string, unknown>;
  const itemId = extractItemId(record);
  const amount = extractAmount(record);
  if (itemId && typeof amount === 'number' && amount > 0) {
    items.set(itemId, (items.get(itemId) ?? 0) + amount);
  }

  for (const nested of Object.values(record)) {
    collectItemAmounts(nested, items, seen);
  }
}

function extractItemId(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.itemId,
    record.ItemId,
    record.itemClass,
    record.ItemClass,
    record.mItemClass,
    record.mItem,
    record.pathName,
  ];
  for (const candidate of candidates) {
    const id = normalizeItemId(candidate);
    if (id) return id;
  }
  return undefined;
}

function extractAmount(record: Record<string, unknown>): number | undefined {
  const candidates = [
    record.amount,
    record.Amount,
    record.count,
    record.Count,
    record.quantity,
    record.Quantity,
    record.mAmount,
    record.mCount,
    record.mQuantity,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'object' && candidate && 'value' in candidate) {
      const value = (candidate as { value?: unknown }).value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function normalizeItemId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const short = value.match(/(Desc_[A-Za-z0-9_]+|BP_[A-Za-z0-9_]+|Build_[A-Za-z0-9_]+)/)?.[1];
  return short;
}

/** Re-export so other modules can reference the generator name map if needed. */
export { GENERATOR_NAMES };
