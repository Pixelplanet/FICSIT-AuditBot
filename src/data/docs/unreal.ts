/**
 * Helpers for the Unreal-engine "stringified" values used throughout Docs.json,
 * plus encoding detection for the docs file itself.
 *
 * The game does not emit clean JSON for nested values; instead fields like
 * `mRecipes`, `mProduct` and `mItemsToGive` contain Unreal's text serialization,
 * e.g.:
 *   mRecipes      = ("/Game/.../Recipe_IronPlate.Recipe_IronPlate_C","/Game/...")
 *   mItemsToGive  = ((ItemClass="/Game/.../Desc_X.Desc_X_C",Amount=10))
 *
 * We only need class names and amounts, so we extract them with tolerant
 * regexes rather than a full parser.
 */

/** Strip a class path/name down to its short name without a trailing `_C`. */
export function shortClassName(pathOrName: string): string {
  const afterDot = pathOrName.includes('.')
    ? pathOrName.slice(pathOrName.lastIndexOf('.') + 1)
    : pathOrName;
  return afterDot.replace(/'/g, '').replace(/"/g, '').replace(/_C$/, '').trim();
}

/**
 * Extract the short class names (without `_C`) of every `*_C` token in an
 * Unreal stringified value. Used for recipe/scanner-resource lists.
 */
export function extractClassNames(value: string | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  const re = /\.([A-Za-z0-9_]+)_C\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    out.push(m[1]);
  }
  // Fallback: bare `Something_C` not preceded by a dot (rare).
  if (out.length === 0) {
    const re2 = /\b([A-Za-z0-9_]+)_C\b/g;
    while ((m = re2.exec(value)) !== null) out.push(m[1]);
  }
  return out;
}

export interface ParsedItemAmount {
  /** Short item class name without `_C`. */
  itemId: string;
  amount: number;
}

/**
 * Extract `{ItemClass, Amount}` pairs from an Unreal struct-array string such
 * as `mCost`, `mProduct` or `mItemsToGive`.
 */
export function extractItemAmounts(value: string | undefined): ParsedItemAmount[] {
  if (!value) return [];
  const out: ParsedItemAmount[] = [];
  const re = /ItemClass=[^,]*?\.([A-Za-z0-9_]+)_C[^,]*?,\s*Amount=([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    out.push({ itemId: m[1], amount: Number(m[2]) });
  }
  return out;
}

/**
 * Decode a docs file buffer to a string, detecting UTF-16LE (`Docs.json`) vs
 * UTF-8 (`en-US.json`, 1.0+) and stripping any byte-order mark.
 */
export function decodeDocsBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return stripBom(buf.subarray(2).toString('utf16le'));
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return stripBom(buf.subarray(3).toString('utf8'));
  }
  // Heuristic: lots of NUL bytes in the first KB => UTF-16LE without BOM.
  const sample = Math.min(buf.length, 1024);
  let nulls = 0;
  for (let i = 0; i < sample; i++) if (buf[i] === 0) nulls++;
  if (sample > 0 && nulls > sample / 4) {
    return stripBom(buf.toString('utf16le'));
  }
  return stripBom(buf.toString('utf8'));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
