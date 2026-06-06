/**
 * Extract purchased schematics (milestones, MAM research, alternate recipes,
 * etc.) and the currently active milestone from the schematic manager.
 */
import type { SaveObject } from '../save/parser.js';
import type { SchematicEntry } from '../model.js';
import { classNameOf, getObjectRefPath, getRefPathsFromArray } from './props.js';
import {
  classifySchematic,
  schematicCostText,
  schematicName,
  schematicTier,
  schematicUnlocks,
  shortId,
} from '../data/gameData.js';

const SCHEMATIC_MANAGER_CLASS = 'BP_SchematicManager_C';

export interface SchematicsInfo {
  schematics: SchematicEntry[];
  activeSchematicId?: string;
}

export function extractSchematics(objects: SaveObject[]): SchematicsInfo {
  const manager = objects.find((o) => classNameOf(o.typePath) === SCHEMATIC_MANAGER_CLASS);
  if (!manager) {
    return { schematics: [] };
  }

  const paths = getRefPathsFromArray(manager, 'mPurchasedSchematics');
  const schematics: SchematicEntry[] = paths.map((path) => {
    const id = shortId(path);
    const category = classifySchematic(path);
    return {
      id,
      path,
      category,
      name: schematicName(id, category),
      tier: schematicTier(id),
      unlocks: schematicUnlocks(id),
      cost: schematicCostText(id),
    };
  });

  const activePath = getObjectRefPath(manager, 'mActiveSchematic');
  const activeSchematicId = activePath ? shortId(activePath) : undefined;

  return { schematics, activeSchematicId };
}
