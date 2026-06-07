/**
 * Normalized snapshot of the parts of a Satisfactory world that we track and
 * diff between saves. Extractors produce a `WorldState`; the diff engine
 * compares two of them. Everything here is plain JSON so it can be serialized
 * to the state store.
 */

/** A schematic the player has purchased (milestone / research / alt recipe). */
export interface SchematicEntry {
  /** Stable id = short class name without the trailing `_C`, e.g. `Schematic_4-1`. */
  id: string;
  /** Full type path from the save, for reference. */
  path: string;
  /** Category derived from the schematic's folder. */
  category: SchematicCategory;
  /** Friendly display name, resolved from Docs.json or a curated map when known. */
  name: string;
  /** Tech tier, when known from Docs.json. */
  tier?: number;
  /** Human description of what this schematic unlocks, from Docs.json. */
  unlocks?: string;
  /** Human description of what this schematic cost to complete, from Docs.json. */
  cost?: string;
}

export type SchematicCategory =
  | 'milestone'
  | 'research'
  | 'alternateRecipe'
  | 'tutorial'
  | 'customization'
  | 'other';

/** A count of buildings of one class. */
export interface BuildingCount {
  /** Short class name without `_C`, e.g. `Build_GeneratorCoal`. */
  id: string;
  /** Friendly display name. */
  name: string;
  /** Category bucket. */
  category: BuildingCategory;
  count: number;
}

export type BuildingCategory =
  | 'production'
  | 'extraction'
  | 'power'
  | 'logistics'
  | 'storage'
  | 'other';

/** Space Elevator / project assembly progress toward the next phase. */
export interface GamePhaseState {
  /** Current phase id, e.g. `GP_Project_Assembly_Phase_1`. */
  currentPhase?: string;
  /** Target phase id being worked toward. */
  targetPhase?: string;
  /** Amounts already delivered toward the target phase, keyed by item id. */
  deliveredToTarget: ItemAmount[];
  /**
   * Space-parts cost multiplier from the save's game state (e.g. 2 doubles all
   * project-assembly part requirements). Undefined when not present.
   */
  partsCostMultiplier?: number;
}

export interface ItemAmount {
  /** Item id = short class name without `_C`, e.g. `Desc_SpaceElevatorPart_1`. */
  itemId: string;
  /** Friendly item name. */
  name: string;
  amount: number;
}

/** Logistics tallies (trains, trucks and their stations). */
export interface LogisticsState {
  locomotives: number;
  freightWagons: number;
  trainStations: number;
  freightPlatforms: number;
  truckStations: number;
  vehicles: number;
  droneStations: number;
  drones: number;
}

/** Dimensional Depot / cloud-storage snapshot. */
export interface StorageState {
  /** Number of Dimensional Depot Uploader buildings present in the save. */
  dimensionalDepotUploaders: number;
  /** Best-effort list of item types currently exposed by the central storage system. */
  dimensionalDepotItems: ItemAmount[];
}

/** Power infrastructure tallies grouped by generator type. */
export interface PowerState {
  /** Count of each generator type, keyed by friendly name. */
  generators: BuildingCount[];
  /**
   * Maximum power that can be produced across all grids, in MW. Summed from the
   * generators' serialized dynamic production capacity (falls back to rated
   * capacity by generator count when the save has no serialized value).
   */
  maxProductionMW: number;
  /**
   * Maximum power that could be consumed across all grids, in MW, if every
   * machine ran at once. Summed from each consumer's serialized target
   * consumption.
   */
  maxConsumptionMW: number;
  /** Number of independent power circuits (grids) in the world. */
  circuitCount: number;
}

/** The full normalized snapshot of a single save file. */
export interface WorldState {
  /** Schema version of this WorldState shape (for forward compatibility). */
  schemaVersion: number;
  /** Source save file name. */
  saveName: string;
  /** Session/world name from the header. */
  sessionName: string;
  /** Game build version number. */
  buildVersion: number;
  /** In-game elapsed playtime in seconds. */
  playDurationSeconds: number;
  /** Real-world save timestamp as epoch milliseconds. */
  saveTimestampMs: number;
  /** Total parsed object count (sanity metric). */
  totalObjects: number;

  schematics: SchematicEntry[];
  activeSchematicId?: string;
  gamePhase: GamePhaseState;
  power: PowerState;
  logistics: LogisticsState;
  storage: StorageState;
  /** All tracked building counts (includes production/extraction/storage). */
  buildings: BuildingCount[];
}

export const WORLD_STATE_SCHEMA_VERSION = 1;
