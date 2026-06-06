/**
 * Scan a game Docs.json / en-US.json and report what was indexed, plus sample
 * schematic display names + unlocks. Use this to verify the docs path on the
 * server.
 *
 *   npm run docs -- "C:/.../CommunityResources/Docs/Docs.json"
 *   npm run docs -- "C:/.../CommunityResources/Docs/Docs.json" Research_Caterium_3
 */
import { loadDocsFromFile } from '../data/docs/index.js';

async function main(): Promise<void> {
  const [, , docsPath, sampleId] = process.argv;
  if (!docsPath) {
    console.error('Usage: npm run docs -- <path-to-Docs.json> [schematicId]');
    process.exit(1);
  }

  const index = await loadDocsFromFile(docsPath);
  const stats = index.stats();
  console.log(`Loaded from: ${index.sourcePath}`);
  console.log(`Items:       ${stats.items}`);
  console.log(`Recipes:     ${stats.recipes}`);
  console.log(`Schematics:  ${stats.schematics}`);

  if (sampleId) {
    const rec = index.getSchematic(sampleId);
    console.log(`\n=== ${sampleId} ===`);
    if (!rec) {
      console.log('(not found)');
    } else {
      console.log(`Display name: ${rec.displayName}`);
      console.log(`Type:         ${rec.type}`);
      console.log(`Tier:         ${rec.techTier}`);
      console.log(`Unlocks:      ${index.describeUnlocks(sampleId) ?? '(none)'}`);
    }
    return;
  }

  console.log('\n=== Sample schematics ===');
  let shown = 0;
  for (const [id, rec] of index.schematics) {
    if (rec.type === 'EST_Custom') continue;
    const unlocks = index.describeUnlocks(id);
    console.log(`• ${rec.displayName} [${rec.type} T${rec.techTier}]${unlocks ? ' — ' + unlocks : ''}`);
    if (++shown >= 25) break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
