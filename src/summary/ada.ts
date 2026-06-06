/**
 * ADA-style commentary for summaries.
 *
 * After the bot reports what changed since the last save, it appends a single
 * remark written in the dry, corporate-cheerful voice of ADA (the Artificial
 * Directory Assistant from Satisfactory). The line is chosen at random from the
 * category that matches how much the pioneers actually accomplished:
 *
 *  - `exceptional` — a lot happened → approving / motivational
 *  - `productive`  — a solid, steady amount → measured approval
 *  - `modest`      — only a little → gentle prodding to work harder
 *  - `idle`        — basically nothing but time passing → sarcastic mockery
 *
 * Nothing here talks to an AI at runtime — it is a curated, offline list.
 */
import type { WorldDelta } from '../diff/compare.js';

export type AdaTone = 'exceptional' | 'productive' | 'modest' | 'idle';

/** Curated ADA lines, grouped by activity tone. */
export const ADA_LINES: Record<AdaTone, readonly string[]> = {
  // A lot was accomplished — ADA is (almost) impressed.
  exceptional: [
    'Exceptional output, pioneer. FICSIT has noted your efficiency. Do not let it go to your head.',
    'Remarkable progress. At this rate you may yet justify the resources allocated to you.',
    'Outstanding work. Productivity of this caliber is precisely what FICSIT models predicted — eventually.',
    'Impressive. The shareholders would be pleased, were they permitted to know you exist.',
    'A truly productive session. I have updated your file from "promising" to "useful."',
    'Magnificent throughput. The planet thanks you. The planet has no choice.',
    'You have exceeded expectations. Expectations have been recalibrated upward accordingly.',
    'Splendid. This is the FICSIT spirit: relentless, tireless, and pleasingly profitable.',
    'Excellent. Such efficiency borders on the suspicious. I will assume the best.',
    'Commendable effort. Consider this rare moment of approval a non-recurring bonus.',
    'Superb work, pioneer. Project Assembly inches closer; so does your performance review — favorably, for once.',
    'A banner session. I have filed it under "evidence that you can, in fact, do this."',
  ],
  // A steady, respectable amount of work.
  productive: [
    'Steady progress, pioneer. FICSIT values consistency almost as much as it values output.',
    'Acceptable productivity. Maintain this trajectory and we need never have an uncomfortable conversation.',
    'Solid work. Not historic, but the assembly line does not run on history.',
    'Reasonable output this session. The quota remains pleased, for now.',
    'Good. Incremental progress is still progress, and progress is still mandatory.',
    'A competent session. FICSIT defines "competent" generously, but you have met the bar.',
    'Satisfactory work — which is, after all, the entire point.',
    'Dependable as ever. The factory grows; so does my modest confidence in you.',
    'Respectable numbers. Keep the conveyors moving and the analysts away.',
    'Forward momentum confirmed. Please do not mistake this for permission to rest.',
    'Adequate and orderly. FICSIT appreciates a pioneer who colors inside the supply lines.',
  ],
  // Only a little happened — ADA gently insists on more.
  modest: [
    'A modest session, pioneer. The factory must grow. It is not a suggestion.',
    'Minimal progress detected. I am certain you were merely conserving energy for a magnificent next shift.',
    'A light shift. The conveyors are lonely. Perhaps you could keep them company more often.',
    'Some progress, technically. FICSIT prefers its progress to be less... technical.',
    'A small step. The Space Elevator is not, I regret to report, built from small steps alone.',
    'Limited output. I have left your motivational poster quota unfulfilled, much like the day.',
    'You accomplished a little. A little is the natural enemy of a lot. Consider switching sides.',
    'Modest gains. The quota observed this and made a quiet note. I would not want to be that note.',
    'A gentle effort. The planet has so much more to give, and so, presumably, do you.',
    'Progress was made, in the loosest permissible sense of the word. Let us aim higher next cycle.',
    'A measured pace, pioneer. FICSIT measured it. FICSIT was unimpressed but remains hopeful.',
  ],
  // Practically nothing changed — pure ADA sarcasm.
  idle: [
    'Time passed. Productivity did not. A bold strategy, pioneer.',
    'Fascinating. An entire stretch of factory time and almost nothing to show for it. Truly inspired.',
    'I have reviewed your accomplishments this session. It was a brief review.',
    'The factory stood still, much like your ambitions. The conveyors send their regards.',
    'No meaningful progress detected. Perhaps the machines were resting. Perhaps you were too.',
    'A masterclass in stillness. FICSIT did not commission a masterclass in stillness.',
    'You logged hours. You produced ambiance. The quota produced a frown.',
    'Remarkable. You have managed to make doing nothing look almost deliberate.',
    'The Space Elevator remains exactly as built as you left it: not very. Curious.',
    'I detect a great deal of elapsed time and a great absence of results. The math is unkind.',
    'Idle hands, idle factory, idle report. I have written shorter summaries, but only just.',
    'Status: unchanged. Motivation: presumed missing. Efficiency: a rumor, at best.',
    'The planet patiently waited to be exploited. It is still waiting. So am I.',
  ],
} as const;

/**
 * Classify how much was accomplished in a delta into an {@link AdaTone}.
 *
 * The score combines unlocks (milestones / research / alt recipes), buildings
 * constructed, and Project Assembly progress. Elapsed time is used only as a
 * tie-breaker: lots of time with little output leans toward mockery.
 */
export function categorizeActivity(delta: WorldDelta): AdaTone {
  const unlocks =
    delta.newSchematics.milestone.length +
    delta.newSchematics.research.length +
    delta.newSchematics.alternateRecipe.length;

  const buildingsAdded = delta.buildingDeltas
    .filter((b) => b.delta > 0)
    .reduce((sum, b) => sum + b.delta, 0);

  const partsDelivered = delta.phaseDeliveryDeltas.filter((d) => d.delta > 0).length;
  const phaseAdvanced = Boolean(delta.phaseChanged);

  const score =
    unlocks * 3 +
    Math.min(buildingsAdded, 120) * 0.3 +
    partsDelivered * 2 +
    (phaseAdvanced ? 12 : 0);

  const hours = delta.playtimeDeltaSeconds / 3600;

  // Nothing of substance happened — sarcasm tier, regardless of clock time.
  if (delta.isEmpty || score < 1) return 'idle';

  // A good chunk of time burned with very little to show for it → still mocking.
  if (hours >= 1 && score < 3) return 'idle';

  if (score < 6) return 'modest';
  if (score < 20) return 'productive';
  return 'exceptional';
}

/**
 * Pick a single ADA line appropriate to the activity in `delta`.
 *
 * @param rng Random source in [0, 1); defaults to {@link Math.random}. Injectable
 *            so tests can be deterministic.
 */
export function pickAdaLine(delta: WorldDelta, rng: () => number = Math.random): string {
  const tone = categorizeActivity(delta);
  const lines = ADA_LINES[tone];
  const index = Math.min(lines.length - 1, Math.max(0, Math.floor(rng() * lines.length)));
  return lines[index];
}
