import { describe, expect, it } from 'vitest';
import { extractBuildings } from '../src/extract/buildings.js';

describe('raw dimensional depot fallback', () => {
  it('decodes ItemAmounts entries from decompressed save body bytes', () => {
    const body = buildRawBody([
      { itemId: 'Desc_Wire', amount: 324 },
      { itemId: 'Desc_IronPlate', amount: 98 },
      { itemId: 'Desc_Rotor', amount: 33 },
    ]);

    const { storage } = extractBuildings([], body);
    expect(storage.dimensionalDepotItems).toEqual([
      { itemId: 'Desc_Wire', name: 'Wire', amount: 324 },
      { itemId: 'Desc_IronPlate', name: 'IronPlate', amount: 98 },
      { itemId: 'Desc_Rotor', name: 'Rotor', amount: 33 },
    ]);
  });

  it('keeps the largest amount when an item appears repeatedly in one block', () => {
    const body = buildRawBody([
      { itemId: 'Desc_Wire', amount: 15 },
      { itemId: 'Desc_Wire', amount: 420 },
      { itemId: 'Desc_Wire', amount: 120 },
    ]);

    const { storage } = extractBuildings([], body);
    expect(storage.dimensionalDepotItems).toEqual([
      { itemId: 'Desc_Wire', name: 'Wire', amount: 420 },
    ]);
  });
});

function buildRawBody(entries: { itemId: string; amount: number }[]): Uint8Array {
  const chunks: Buffer[] = [Buffer.from('prefix ItemAmounts MapProperty ', 'latin1')];

  for (const entry of entries) {
    const path = pathFor(entry.itemId);
    chunks.push(Buffer.from(path + '\0', 'latin1'));

    const amount = Buffer.alloc(4);
    amount.writeInt32LE(entry.amount);
    chunks.push(amount);

    chunks.push(Buffer.from(' ', 'latin1'));
  }

  return new Uint8Array(Buffer.concat(chunks));
}

function pathFor(itemId: string): string {
  const suffix = itemId.replace(/^Desc_/, '');
  return `/Game/FactoryGame/Resource/Parts/${suffix}/${itemId}.${itemId}_C`;
}
