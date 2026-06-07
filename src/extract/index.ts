/**
 * Top-level extractor: turn a parsed save into a normalized {@link WorldState}.
 */
import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import { allObjects } from '../save/parser.js';
import { WORLD_STATE_SCHEMA_VERSION, type WorldState } from '../model.js';
import { extractHeader } from './header.js';
import { extractSchematics } from './schematics.js';
import { extractGamePhase } from './gamePhase.js';
import { extractBuildings } from './buildings.js';

export function extractWorldState(save: SatisfactorySave): WorldState {
  const objects = allObjects(save);

  const header = extractHeader(save);
  const { schematics, activeSchematicId } = extractSchematics(objects);
  const gamePhase = extractGamePhase(objects);
  const { buildings, power, logistics, storage } = extractBuildings(objects);

  return {
    schemaVersion: WORLD_STATE_SCHEMA_VERSION,
    saveName: header.saveName,
    sessionName: header.sessionName,
    buildVersion: header.buildVersion,
    playDurationSeconds: header.playDurationSeconds,
    saveTimestampMs: header.saveTimestampMs,
    totalObjects: objects.length,
    schematics,
    activeSchematicId,
    gamePhase,
    power,
    logistics,
    storage,
    buildings,
  };
}
