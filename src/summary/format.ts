/**
 * Render a {@link WorldDelta} into human-readable output: a markdown string
 * (for webhook `content` / console) and a Discord embed object (for richer
 * bot/webhook delivery).
 */
import { gamePhaseName } from '../data/gameData.js';
import type { SchematicEntry } from '../model.js';
import type { WorldDelta } from '../diff/compare.js';
import { pickAdaLine } from './ada.js';

export interface SummaryEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface SummaryEmbed {
  title: string;
  description: string;
  color: number;
  fields: SummaryEmbedField[];
  timestamp?: string;
}

export interface SummaryResult {
  /** Markdown text suitable for a webhook `content` or console output. */
  text: string;
  /** Structured embed suitable for Discord. */
  embed: SummaryEmbed;
}

const EMBED_COLOR = 0xfa9549; // Satisfactory orange.
const MAX_LIST_ITEMS = 15;

/** Options controlling how a summary is rendered. */
export interface FormatOptions {
  /**
   * Random source in [0, 1) used to pick the ADA closing remark. Injectable so
   * tests can be deterministic; defaults to {@link Math.random}.
   */
  rng?: () => number;
  /** Set to `false` to omit the ADA closing remark entirely. */
  includeAda?: boolean;
}

export function formatSummary(delta: WorldDelta, options: FormatOptions = {}): SummaryResult {
  const { rng = Math.random, includeAda = true } = options;
  const lines: string[] = [];
  const fields: SummaryEmbedField[] = [];

  const title = `🛠️ Factory Update — ${delta.sessionName}`;

  // --- Time elapsed ---
  const playtime = formatDuration(delta.playtimeDeltaSeconds);
  const totalPlaytime = formatDuration(delta.playtimeAfterSeconds);
  const timeLine = `⏱️ **${playtime}** of factory time passed (total ${totalPlaytime}).`;
  lines.push(timeLine);
  fields.push({ name: '⏱️ Time elapsed', value: `${playtime} (total ${totalPlaytime})` });

  // --- Milestones ---
  const milestones = delta.newSchematics.milestone;
  if (milestones.length > 0) {
    const list = renderSchematicList(milestones);
    lines.push(`\n🏁 **New milestones (${milestones.length})**\n${list}`);
    fields.push({ name: `🏁 New milestones (${milestones.length})`, value: list });
  }

  // --- MAM research ---
  const research = delta.newSchematics.research;
  if (research.length > 0) {
    const list = renderSchematicList(research);
    lines.push(`\n🔬 **New research (${research.length})**\n${list}`);
    fields.push({ name: `🔬 New research (${research.length})`, value: list });
  }

  // --- Alternate recipes ---
  const alts = delta.newSchematics.alternateRecipe;
  if (alts.length > 0) {
    const list = renderSchematicList(alts);
    lines.push(`\n🧪 **New alternate recipes (${alts.length})**\n${list}`);
    fields.push({ name: `🧪 New alternate recipes (${alts.length})`, value: list });
  }

  // --- Game phase / space elevator ---
  const phaseLines = formatPhase(delta);
  if (phaseLines.length > 0) {
    const block = phaseLines.join('\n');
    const heading = delta.phaseProgress
      ? `🚀 Project Assembly — ${delta.phaseProgress.phaseName}`
      : '🚀 Project Assembly';
    lines.push(`\n🚀 **${heading.replace('🚀 ', '')}**\n${block}`);
    fields.push({ name: heading, value: block });
  }

  // --- Power ---
  const powerLines = formatPower(delta);
  if (powerLines.length > 0) {
    const block = powerLines.join('\n');
    lines.push(`\n⚡ **Power**\n${block}`);
    fields.push({ name: '⚡ Power', value: block });
  }

  // --- Logistics ---
  const logisticsDeltas = delta.buildingDeltas.filter((b) => b.category === 'logistics' && b.delta !== 0);
  if (logisticsDeltas.length > 0) {
    const list = renderList(logisticsDeltas.map((b) => `${signed(b.delta)} ${b.name} (now ${b.after})`));
    lines.push(`\n🚆 **Logistics**\n${list}`);
    fields.push({ name: '🚆 Logistics', value: list });
  }

  // --- Production & extraction buildings ---
  const factoryDeltas = delta.buildingDeltas.filter(
    (b) => (b.category === 'production' || b.category === 'extraction') && b.delta !== 0,
  );
  if (factoryDeltas.length > 0) {
    const list = renderList(factoryDeltas.map((b) => `${signed(b.delta)} ${b.name} (now ${b.after})`));
    lines.push(`\n🏭 **Factories**\n${list}`);
    fields.push({ name: '🏭 Factories', value: list });
  }

  // --- Storage ---
  const storageDeltas = delta.buildingDeltas.filter((b) => b.category === 'storage' && b.delta !== 0);
  const storageLines: string[] = [];
  if (storageDeltas.length > 0) {
    storageLines.push(renderList(storageDeltas.map((b) => `${signed(b.delta)} ${b.name} (now ${b.after})`)));
  }

  if (delta.storage.dimensionalDepotUploaders > 0) {
    storageLines.push(
      `• Dimensional Depot Uploaders: **${delta.storage.dimensionalDepotUploaders}**`,
    );
  }
  if (delta.storage.dimensionalDepotItems.length > 0) {
    storageLines.push(
      renderList(
        delta.storage.dimensionalDepotItems.map((item) => `${num(item.amount)}× ${item.name}`),
      ),
    );
  } else if (delta.storage.dimensionalDepotUploaders > 0) {
    storageLines.push('• Dimensional Depot contents: empty / unavailable');
  }

  if (storageLines.length > 0) {
    const block = storageLines.join('\n');
    lines.push(`\n📦 **Storage**\n${block}`);
    fields.push({ name: '📦 Storage', value: block });
  }

  if (delta.isEmpty) {
    const note = 'No new research, milestones or construction since the last save.';
    lines.push(`\n${note}`);
    fields.push({ name: 'No major changes', value: note });
  }

  const description = delta.isEmpty
    ? timeLine
    : `Here's what changed since the last save.\n\n${timeLine}`;

  // ADA's closing remark — tone matched to how much was accomplished.
  const adaLine = includeAda ? pickAdaLine(delta, rng) : undefined;
  if (adaLine) {
    lines.push(`\n> _${adaLine}_\n> — ADA`);
    fields.push({ name: '\u2014 ADA', value: `_${adaLine}_` });
  }

  const embed: SummaryEmbed = {
    title,
    description,
    color: EMBED_COLOR,
    fields,
    timestamp: new Date().toISOString(),
  };

  return { text: `**${title}**\n\n${lines.join('\n')}`, embed };
}

/**
 * Build the power section: any newly built generators, plus a grid-wide snapshot
 * of maximum production vs. maximum consumption so readers can immediately tell
 * whether more power is needed before expanding.
 */
function formatPower(delta: WorldDelta): string[] {
  const out: string[] = [];

  const newGenerators = delta.buildingDeltas.filter((b) => b.category === 'power' && b.delta > 0);
  for (const g of newGenerators) {
    out.push(`• ${signed(g.delta)} ${g.name} (now ${g.after})`);
  }

  const p = delta.power;
  const hasGrid = p.maxProductionAfterMW > 0 || p.maxConsumptionAfterMW > 0;
  if (hasGrid) {
    const prodDelta = p.maxProductionDeltaMW !== 0 ? ` (${signedMW(p.maxProductionDeltaMW)})` : '';
    const consDelta = p.maxConsumptionDeltaMW !== 0 ? ` (${signedMW(p.maxConsumptionDeltaMW)})` : '';
    out.push(`• Max production: **${mw(p.maxProductionAfterMW)}**${prodDelta}`);
    out.push(`• Max consumption: **${mw(p.maxConsumptionAfterMW)}**${consDelta}`);

    const gridNote = p.circuitCount > 1 ? ` _(across ${p.circuitCount} grids)_` : '';
    if (p.balanceAfterMW >= 0) {
      out.push(`• Balance: **+${mw(p.balanceAfterMW)}** ✅ surplus${gridNote}`);
    } else {
      out.push(`• Balance: **${mw(p.balanceAfterMW)}** ⚠️ more power needed${gridNote}`);
    }
  }

  return out;
}

function formatPhase(delta: WorldDelta): string[] {
  const out: string[] = [];
  if (delta.phaseChanged) {
    const after = delta.phaseChanged.after ? gamePhaseName(delta.phaseChanged.after) : '?';
    out.push(`Advanced to **${after}**! 🎉`);
  }
  if (delta.targetPhaseChanged && !delta.phaseChanged) {
    const after = delta.targetPhaseChanged.after ? gamePhaseName(delta.targetPhaseChanged.after) : '?';
    out.push(`Now working toward **${after}**.`);
  }
  for (const d of delta.phaseDeliveryDeltas) {
    if (d.delta > 0) out.push(`Delivered **${signed(d.delta)} ${d.name}**.`);
  }

  // Overview of what's needed and how much has been delivered.
  const progress = delta.phaseProgress;
  const hadActivity = out.length > 0;
  if (progress && hadActivity) {
    const pct = Math.round(progress.fraction * 100);
    const mult = progress.multiplier !== 1 ? ` (×${formatMultiplier(progress.multiplier)} parts cost)` : '';
    out.push(`Progress: **${pct}%**${mult}${progress.complete ? ' ✅ ready to launch' : ''}`);
    for (const part of progress.parts) {
      const done = part.delivered >= part.required ? ' ✅' : '';
      out.push(`• ${part.name}: ${num(part.delivered)} / ${num(part.required)}${done}`);
    }
  }
  return out;
}

function formatMultiplier(n: number): string {
  return Number.isInteger(n) ? n.toString() : Number(n.toFixed(2)).toString();
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format a MW figure with a thousands separator, e.g. `3,504 MW`. */
function mw(n: number): string {
  const rounded = Math.round(n);
  return `${rounded.toLocaleString('en-US')} MW`;
}

/** Format a signed MW delta, e.g. `+300 MW` / `−120 MW`. */
function signedMW(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('en-US')} MW`;
}

function renderList(items: string[]): string {
  const shown = items.slice(0, MAX_LIST_ITEMS).map((i) => `• ${i}`);
  if (items.length > MAX_LIST_ITEMS) {
    shown.push(`…and ${items.length - MAX_LIST_ITEMS} more`);
  }
  return shown.join('\n');
}

/**
 * Render a list of schematics. For each, append what it unlocks (from
 * Docs.json); for alternate recipes the name is followed by the recipe formula;
 * for milestones the build cost is shown too.
 */
function renderSchematicList(schematics: SchematicEntry[]): string {
  return renderList(
    schematics.map((s) => {
      const tier = typeof s.tier === 'number' && s.category === 'milestone' ? ` (T${s.tier})` : '';
      const unlocks = s.unlocks ? ` — ${s.unlocks}` : '';
      const cost = s.category === 'milestone' && s.cost ? ` _(${s.cost})_` : '';
      return `**${s.name}**${tier}${unlocks}${cost}`;
    }),
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Format a duration in seconds as `Xh Ym` (or `Ym` / `Zs` when small). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
