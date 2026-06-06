/**
 * Dump the property structure of the first object matching a class name.
 *
 *   npm run dump -- "Saves/New 1.2 World_continue.sav" BP_SchematicManager_C
 *   npm run dump -- "Saves/New 1.2 World_continue.sav" BP_GamePhaseManager_C
 */
import { allObjects, parseSaveFile } from '../save/parser.js';
import { classNameOf } from '../extract/props.js';

async function main(): Promise<void> {
  const [, , filePath, className, indexArg] = process.argv;
  if (!filePath || !className) {
    console.error('Usage: npm run dump -- <path-to-save> <className> [index]');
    process.exit(1);
  }

  const save = await parseSaveFile(filePath);
  const matches = allObjects(save).filter((o) => classNameOf(o.typePath) === className);
  if (matches.length === 0) {
    console.error(`No objects found with class name "${className}".`);
    process.exit(1);
  }

  const index = indexArg ? Number(indexArg) : 0;
  const obj = matches[index];
  console.log(`Matched ${matches.length} object(s); showing index ${index}.`);
  console.log(`typePath:     ${obj.typePath}`);
  console.log(`instanceName: ${obj.instanceName}`);
  console.log('\n=== Properties ===');
  const props = (obj.properties ?? {}) as Record<string, any>;
  for (const [name, prop] of Object.entries(props)) {
    console.log(`\n# ${name}`);
    console.log(summarize(prop));
  }
}

function summarize(prop: any): string {
  if (Array.isArray(prop)) {
    return `(array of ${prop.length})\n` + prop.map((p) => summarize(p)).join('\n');
  }
  const type = prop?.type ?? typeof prop;
  let detail = '';
  if (prop?.values && Array.isArray(prop.values)) {
    detail = `  values[${prop.values.length}]: ` + JSON.stringify(prop.values.slice(0, 5), bigintReplacer, 0);
  } else if (prop?.value !== undefined) {
    detail = '  value: ' + JSON.stringify(prop.value, bigintReplacer, 0);
  }
  return `  type: ${type}\n${detail}`;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
