/**
 * Print the full list of purchased schematic path names, grouped by their
 * progression category, plus the game phase. Helps map schematic paths to
 * milestones vs MAM research vs other.
 *
 *   npm run schematics -- "Saves/New 1.2 World_continue.sav"
 */
import { allObjects, parseSaveFile } from '../save/parser.js';
import { classNameOf, getObjectRefPath, getRefPathsFromArray } from '../extract/props.js';

async function main(): Promise<void> {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: npm run schematics -- <path-to-save>');
    process.exit(1);
  }

  const save = await parseSaveFile(filePath);
  const objects = allObjects(save);

  const manager = objects.find((o) => classNameOf(o.typePath) === 'BP_SchematicManager_C');
  if (!manager) {
    console.error('No schematic manager found.');
    process.exit(1);
  }

  const purchased = getRefPathsFromArray(manager, 'mPurchasedSchematics');
  const active = getObjectRefPath(manager, 'mActiveSchematic');

  // Group by the folder segment after /Schematics/.
  const groups = new Map<string, string[]>();
  for (const path of purchased) {
    const m = path.match(/\/Schematics\/([^/]+)\//);
    const group = m ? m[1] : '(root)';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(shortName(path));
  }

  console.log(`Total purchased schematics: ${purchased.length}`);
  console.log(`Active schematic: ${active ? shortName(active) : '(none)'}`);
  for (const [group, names] of [...groups.entries()].sort()) {
    console.log(`\n## ${group} (${names.length})`);
    for (const name of names.sort()) console.log(`  ${name}`);
  }

  const phase = objects.find((o) => classNameOf(o.typePath) === 'BP_GamePhaseManager_C');
  if (phase) {
    console.log('\n=== Game phase manager properties ===');
    for (const [name, prop] of Object.entries((phase.properties ?? {}) as Record<string, any>)) {
      const value = (prop as any)?.value ?? (prop as any)?.values;
      console.log(`  ${name}: ${JSON.stringify(value, bigintReplacer)}`);
    }
  }
}

function shortName(path: string): string {
  const cls = classNameOf(path);
  return cls.replace(/_C$/, '');
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
