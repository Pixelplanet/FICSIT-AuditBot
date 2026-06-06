/**
 * Diff two save files and print the human-readable summary to the console.
 * Useful for validating extraction/diff without touching Discord or state.
 *
 *   npm run diff -- "Saves/old.sav" "Saves/new.sav"
 */
import { parseSaveFile } from '../save/parser.js';
import { extractWorldState } from '../extract/index.js';
import { diffWorldStates } from '../diff/compare.js';
import { formatSummary } from '../summary/format.js';
import { discoverDocsPath, setDocsIndex } from '../data/docsProvider.js';
import { loadDocsFromFile } from '../data/docs/index.js';

async function main(): Promise<void> {
  const [, , beforePath, afterPath] = process.argv;
  if (!beforePath || !afterPath) {
    console.error('Usage: npm run diff -- <before.sav> <after.sav>');
    process.exit(1);
  }

  // Optionally enrich names from the game Docs.json (DOCS_PATH or auto-discover).
  const docsPath = await discoverDocsPath(process.env.DOCS_PATH?.trim() || undefined);
  if (docsPath) {
    try {
      setDocsIndex(await loadDocsFromFile(docsPath));
      console.error(`[docs] Loaded game data from ${docsPath}`);
    } catch (err) {
      console.error('[docs] Failed to load:', (err as Error).message);
    }
  }

  const [beforeSave, afterSave] = await Promise.all([
    parseSaveFile(beforePath),
    parseSaveFile(afterPath),
  ]);

  const before = extractWorldState(beforeSave);
  const after = extractWorldState(afterSave);
  const override = Number(process.env.PHASE_COST_MULTIPLIER) || 0;
  const delta = diffWorldStates(before, after, {
    phaseCostMultiplierOverride: override > 0 ? override : undefined,
  });
  const summary = formatSummary(delta);

  console.log(summary.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
