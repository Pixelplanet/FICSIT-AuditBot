/**
 * Extract the project-assembly (space elevator) game phase and the amounts
 * delivered toward the next phase.
 */
import type { SaveObject } from '../save/parser.js';
import type { GamePhaseState, ItemAmount } from '../model.js';
import { classNameOf, getNumber, getObjectRefPath, getProperty } from './props.js';
import { itemName, shortId } from '../data/gameData.js';

const GAME_PHASE_MANAGER_CLASS = 'BP_GamePhaseManager_C';
const GAME_STATE_CLASS = 'BP_GameState_C';

export function extractGamePhase(objects: SaveObject[]): GamePhaseState {
  // The space-parts cost multiplier lives on the game state, not the phase
  // manager. It scales every project-assembly part requirement (e.g. 2x).
  const gameState = objects.find((o) => classNameOf(o.typePath) === GAME_STATE_CLASS);
  const partsCostMultiplier = gameState ? getNumber(gameState, 'mSpacePartsCostMultiplier') : undefined;

  const manager = objects.find((o) => classNameOf(o.typePath) === GAME_PHASE_MANAGER_CLASS);
  if (!manager) {
    return { deliveredToTarget: [], partsCostMultiplier };
  }

  const currentPath = getObjectRefPath(manager, 'mCurrentGamePhase');
  const targetPath = getObjectRefPath(manager, 'mTargetGamePhase');

  return {
    currentPhase: currentPath ? shortId(currentPath) : undefined,
    targetPhase: targetPath ? shortId(targetPath) : undefined,
    deliveredToTarget: extractItemAmounts(manager),
    partsCostMultiplier,
  };
}

/** Read the `mTargetGamePhasePaidOffCosts` array of ItemAmount structs. */
function extractItemAmounts(manager: SaveObject): ItemAmount[] {
  const prop = getProperty(manager, 'mTargetGamePhasePaidOffCosts');
  const values = Array.isArray(prop?.values) ? prop.values : [];
  const result: ItemAmount[] = [];

  for (const entry of values) {
    const props = entry?.properties ?? {};
    const itemPath: string | undefined = props?.ItemClass?.value?.pathName;
    const amount: number | undefined = props?.Amount?.value;
    if (typeof itemPath === 'string' && typeof amount === 'number') {
      const itemId = shortId(itemPath);
      result.push({ itemId, name: itemName(itemId), amount });
    }
  }
  return result;
}
