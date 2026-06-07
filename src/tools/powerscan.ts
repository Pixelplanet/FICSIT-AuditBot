import { parseSaveFile } from '../save/parser.js';
import { extractWorldState } from '../extract/index.js';

const save = await parseSaveFile(process.argv[2]);
const world = extractWorldState(save);

console.log('Production capacity entries:', world.power.generators.reduce((n, g) => n + g.count, 0));
console.log('Production MW =', world.power.maxProductionMW.toFixed(1));
console.log('Consumption MW =', world.power.maxConsumptionMW.toFixed(1));
console.log('Circuits =', world.power.circuitCount);
console.log('Generators:');
for (const generator of world.power.generators) {
  console.log(`  ${generator.name}: ${generator.count}`);
}
