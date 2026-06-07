/**
 * Static game-data helpers: classify schematics and buildings by their type
 * path / class name, and resolve friendly display names.
 *
 * The parser does not interpret game semantics, so all knowledge about what a
 * given class path *means* lives here. This is intentionally a curated subset
 * covering the common cases; unknown classes degrade gracefully to a
 * prettified version of their class name. Full coverage can later be layered in
 * from the game's `Docs.json` (see plan, Phase 4).
 */
import type {
  BuildingCategory,
  SchematicCategory,
} from '../model.js';
import { getDocsIndex } from './docsProvider.js';

/** Strip a full type path down to its short class name without trailing `_C`. */
export function shortId(typePathOrClass: string): string {
  const lastDot = typePathOrClass.lastIndexOf('.');
  const cls = lastDot >= 0 ? typePathOrClass.slice(lastDot + 1) : typePathOrClass;
  return cls.replace(/_C$/, '');
}

// ---------------------------------------------------------------------------
// Schematics
// ---------------------------------------------------------------------------

/** Classify a schematic by the folder segment of its type path. */
export function classifySchematic(typePath: string): SchematicCategory {
  const folder = typePath.match(/\/Schematics\/([^/]+)\//)?.[1] ?? '';
  const id = shortId(typePath);

  if (folder === 'Research') return 'research';
  if (folder === 'Alternate') return 'alternateRecipe';
  if (folder === 'Tutorial') return 'tutorial';
  if (id.startsWith('CustomizerUnlock')) return 'customization';
  // Milestones are the tiered HUB schematics `Schematic_N-M`.
  if (/^Schematic_\d+-\d+$/.test(id)) return 'milestone';
  if (folder === 'Progression') return 'milestone';
  return 'other';
}

/**
 * Friendly name for a schematic id. Prefers the real display name from the
 * game's Docs.json when available; otherwise falls back to a curated override
 * or a derived label.
 */
export function schematicName(id: string, category: SchematicCategory): string {
  const docsName = getDocsIndex()?.getSchematic(id)?.displayName;
  if (docsName) return docsName;

  const known = SCHEMATIC_NAMES[id];
  if (known) return known;

  if (category === 'milestone') {
    const m = id.match(/^Schematic_(\d+)-(\d+)$/);
    if (m) return `Tier ${m[1]} – Milestone ${m[2]}`;
  }
  if (category === 'research') {
    return prettify(id.replace(/^Research_/, '').replace(/_/g, ' '));
  }
  if (category === 'alternateRecipe') {
    return 'Alt: ' + prettify(id.replace(/^Schematic_Alternate_/, '').replace(/_/g, ' '));
  }
  return prettify(id.replace(/^Schematic_/, '').replace(/_/g, ' '));
}

/**
 * Human description of what a schematic unlocks (recipes, items, slots), from
 * Docs.json. For alternate recipes the unlocked recipe is shown as a formula
 * (ingredients → products). Returns undefined when docs are unavailable or
 * nothing notable is unlocked.
 */
export function schematicUnlocks(id: string): string | undefined {
  const docs = getDocsIndex();
  if (!docs) return undefined;
  const type = docs.getSchematic(id)?.type ?? '';
  const recipeFormulas = type === 'EST_Alternate';
  return docs.describeUnlocks(id, { recipeFormulas });
}

/** Tech tier of a schematic from Docs.json, if known. */
export function schematicTier(id: string): number | undefined {
  return getDocsIndex()?.getSchematic(id)?.techTier;
}

/** Curated overrides for schematic names where the auto-label is unclear. */
const SCHEMATIC_NAMES: Record<string, string> = {
  Schematic_StartingRecipes: 'Starting Recipes',
};

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** Generator classes -> friendly name. Used for the power section. */
export const GENERATOR_NAMES: Record<string, string> = {
  Build_GeneratorBiomass_Automated: 'Biomass Burner',
  Build_GeneratorBiomass: 'Biomass Burner',
  Build_GeneratorCoal: 'Coal Generator',
  Build_GeneratorFuel: 'Fuel Generator',
  Build_GeneratorNuclear: 'Nuclear Power Plant',
  Build_GeneratorGeoThermal: 'Geothermal Generator',
  Build_GeneratorIntegratedBiomass: 'Biomass Burner (Integrated)',
};

/**
 * Rated power output (MW) at 100% clock per generator class. Used only as a
 * fallback for total production capacity when a save has no serialized
 * `mDynamicProductionCapacity` value (the preferred, overclock-aware source).
 * Geothermal output is variable; its rough average is used.
 */
export const GENERATOR_RATED_MW: Record<string, number> = {
  Build_GeneratorBiomass: 30,
  Build_GeneratorBiomass_Automated: 30,
  Build_GeneratorIntegratedBiomass: 0,
  Build_GeneratorCoal: 75,
  Build_GeneratorFuel: 250,
  Build_GeneratorNuclear: 2500,
  Build_GeneratorGeoThermal: 200,
};

/** Production (manufacturing) building classes -> friendly name. */
export const PRODUCTION_NAMES: Record<string, string> = {
  Build_SmelterMk1: 'Smelter',
  Build_FoundryMk1: 'Foundry',
  Build_ConstructorMk1: 'Constructor',
  Build_AssemblerMk1: 'Assembler',
  Build_ManufacturerMk1: 'Manufacturer',
  Build_OilRefinery: 'Refinery',
  Build_Packager: 'Packager',
  Build_Blender: 'Blender',
  Build_HadronCollider: 'Particle Accelerator',
  Build_QuantumEncoder: 'Quantum Encoder',
  Build_Converter: 'Converter',
};

/** Resource extraction building classes -> friendly name. */
export const EXTRACTION_NAMES: Record<string, string> = {
  Build_MinerMk1: 'Miner Mk.1',
  Build_MinerMk2: 'Miner Mk.2',
  Build_MinerMk3: 'Miner Mk.3',
  Build_OilPump: 'Oil Extractor',
  Build_WaterPump: 'Water Extractor',
  Build_FrackingExtractor: 'Resource Well Extractor',
  Build_FrackingSmasher: 'Resource Well Pressurizer',
};

/** Storage building classes -> friendly name. */
export const STORAGE_NAMES: Record<string, string> = {
  Build_StorageContainerMk1: 'Storage Container',
  Build_StorageContainerMk2: 'Industrial Storage Container',
  Build_Storageplayer: 'Personal Storage Box',
  Build_StoragePlayer: 'Personal Storage Box',
};

/** Logistics class ids that we count individually in {@link LogisticsState}. */
export const LOGISTICS_CLASS_IDS = {
  locomotive: ['Build_Locomotive'],
  freightWagon: ['Build_FreightWagon'],
  trainStation: ['Build_TrainStation'],
  freightPlatform: ['Build_TrainDockingStation', 'Build_TrainPlatformCargo'],
  truckStation: ['Build_TruckStation'],
  vehicle: ['BP_Truck', 'BP_Tractor', 'BP_Explorer', 'BP_Cyberwagon'],
  droneStation: ['Build_DroneStation'],
  drone: ['BP_DroneTransport'],
} as const;

/** Resolve a friendly building name across all known maps. */
export function buildingName(id: string): string {
  return (
    GENERATOR_NAMES[id] ??
    PRODUCTION_NAMES[id] ??
    EXTRACTION_NAMES[id] ??
    STORAGE_NAMES[id] ??
    ITEM_NAMES[id] ??
    prettify(id.replace(/^Build_/, '').replace(/_/g, ' '))
  );
}

/** Categorize a building class id into a high-level bucket. */
export function buildingCategory(id: string): BuildingCategory {
  if (id in GENERATOR_NAMES) return 'power';
  if (id in PRODUCTION_NAMES) return 'production';
  if (id in EXTRACTION_NAMES) return 'extraction';
  if (id in STORAGE_NAMES) return 'storage';
  return 'other';
}

/** Set of all building class ids we track counts for. */
export const TRACKED_BUILDING_IDS = new Set<string>([
  ...Object.keys(GENERATOR_NAMES),
  ...Object.keys(PRODUCTION_NAMES),
  ...Object.keys(EXTRACTION_NAMES),
  ...Object.keys(STORAGE_NAMES),
]);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Friendly names for items referenced in game-phase delivery costs etc. */
export const ITEM_NAMES: Record<string, string> = {
  Desc_SpaceElevatorPart_1: 'Smart Plating',
  Desc_SpaceElevatorPart_2: 'Versatile Framework',
  Desc_SpaceElevatorPart_3: 'Automated Wiring',
  Desc_SpaceElevatorPart_4: 'Modular Engine',
  Desc_SpaceElevatorPart_5: 'Adaptive Control Unit',
  Desc_SpaceElevatorPart_6: 'Magnetic Field Generator',
  Desc_SpaceElevatorPart_7: 'Assembly Director System',
  Desc_SpaceElevatorPart_8: 'Thermal Propulsion Rocket',
  Desc_SpaceElevatorPart_9: 'Nuclear Pasta',
};

/** Resolve a friendly item name from an item id. */
export function itemName(id: string): string {
  return (
    getDocsIndex()?.itemName(id) ??
    ITEM_NAMES[id] ??
    prettify(id.replace(/^Desc_/, '').replace(/_/g, ' '))
  );
}

// ---------------------------------------------------------------------------
// Game phases (Project Assembly / Space Elevator)
// ---------------------------------------------------------------------------

/** One required part for a project-assembly phase. */
export interface PhasePart {
  itemId: string;
  amount: number;
}

/** A project-assembly phase: friendly name + the parts it requires. */
export interface PhaseRequirement {
  name: string;
  parts: PhasePart[];
}

/**
 * Curated Space Elevator / Project Assembly phase requirements (initial phase
 * costs). The game does not export these in Docs.json, so they are maintained
 * here. Validated against real saves (e.g. Phase 2 needs 1,000 Smart Plating).
 * Item ids map to Desc_SpaceElevatorPart_N as verified from the game data.
 */
export const PHASE_REQUIREMENTS: Record<string, PhaseRequirement> = {
  GP_Project_Assembly_Phase_1: {
    name: 'Distribution Platform',
    parts: [{ itemId: 'Desc_SpaceElevatorPart_1', amount: 50 }],
  },
  GP_Project_Assembly_Phase_2: {
    name: 'Construction Dock',
    parts: [
      { itemId: 'Desc_SpaceElevatorPart_1', amount: 1000 },
      { itemId: 'Desc_SpaceElevatorPart_2', amount: 1000 },
      { itemId: 'Desc_SpaceElevatorPart_3', amount: 100 },
    ],
  },
  GP_Project_Assembly_Phase_3: {
    name: 'Main Body',
    parts: [
      { itemId: 'Desc_SpaceElevatorPart_2', amount: 2500 },
      { itemId: 'Desc_SpaceElevatorPart_4', amount: 500 },
      { itemId: 'Desc_SpaceElevatorPart_5', amount: 100 },
    ],
  },
  GP_Project_Assembly_Phase_4: {
    name: 'Propulsion',
    parts: [
      { itemId: 'Desc_SpaceElevatorPart_7', amount: 500 },
      { itemId: 'Desc_SpaceElevatorPart_6', amount: 500 },
      { itemId: 'Desc_SpaceElevatorPart_8', amount: 250 },
      { itemId: 'Desc_SpaceElevatorPart_9', amount: 100 },
    ],
  },
  GP_Project_Assembly_Phase_5: {
    name: 'Assembly',
    parts: [
      { itemId: 'Desc_SpaceElevatorPart_9', amount: 1000 },
      { itemId: 'Desc_SpaceElevatorPart_10', amount: 1000 },
      { itemId: 'Desc_SpaceElevatorPart_12', amount: 256 },
      { itemId: 'Desc_SpaceElevatorPart_11', amount: 200 },
    ],
  },
};

/** Friendly names for project assembly (space elevator) phases. */
export function gamePhaseName(id: string): string {
  const req = PHASE_REQUIREMENTS[id];
  const m = id.match(/Phase_(\d+)/);
  const num = m ? `Phase ${m[1]}` : prettify(id.replace(/^GP_Project_Assembly_/, '').replace(/_/g, ' '));
  return req ? `${num}: ${req.name}` : num;
}

/** Required parts for a phase id, or undefined if unknown. */
export function phaseRequirements(id: string | undefined): PhaseRequirement | undefined {
  return id ? PHASE_REQUIREMENTS[id] : undefined;
}

/** Items required to complete a schematic (HUB milestone cost), as text. */
export function schematicCostText(id: string): string | undefined {
  return getDocsIndex()?.describeCost(id);
}

/** Recipe formula text (ingredients → products @ building), if known. */
export function recipeFormula(id: string): string | undefined {
  return getDocsIndex()?.recipeFormula(id);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Title-case a space-separated string and collapse extra whitespace. */
function prettify(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
