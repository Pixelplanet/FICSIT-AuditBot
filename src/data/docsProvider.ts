/**
 * Module-level holder for the optional {@link GameDataIndex} parsed from the
 * game's Docs.json. Extractors/formatters consult this through the synchronous
 * accessors here so their signatures stay simple; the runtime loads/swaps the
 * index at startup and when the docs path changes.
 *
 * Also provides auto-discovery of common Docs.json locations.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameDataIndex } from './docs/index.js';

let current: GameDataIndex | undefined;

export function setDocsIndex(index: GameDataIndex | undefined): void {
  current = index;
}

export function getDocsIndex(): GameDataIndex | undefined {
  return current;
}

export function hasDocs(): boolean {
  return current !== undefined;
}

/** Candidate Docs file locations relative to a Satisfactory install root. */
const DOCS_RELATIVE_PATHS = [
  join('CommunityResources', 'Docs', 'Docs.json'),
  join('CommunityResources', 'Docs', 'en-US.json'),
  join('CommunityResources', 'Docs.json'),
];

/** Bare docs file names to probe directly inside a configured directory. */
const DOCS_FILE_NAMES = ['Docs.json', 'en-US.json'];

/** Common Satisfactory install roots to probe when no path is configured. */
const COMMON_INSTALL_ROOTS = [
  'C:\\Program Files\\Epic Games\\SatisfactoryEarlyAccess',
  'C:\\Program Files\\Epic Games\\Satisfactory',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Satisfactory',
  'C:\\Program Files\\Steam\\steamapps\\common\\Satisfactory',
  // Dedicated server (Linux container) typical locations.
  '/config/gamefiles/FactoryGame',
  '/home/steam/SatisfactoryDedicatedServer',
  '/opt/satisfactory/config/gamefiles/FactoryGame',
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a Docs file: if `configuredPath` is a direct file, use it; if it is a
 * directory or install root, probe known sub-paths; otherwise scan common
 * install roots. Returns the first existing path, or undefined.
 */
export async function discoverDocsPath(configuredPath?: string): Promise<string | undefined> {
  if (configuredPath) {
    if (await exists(configuredPath)) {
      // Direct file.
      if (configuredPath.toLowerCase().endsWith('.json')) return configuredPath;
      // Directory or install root: probe bare file names, then known sub-paths.
      for (const name of DOCS_FILE_NAMES) {
        const candidate = join(configuredPath, name);
        if (await exists(candidate)) return candidate;
      }
      for (const rel of DOCS_RELATIVE_PATHS) {
        const candidate = join(configuredPath, rel);
        if (await exists(candidate)) return candidate;
      }
      return undefined;
    }
    return undefined;
  }

  for (const root of COMMON_INSTALL_ROOTS) {
    for (const rel of DOCS_RELATIVE_PATHS) {
      const candidate = join(root, rel);
      if (await exists(candidate)) return candidate;
    }
  }
  return undefined;
}
