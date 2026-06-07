import { allObjects, parseSaveFile } from '../save/parser.js';
import { classNameOf } from '../extract/props.js';

const save = await parseSaveFile(process.argv[2]);
const objects = allObjects(save);

let prod = 0;
let cons = 0;
let prodN = 0;
let consN = 0;
const sampleProd: number[] = [];
const sampleCons: number[] = [];

for (const o of objects) {
  if (classNameOf(o.typePath) !== 'FGPowerInfoComponent') continue;
  const p = (o.properties ?? {}) as Record<string, any>;
  const cap = p.mDynamicProductionCapacity?.value;
  const tc = p.mTargetConsumption?.value;
  if (typeof cap === 'number' && cap > 0) {
    prod += cap;
    prodN++;
    if (sampleProd.length < 12) sampleProd.push(cap);
  }
  if (typeof tc === 'number' && tc > 0) {
    cons += tc;
    consN++;
    if (sampleCons.length < 20) sampleCons.push(tc);
  }
}

console.log('Production capacity entries:', prodN, 'sum MW =', prod.toFixed(1));
console.log('  samples:', sampleProd.map((n) => n.toFixed(1)).join(', '));
console.log('Consumption entries:', consN, 'sum MW =', cons.toFixed(1));
console.log('  samples:', sampleCons.map((n) => n.toFixed(2)).join(', '));

let producing = 0;
let totalGen = 0;
for (const o of objects) {
  const cls = classNameOf(o.typePath);
  if (!/^Build_Generator/.test(cls)) continue;
  totalGen++;
  const p = (o.properties ?? {}) as Record<string, any>;
  if (p.mIsProducing?.value) producing++;
}
console.log(`Generators: ${totalGen}, producing now: ${producing}`);
