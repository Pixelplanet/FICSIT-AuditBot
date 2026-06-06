/**
 * Loads the game's `Docs.json` / `en-US.json` and builds an in-memory index of
 * display names and schematic unlock information, so summaries can show real,
 * meaningful names (e.g. "Caterium Electronics" and what it unlocks) instead of
 * raw class ids.
 *
 * Keys are normalized to short class names WITHOUT the trailing `_C`, matching
 * the ids we derive from save objects.
 */
import { readFile } from 'node:fs/promises';
import {
  decodeDocsBuffer,
  extractClassNames,
  extractItemAmounts,
  shortClassName,
  type ParsedItemAmount,
} from './unreal.js';

/** A schematic's parsed unlock information. */
export interface SchematicUnlocks {
  recipes: string[]; // short recipe class ids (no _C)
  giveItems: ParsedItemAmount[];
  inventorySlots: number;
  scannerResources: string[];
}

export interface SchematicRecord {
  id: string; // short class id (no _C)
  displayName: string;
  type: string; // e.g. EST_Milestone, EST_MAM, EST_Alternate
  techTier: number;
  unlocks: SchematicUnlocks;
  /** Items required to complete/unlock this schematic (HUB milestone cost). */
  cost: ParsedItemAmount[];
}

export interface RecipeRecord {
  id: string;
  displayName: string;
  ingredients: ParsedItemAmount[];
  products: ParsedItemAmount[];
  /** Short building class ids this recipe is produced in (e.g. Build_ConstructorMk1). */
  producedIn: string[];
  /** Base manufacturing duration in seconds. */
  duration: number;
  /** Whether this is an alternate recipe (display name starts with "Alternate"). */
  alternate: boolean;
}

export interface GameDataStats {
  items: number;
  recipes: number;
  schematics: number;
}

const ITEM_DESCRIPTOR_CLASSES = new Set([
  'FGItemDescriptor',
  'FGItemDescriptorBiomass',
  'FGItemDescriptorNuclearFuel',
  'FGResourceDescriptor',
  'FGEquipmentDescriptor',
  'FGConsumableDescriptor',
  'FGBuildingDescriptor',
  'FGVehicleDescriptor',
  'FGPoleDescriptor',
  'FGItemDescAmmoTypeProjectile',
  'FGItemDescAmmoTypeColorCartridge',
  'FGItemDescAmmoTypeInstantHit',
  'FGAmmoTypeProjectile',
  'FGAmmoTypeSpreadshot',
  'FGAmmoTypeInstantHit',
  'FGPowerShardDescriptor',
]);

/** Pull the bare native class name (e.g. `FGSchematic`) from a NativeClass tag. */
function nativeClassName(nativeClass: string): string {
  // e.g. "Class'/Script/FactoryGame.FGSchematic'"
  const m = nativeClass.match(/\.([A-Za-z0-9_]+)'?$/);
  return m ? m[1] : nativeClass;
}

export class GameDataIndex {
  readonly items = new Map<string, string>(); // id -> display name
  readonly recipes = new Map<string, RecipeRecord>();
  readonly schematics = new Map<string, SchematicRecord>();
  /** Absolute path the data was loaded from. */
  sourcePath?: string;

  stats(): GameDataStats {
    return { items: this.items.size, recipes: this.recipes.size, schematics: this.schematics.size };
  }

  itemName(id: string): string | undefined {
    return this.items.get(id);
  }

  recipeName(id: string): string | undefined {
    return this.recipes.get(id)?.displayName;
  }

  getRecipe(id: string): RecipeRecord | undefined {
    return this.recipes.get(id);
  }

  getSchematic(id: string): SchematicRecord | undefined {
    return this.schematics.get(id);
  }

  /**
   * Render a recipe as a formula string, e.g.
   * "5× Iron Ingot → 20× Cast Screw @ Constructor (24s)".
   * Returns undefined if the recipe is unknown.
   */
  recipeFormula(id: string, opts: { building?: boolean; time?: boolean } = {}): string | undefined {
    const rec = this.recipes.get(id);
    if (!rec) return undefined;
    const fmt = (a: ParsedItemAmount) => `${formatAmount(a.amount)}× ${this.itemName(a.itemId) ?? prettify(a.itemId)}`;
    const ins = rec.ingredients.map(fmt).join(' + ');
    const outs = rec.products.map(fmt).join(' + ');
    let formula = ins && outs ? `${ins} → ${outs}` : outs || ins || rec.displayName;
    if (opts.building !== false && rec.producedIn.length > 0) {
      const buildId = rec.producedIn[0];
      const b = this.itemName(buildId) ?? this.itemName(buildId.replace(/^Build_/, 'Desc_'));
      if (b) formula += ` @ ${b}`;
    }
    if (opts.time !== false && rec.duration > 0) {
      formula += ` (${formatAmount(rec.duration)}s)`;
    }
    return formula;
  }

  /** Items required to complete a schematic (HUB milestone cost), as text. */
  describeCost(id: string, maxItems = 6): string | undefined {
    const rec = this.schematics.get(id);
    if (!rec || rec.cost.length === 0) return undefined;
    const parts = rec.cost.map((c) => `${formatAmount(c.amount)}× ${this.itemName(c.itemId) ?? prettify(c.itemId)}`);
    return formatList('Cost', parts, maxItems);
  }

  /**
   * Build a short human description of what a schematic unlocks, e.g.
   * "Unlocks: Caterium Ingot, Quickwire" or "Unlocks 12 recipes incl. …".
   * When `recipeFormulas` is set, unlocked recipes are rendered as formulas
   * (used for alternate recipes). Returns undefined when nothing notable.
   */
  describeUnlocks(id: string, opts: { maxItems?: number; recipeFormulas?: boolean } = {}): string | undefined {
    const rec = this.schematics.get(id);
    if (!rec) return undefined;
    const maxItems = opts.maxItems ?? 4;
    const parts: string[] = [];

    if (opts.recipeFormulas && rec.unlocks.recipes.length > 0) {
      const formulas = rec.unlocks.recipes
        .map((r) => this.recipeFormula(r) ?? this.recipeName(r) ?? prettify(r))
        .filter((n, i, a) => a.indexOf(n) === i);
      parts.push(formulas.join('; '));
    } else {
      const recipeNames = rec.unlocks.recipes
        .map((r) => this.recipeName(r) ?? prettify(r))
        .filter((n, i, a) => a.indexOf(n) === i);
      if (recipeNames.length > 0) {
        parts.push(formatList('Unlocks', recipeNames, maxItems));
      }
    }

    if (rec.unlocks.giveItems.length > 0) {
      const gives = rec.unlocks.giveItems.map(
        (g) => `${formatAmount(g.amount)}× ${this.itemName(g.itemId) ?? prettify(g.itemId)}`,
      );
      parts.push(formatList('Gives', gives, maxItems));
    }

    if (rec.unlocks.inventorySlots > 0) {
      parts.push(`+${rec.unlocks.inventorySlots} inventory slots`);
    }

    if (rec.unlocks.scannerResources.length > 0) {
      const res = rec.unlocks.scannerResources.map((r) => this.itemName(r) ?? prettify(r));
      parts.push(formatList('Scannable', res, maxItems));
    }

    return parts.length > 0 ? parts.join(' · ') : undefined;
  }
}

/** Parse a raw decoded docs JSON array into a {@link GameDataIndex}. */
export function buildIndex(docs: unknown): GameDataIndex {
  const index = new GameDataIndex();
  if (!Array.isArray(docs)) return index;

  for (const group of docs as { NativeClass?: string; Classes?: any[] }[]) {
    const native = nativeClassName(group?.NativeClass ?? '');
    const classes = Array.isArray(group?.Classes) ? group.Classes : [];

    if (native === 'FGRecipe') {
      for (const c of classes) addRecipe(index, c);
    } else if (native === 'FGSchematic') {
      for (const c of classes) addSchematic(index, c);
    } else if (native.startsWith('FGBuildable')) {
      // Buildable classes carry their own display name keyed by `Build_X` id
      // (e.g. Build_FoundryMk1). Index them so recipe "produced in" resolves.
      for (const c of classes) addItem(index, c);
    } else if (ITEM_DESCRIPTOR_CLASSES.has(native) || native.endsWith('Descriptor')) {
      for (const c of classes) addItem(index, c);
    }
  }
  return index;
}

function addItem(index: GameDataIndex, c: any): void {
  if (typeof c?.ClassName !== 'string') return;
  const id = shortClassName(c.ClassName);
  const name = typeof c.mDisplayName === 'string' && c.mDisplayName.trim() ? c.mDisplayName.trim() : undefined;
  if (name) index.items.set(id, name);
}

function addRecipe(index: GameDataIndex, c: any): void {
  if (typeof c?.ClassName !== 'string') return;
  const id = shortClassName(c.ClassName);
  const displayName =
    typeof c.mDisplayName === 'string' && c.mDisplayName.trim() ? c.mDisplayName.trim() : prettify(id);
  index.recipes.set(id, {
    id,
    displayName,
    ingredients: extractItemAmounts(c.mIngredients),
    products: extractItemAmounts(c.mProduct),
    producedIn: extractClassNames(c.mProducedIn),
    duration: Number.parseFloat(c.mManufactoringDuration ?? '0') || 0,
    alternate: /^alternate\b/i.test(displayName),
  });
}

function addSchematic(index: GameDataIndex, c: any): void {
  if (typeof c?.ClassName !== 'string') return;
  const id = shortClassName(c.ClassName);
  const displayName =
    typeof c.mDisplayName === 'string' && c.mDisplayName.trim() ? c.mDisplayName.trim() : prettify(id);
  const techTier = Number.parseInt(c.mTechTier ?? '0', 10) || 0;

  const unlocks: SchematicUnlocks = {
    recipes: [],
    giveItems: [],
    inventorySlots: 0,
    scannerResources: [],
  };

  const rawUnlocks = Array.isArray(c.mUnlocks) ? c.mUnlocks : [];
  for (const u of rawUnlocks) {
    if (u?.mRecipes) unlocks.recipes.push(...extractClassNames(u.mRecipes));
    if (u?.mResourcesToAddToScanner) unlocks.scannerResources.push(...extractClassNames(u.mResourcesToAddToScanner));
    if (u?.mItemsToGive) unlocks.giveItems.push(...extractItemAmounts(u.mItemsToGive));
    if (u?.mNumInventorySlotsToUnlock) {
      unlocks.inventorySlots += Number.parseInt(u.mNumInventorySlotsToUnlock, 10) || 0;
    }
  }

  index.schematics.set(id, {
    id,
    displayName,
    type: typeof c.mType === 'string' ? c.mType : '',
    techTier,
    unlocks,
    cost: extractItemAmounts(c.mCost),
  });
}

/** Read + decode + parse a docs file from disk into a {@link GameDataIndex}. */
export async function loadDocsFromFile(filePath: string): Promise<GameDataIndex> {
  const buf = await readFile(filePath);
  const text = decodeDocsBuffer(buf);
  const docs = JSON.parse(text);
  const index = buildIndex(docs);
  index.sourcePath = filePath;
  return index;
}

function formatList(prefix: string, names: string[], maxItems: number): string {
  if (names.length <= maxItems) return `${prefix}: ${names.join(', ')}`;
  const shown = names.slice(0, maxItems).join(', ');
  return `${prefix} ${names.length} incl. ${shown}…`;
}

/** Format a numeric amount: integers with thousands separators, drop trailing .0. */
function formatAmount(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return Number(n.toFixed(2)).toString();
}

function prettify(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}
