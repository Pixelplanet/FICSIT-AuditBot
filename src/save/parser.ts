import { readFile } from 'node:fs/promises';
import {
  Parser,
  type SatisfactorySave,
  type SaveComponent,
  type SaveEntity,
} from '@etothepii/satisfactory-file-parser';

/** A parsed save object can be either a placed entity or an attached component. */
export type SaveObject = SaveEntity | SaveComponent;

/**
 * Parse a Satisfactory `.sav` file from disk into the parser's JSON structure.
 * Uses `throwErrors: false` so partially-unparseable data is tolerated rather
 * than aborting the whole read.
 */
export async function parseSaveFile(filePath: string): Promise<SatisfactorySave> {
  const buffer = await readFile(filePath);
  // Pass a real ArrayBuffer slice (avoids issues when Buffer is pooled).
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return Parser.ParseSave(filePath, arrayBuffer, { throwErrors: false });
}

/** Flatten every level into a single list of save objects. */
export function allObjects(save: SatisfactorySave): SaveObject[] {
  return Object.values(save.levels).flatMap((level) => level.objects);
}
