/**
 * Application configuration.
 *
 * Configuration is layered: environment variables (.env) provide the defaults,
 * and a persisted overrides file (`<stateDir>/config.json`, edited via the web
 * UI) takes precedence for the editable fields. {@link ConfigManager} merges the
 * two, persists UI changes, and notifies listeners when settings change so the
 * runtime can react (e.g. restart the watcher).
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface DiscordConfig {
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
}

export interface ServerApiConfig {
  /** Base API endpoint, e.g. https://127.0.0.1:7777/api/v1 */
  url?: string;
  /** Bearer token generated via server.GenerateAPIToken */
  token?: string;
  /** Allow self-signed TLS certificates. */
  allowInsecureTls: boolean;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

/** Settings that can be edited at runtime via the web UI. */
export interface EditableSettings {
  /** Absolute path to the folder containing save files. */
  savesDir: string;
  /** Suffix identifying the canonical (non-autosave) save, e.g. `_continue.sav`. */
  canonicalSaveSuffix: string;
  /**
   * Dedicated-server mode: when > 0, treat saves that are off the autosave
   * cadence as "player/disconnect" saves and prefer those as the tracked save.
   * 0 disables this behavior.
   */
  autosaveIntervalMinutes: number;
  /** Allowed timing drift (seconds) when matching the autosave cadence. */
  autosaveTimeToleranceSeconds: number;
  /** Path to the game's Docs.json / en-US.json (file, dir, or install root). Blank = auto-discover. */
  docsPath?: string;
  /** Whether to actually post to Discord (vs. console/preview only). */
  postToDiscord: boolean;
  /** Skip posting when only elapsed time changed. */
  skipEmptySummaries: boolean;
  /** Debounce window after a save write before processing (ms). */
  watchDebounceMs: number;
  /**
   * Override for the Space Elevator parts cost multiplier. 0 = auto-detect from
   * the save (`mSpacePartsCostMultiplier`); a positive value forces that factor.
   */
  phaseCostMultiplier: number;
  /** Use filesystem polling (more reliable across Docker bind mounts). */
  watchUsePolling: boolean;
  /** Enable the configuration/preview web UI. */
  webEnabled: boolean;
  /** Port the web UI listens on. */
  webPort: number;
  discord: DiscordConfig;
  serverApi: ServerApiConfig;
}

export interface AppConfig extends EditableSettings {
  /** Absolute path to the state directory (snapshots + db.json + config.json). */
  stateDir: string;
}

/** The web-safe view of config: secrets are replaced with boolean flags. */
export interface PublicConfig {
  savesDir: string;
  canonicalSaveSuffix: string;
  autosaveIntervalMinutes: number;
  autosaveTimeToleranceSeconds: number;
  docsPath?: string;
  stateDir: string;
  postToDiscord: boolean;
  skipEmptySummaries: boolean;
  watchDebounceMs: number;
  phaseCostMultiplier: number;
  watchUsePolling: boolean;
  webEnabled: boolean;
  webPort: number;
  serverApi: {
    url?: string;
    tokenSet: boolean;
    allowInsecureTls: boolean;
    timeoutMs: number;
  };
  discord: {
    webhookUrlSet: boolean;
    botTokenSet: boolean;
    channelId?: string;
  };
}

/** A patch from the web UI. `null` for a secret means "clear it". */
export interface SettingsPatch {
  savesDir?: string;
  canonicalSaveSuffix?: string;
  autosaveIntervalMinutes?: number;
  autosaveTimeToleranceSeconds?: number;
  docsPath?: string;
  postToDiscord?: boolean;
  skipEmptySummaries?: boolean;
  watchDebounceMs?: number;
  phaseCostMultiplier?: number;
  watchUsePolling?: boolean;
  webEnabled?: boolean;
  webPort?: number;
  serverApi?: {
    url?: string;
    token?: string | null;
    allowInsecureTls?: boolean;
    timeoutMs?: number;
  };
  discord?: {
    webhookUrl?: string | null;
    botToken?: string | null;
    channelId?: string | null;
  };
}

export type ConfigChangeListener = (config: AppConfig, changed: Set<string>) => void;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the optional shared data root (`DATA_DIR`). When set, the state and
 * docs directories default to subfolders of it, so a deployment only needs a
 * single volume mounted at this path (plus a bind for the saves folder).
 */
function dataRoot(): string | undefined {
  const d = process.env.DATA_DIR?.trim();
  return d ? resolve(d) : undefined;
}

/**
 * Resolve the state directory. Explicit `STATE_DIR` wins; otherwise it is the
 * `state/` subfolder of `DATA_DIR` when set; otherwise `./state`.
 */
function resolveStateDir(): string {
  const explicit = process.env.STATE_DIR?.trim();
  if (explicit) return resolve(explicit);
  const data = dataRoot();
  return data ? join(data, 'state') : resolve('./state');
}

/**
 * Resolve the default docs path. Explicit `DOCS_PATH` wins; otherwise the
 * `docs/` subfolder of `DATA_DIR` when set; otherwise undefined (auto-discover).
 */
function resolveDocsPath(): string | undefined {
  const explicit = optional(process.env.DOCS_PATH);
  if (explicit) return explicit;
  const data = dataRoot();
  return data ? join(data, 'docs') : undefined;
}

/** Build the env-based default editable settings. */
function envDefaults(): EditableSettings {
  return {
    savesDir: resolve(process.env.SAVES_DIR?.trim() || './Saves'),
    canonicalSaveSuffix: process.env.CANONICAL_SAVE_SUFFIX?.trim() || '_continue.sav',
    autosaveIntervalMinutes: int(process.env.AUTOSAVE_INTERVAL_MINUTES, 0),
    autosaveTimeToleranceSeconds: int(process.env.AUTOSAVE_TIME_TOLERANCE_SECONDS, 2),
    docsPath: resolveDocsPath(),
    postToDiscord: bool(process.env.POST_TO_DISCORD, false),
    skipEmptySummaries: bool(process.env.SKIP_EMPTY_SUMMARIES, true),
    watchDebounceMs: int(process.env.WATCH_DEBOUNCE_MS, 5000),
    phaseCostMultiplier: int(process.env.PHASE_COST_MULTIPLIER, 0),
    watchUsePolling: bool(process.env.WATCH_USE_POLLING, false),
    webEnabled: bool(process.env.WEB_ENABLED, true),
    webPort: int(process.env.WEB_PORT, 8080),
    serverApi: {
      url: optional(process.env.SERVER_API_URL),
      token: optional(process.env.SERVER_API_TOKEN),
      allowInsecureTls: bool(process.env.SERVER_API_ALLOW_INSECURE_TLS, true),
      timeoutMs: int(process.env.SERVER_API_TIMEOUT_MS, 5000),
    },
    discord: {
      webhookUrl: optional(process.env.DISCORD_WEBHOOK_URL),
      botToken: optional(process.env.DISCORD_BOT_TOKEN),
      channelId: optional(process.env.DISCORD_CHANNEL_ID),
    },
  };
}

export class ConfigManager {
  private readonly stateDir: string;
  private readonly overridesPath: string;
  private settings: EditableSettings;
  private readonly listeners: ConfigChangeListener[] = [];

  constructor() {
    this.stateDir = resolveStateDir();
    this.overridesPath = join(this.stateDir, 'config.json');
    this.settings = envDefaults();
  }

  /** Load persisted overrides (if any) on top of the env defaults. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.overridesPath, 'utf8');
      const saved = JSON.parse(raw) as Partial<EditableSettings>;
      this.settings = mergeSettings(this.settings, saved);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.warn('[config] Could not read overrides:', err);
      }
    }
  }

  get(): AppConfig {
    return { ...this.settings, stateDir: this.stateDir };
  }

  getPublic(): PublicConfig {
    const s = this.settings;
    return {
      savesDir: s.savesDir,
      canonicalSaveSuffix: s.canonicalSaveSuffix,
      autosaveIntervalMinutes: s.autosaveIntervalMinutes,
      autosaveTimeToleranceSeconds: s.autosaveTimeToleranceSeconds,
      docsPath: s.docsPath,
      stateDir: this.stateDir,
      postToDiscord: s.postToDiscord,
      skipEmptySummaries: s.skipEmptySummaries,
      watchDebounceMs: s.watchDebounceMs,
      phaseCostMultiplier: s.phaseCostMultiplier,
      watchUsePolling: s.watchUsePolling,
      webEnabled: s.webEnabled,
      webPort: s.webPort,
      serverApi: {
        url: s.serverApi.url,
        tokenSet: Boolean(s.serverApi.token),
        allowInsecureTls: s.serverApi.allowInsecureTls,
        timeoutMs: s.serverApi.timeoutMs,
      },
      discord: {
        webhookUrlSet: Boolean(s.discord.webhookUrl),
        botTokenSet: Boolean(s.discord.botToken),
        channelId: s.discord.channelId,
      },
    };
  }

  onChange(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  /** Apply a patch from the UI, persist it, and notify listeners. */
  async update(patch: SettingsPatch): Promise<AppConfig> {
    const before = this.settings;
    const next = applyPatch(before, patch);
    this.settings = next;

    await mkdir(dirname(this.overridesPath), { recursive: true });
    await writeFile(this.overridesPath, JSON.stringify(next, null, 2), 'utf8');

    const changed = diffKeys(before, next);
    if (changed.size > 0) {
      const config = this.get();
      for (const listener of this.listeners) {
        try {
          listener(config, changed);
        } catch (err) {
          console.error('[config] change listener failed:', err);
        }
      }
    }
    return this.get();
  }
}

function mergeSettings(base: EditableSettings, saved: Partial<EditableSettings>): EditableSettings {
  return {
    ...base,
    ...saved,
    savesDir: saved.savesDir ? resolve(saved.savesDir) : base.savesDir,
    serverApi: { ...base.serverApi, ...(saved.serverApi ?? {}) },
    discord: { ...base.discord, ...(saved.discord ?? {}) },
  };
}

function applyPatch(current: EditableSettings, patch: SettingsPatch): EditableSettings {
  const next: EditableSettings = {
    ...current,
    discord: { ...current.discord },
  };

  if (patch.savesDir !== undefined) next.savesDir = resolve(patch.savesDir);
  if (patch.canonicalSaveSuffix !== undefined) next.canonicalSaveSuffix = patch.canonicalSaveSuffix.trim();
  if (patch.autosaveIntervalMinutes !== undefined) {
    next.autosaveIntervalMinutes = Math.max(0, Math.floor(patch.autosaveIntervalMinutes));
  }
  if (patch.autosaveTimeToleranceSeconds !== undefined) {
    next.autosaveTimeToleranceSeconds = Math.max(0, Math.floor(patch.autosaveTimeToleranceSeconds));
  }
  if (patch.docsPath !== undefined) next.docsPath = patch.docsPath.trim() ? patch.docsPath.trim() : undefined;
  if (patch.postToDiscord !== undefined) next.postToDiscord = patch.postToDiscord;
  if (patch.skipEmptySummaries !== undefined) next.skipEmptySummaries = patch.skipEmptySummaries;
  if (patch.watchDebounceMs !== undefined) next.watchDebounceMs = Math.max(0, Math.floor(patch.watchDebounceMs));
  if (patch.phaseCostMultiplier !== undefined) next.phaseCostMultiplier = Math.max(0, patch.phaseCostMultiplier);
  if (patch.watchUsePolling !== undefined) next.watchUsePolling = patch.watchUsePolling;
  if (patch.webEnabled !== undefined) next.webEnabled = patch.webEnabled;
  if (patch.webPort !== undefined) next.webPort = Math.max(1, Math.floor(patch.webPort));

  if (patch.serverApi) {
    if (patch.serverApi.url !== undefined) {
      next.serverApi.url = patch.serverApi.url.trim() ? patch.serverApi.url.trim() : undefined;
    }
    next.serverApi.token = applySecret(current.serverApi.token, patch.serverApi.token);
    if (patch.serverApi.allowInsecureTls !== undefined) {
      next.serverApi.allowInsecureTls = patch.serverApi.allowInsecureTls;
    }
    if (patch.serverApi.timeoutMs !== undefined) {
      next.serverApi.timeoutMs = Math.max(100, Math.floor(patch.serverApi.timeoutMs));
    }
  }

  if (patch.discord) {
    next.discord.webhookUrl = applySecret(current.discord.webhookUrl, patch.discord.webhookUrl);
    next.discord.botToken = applySecret(current.discord.botToken, patch.discord.botToken);
    // channelId is not a secret; treat empty string as "clear".
    if (patch.discord.channelId !== undefined) {
      next.discord.channelId = patch.discord.channelId ? patch.discord.channelId.trim() : undefined;
    }
  }
  return next;
}

/**
 * Secret update rule: `undefined` = no change, `null` or empty = clear,
 * non-empty string = set.
 */
function applySecret(current: string | undefined, value: string | null | undefined): string | undefined {
  if (value === undefined) return current;
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function diffKeys(before: EditableSettings, after: EditableSettings): Set<string> {
  const changed = new Set<string>();
  const topKeys: (keyof EditableSettings)[] = [
    'savesDir',
    'canonicalSaveSuffix',
    'autosaveIntervalMinutes',
    'autosaveTimeToleranceSeconds',
    'docsPath',
    'postToDiscord',
    'skipEmptySummaries',
    'watchDebounceMs',
    'phaseCostMultiplier',
    'watchUsePolling',
    'webEnabled',
    'webPort',
  ];
  for (const key of topKeys) {
    if (before[key] !== after[key]) changed.add(key);
  }
  if (
    before.serverApi.url !== after.serverApi.url ||
    before.serverApi.token !== after.serverApi.token ||
    before.serverApi.allowInsecureTls !== after.serverApi.allowInsecureTls ||
    before.serverApi.timeoutMs !== after.serverApi.timeoutMs
  ) {
    changed.add('serverApi');
  }
  if (
    before.discord.webhookUrl !== after.discord.webhookUrl ||
    before.discord.botToken !== after.discord.botToken ||
    before.discord.channelId !== after.discord.channelId
  ) {
    changed.add('discord');
  }
  return changed;
}

/** True when at least one Discord delivery method is fully configured. */
export function hasDiscordDelivery(config: AppConfig): boolean {
  const { discord } = config;
  const webhookReady = Boolean(discord.webhookUrl);
  const botReady = Boolean(discord.botToken && discord.channelId);
  return webhookReady || botReady;
}
