/**
 * Inspection tool: parse a save file and print its header plus a breakdown of
 * object class names. Use this to discover the real type paths used by the game
 * version of a given save.
 *
 *   npm run inspect -- "Saves/New 1.2 World_continue.sav"
 *   npm run inspect -- "Saves/New 1.2 World_continue.sav" schematic
 */
import { allObjects, parseSaveFile } from '../save/parser.js';
import { classNameOf } from '../extract/props.js';

async function main(): Promise<void> {
  const [, , filePath, filter] = process.argv;
  if (!filePath) {
    console.error('Usage: npm run inspect -- <path-to-save> [classNameFilter]');
    process.exit(1);
  }

  const save = await parseSaveFile(filePath);
  const h = save.header;
  const objects = allObjects(save);

  console.log('=== Header ===');
  console.log(`Session name:   ${h.sessionName}`);
  console.log(`Build version:  ${h.buildVersion}`);
  console.log(`Save version:   ${h.saveVersion}`);
  console.log(`Play duration:  ${formatDuration(h.playDurationSeconds)} (${h.playDurationSeconds}s)`);
  console.log(`Save datetime:  ${h.saveDateTime}`);
  console.log(`Total objects:  ${objects.length}`);

  const counts = new Map<string, number>();
  for (const obj of objects) {
    const name = classNameOf(obj.typePath);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const needle = filter?.toLowerCase();

  console.log('\n=== Class counts ===');
  for (const [name, count] of sorted) {
    if (needle && !name.toLowerCase().includes(needle)) continue;
    console.log(`${String(count).padStart(6)}  ${name}`);
  }
}

function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
