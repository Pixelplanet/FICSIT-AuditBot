/**
 * Small helpers for digging values out of the parser's generic property maps.
 * The parser does not interpret game semantics, so we navigate the property
 * tree defensively and tolerate missing/renamed fields.
 */
import type { SaveObject } from '../save/parser.js';

/** The short class name, e.g. `Build_TrainStation_C` from a full type path. */
export function classNameOf(typePath: string): string {
  const lastDot = typePath.lastIndexOf('.');
  return lastDot >= 0 ? typePath.slice(lastDot + 1) : typePath;
}

/** Read a single named property object from a save object, if present. */
export function getProperty(obj: SaveObject, name: string): any | undefined {
  const props = obj.properties as Record<string, any> | undefined;
  return props ? props[name] : undefined;
}

/** Read a numeric property value (Int/Float/Double/etc.). */
export function getNumber(obj: SaveObject, name: string): number | undefined {
  const prop = getProperty(obj, name);
  const value = prop?.value;
  return typeof value === 'number' ? value : undefined;
}

/** Read a string-ish property value (Str/Name/Text). */
export function getString(obj: SaveObject, name: string): string | undefined {
  const prop = getProperty(obj, name);
  const value = prop?.value;
  if (typeof value === 'string') return value;
  // TextProperty stores its readable text under value.value in some versions.
  if (value && typeof value.value === 'string') return value.value;
  return undefined;
}

/** Read a boolean property value. */
export function getBoolean(obj: SaveObject, name: string): boolean | undefined {
  const prop = getProperty(obj, name);
  const value = prop?.value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return undefined;
}

/**
 * Read the `pathName` of an ObjectProperty / reference-typed property value.
 * Returns undefined if the property is missing or not a reference.
 */
export function getObjectRefPath(obj: SaveObject, name: string): string | undefined {
  const prop = getProperty(obj, name);
  const value = prop?.value;
  return typeof value?.pathName === 'string' ? value.pathName : undefined;
}

/**
 * Read an ArrayProperty's `values`, returning the raw array entries.
 * Returns an empty array if the property is missing.
 */
export function getArrayValues(obj: SaveObject, name: string): any[] {
  const prop = getProperty(obj, name);
  return Array.isArray(prop?.values) ? prop.values : [];
}

/**
 * Extract `pathName` strings from an array property whose entries are object
 * references (each entry being `{ value: { pathName } }` or `{ pathName }`).
 */
export function getRefPathsFromArray(obj: SaveObject, name: string): string[] {
  const paths: string[] = [];
  for (const entry of getArrayValues(obj, name)) {
    const pathName = entry?.value?.pathName ?? entry?.pathName;
    if (typeof pathName === 'string' && pathName.length > 0) {
      paths.push(pathName);
    }
  }
  return paths;
}
