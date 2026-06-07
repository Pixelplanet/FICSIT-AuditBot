/**
 * Application runtime: owns the live watcher + Discord dispatcher lifecycle,
 * reacts to configuration changes (restarting the watcher / rebuilding the
 * dispatcher as needed), and exposes operations used by the web UI (preview,
 * manual process, status, test-post).
 */
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import {
  hasDiscordDelivery,
  type AppConfig,
  type ConfigManager,
} from './config.js';
import { DiscordDispatcher } from './discord/index.js';
import { StateStore } from './state/store.js';
import { PreviewStore, type PreviewEntry } from './preview/store.js';
import {
  computeSummary,
  computeSummaryBetween,
  processSave,
  type ProcessResult,
} from './processor.js';
import { findCanonicalSave, watchSaves, type SaveWatcher } from './watcher.js';
import type { SummaryResult } from './summary/format.js';
import { discoverDocsPath, setDocsIndex } from './data/docsProvider.js';
import { loadDocsFromFile } from './data/docs/index.js';
import {
  hasServerApiConfig,
  queryServerState,
  type ServerApiState,
  type ServerGameState,
} from './serverApi/client.js';

export interface DocsStatus {
  loaded: boolean;
  sourcePath?: string;
  items?: number;
  recipes?: number;
  schematics?: number;
  error?: string;
}

export interface RuntimeStatus {
  savesDir: string;
  canonicalSuffix: string;
  autosaveIntervalMinutes: number;
  autosaveTimeToleranceSeconds: number;
  canonicalSave?: string;
  canonicalSaveName?: string;
  watching: boolean;
  postToDiscord: boolean;
  discordReady: boolean;
  serverApi: ServerApiState;
  docs: DocsStatus;
  /** Effective Space Elevator parts cost multiplier and where it came from. */
  phaseCostMultiplier: { value: number; source: 'override' | 'save' | 'default' };
  baseline: {
    hasBaseline: boolean;
    lastSaveName?: string;
    lastProcessedAt?: string;
    playDurationSeconds?: number;
    totalObjects?: number;
  };
  lastResult?: { status: string; message: string; at: string };
}

export class Runtime {
  private dispatcher?: DiscordDispatcher;
  private watcher?: SaveWatcher;
  private processing: Promise<void> = Promise.resolve();
  private lastResult?: { status: string; message: string; at: string };
  private docsStatus: DocsStatus = { loaded: false };
  private serverApiState: ServerApiState = { configured: false, reachable: false };

  constructor(
    private readonly configManager: ConfigManager,
    readonly store: StateStore,
    readonly previewStore: PreviewStore,
  ) {}

  private get config(): AppConfig {
    return this.configManager.get();
  }

  /** Start processing the current save and begin watching. */
  async start(): Promise<void> {
    await this.loadDocs();
    this.rebuildDispatcher();
    this.startWatcher();

    this.configManager.onChange((config, changed) => {
      if (changed.has('postToDiscord') || changed.has('discord')) {
        console.log('[runtime] Discord settings changed; rebuilding dispatcher.');
        this.rebuildDispatcher();
      }
      if (changed.has('docsPath')) {
        console.log('[runtime] Docs path changed; reloading game data.');
        void this.loadDocs();
      }
      if (
        changed.has('savesDir') ||
        changed.has('canonicalSaveSuffix') ||
        changed.has('autosaveIntervalMinutes') ||
        changed.has('autosaveTimeToleranceSeconds') ||
        changed.has('watchDebounceMs') ||
        changed.has('watchUsePolling')
      ) {
        console.log('[runtime] Watch settings changed; restarting watcher.');
        void this.restartWatcher();
      }
      void config;
    });

    const initial = await findCanonicalSave(this.config);
    if (initial) {
      console.log(`[startup] Found canonical save: ${initial}`);
      await this.enqueue(initial);
    } else {
      console.log(`[startup] No canonical save (*${this.config.canonicalSaveSuffix}) found yet.`);
    }
  }

  private rebuildDispatcher(): void {
    const old = this.dispatcher;
    this.dispatcher = this.config.postToDiscord ? new DiscordDispatcher(this.config) : undefined;
    void old?.shutdown().catch(() => undefined);
  }

  /** Load (or reload) the game Docs.json so summaries use real display names. */
  async loadDocs(): Promise<DocsStatus> {
    try {
      const path = await discoverDocsPath(this.config.docsPath);
      if (!path) {
        setDocsIndex(undefined);
        this.docsStatus = {
          loaded: false,
          error: this.config.docsPath
            ? `No Docs.json found at or under "${this.config.docsPath}".`
            : 'No Docs.json configured or auto-discovered. Set DOCS_PATH to enrich names.',
        };
        console.warn(`[docs] ${this.docsStatus.error}`);
        return this.docsStatus;
      }
      const index = await loadDocsFromFile(path);
      setDocsIndex(index);
      const stats = index.stats();
      this.docsStatus = { loaded: true, sourcePath: path, ...stats };
      console.log(
        `[docs] Loaded ${stats.schematics} schematics, ${stats.recipes} recipes, ${stats.items} items from ${path}`,
      );
      return this.docsStatus;
    } catch (err) {
      setDocsIndex(undefined);
      this.docsStatus = { loaded: false, error: (err as Error).message };
      console.error('[docs] Failed to load Docs.json:', err);
      return this.docsStatus;
    }
  }

  private startWatcher(): void {
    this.watcher = watchSaves(this.config, (savePath) => {
      console.log(`[watch] Canonical save changed: ${savePath}`);
      void this.enqueue(savePath);
    });
    console.log(`[watch] Watching ${this.config.savesDir} …`);
  }

  private async restartWatcher(): Promise<void> {
    await this.watcher?.close().catch(() => undefined);
    this.startWatcher();
  }

  /** Serialize live processing so rapid saves cannot race on the store. */
  private enqueue(savePath: string): Promise<void> {
    this.processing = this.processing
      .then(() => this.runOnce(savePath))
      .catch((err) => console.error('[process] error:', err));
    return this.processing;
  }

  private async runOnce(savePath: string): Promise<void> {
    const serverState = await this.queryServerStateSafe();
    if (this.shouldSkipBecauseServerActive(serverState?.gameState)) {
      this.lastResult = {
        status: 'skipped-server-active',
        message: 'Server has active players and is not paused; waiting for an idle/disconnect save.',
        at: new Date().toISOString(),
      };
      console.log(`[process] ${this.lastResult.status}: ${this.lastResult.message}`);
      return;
    }

    const result = await processSave(savePath, this.config, this.store, this.dispatcher);
    this.lastResult = {
      status: result.status,
      message: result.message,
      at: new Date().toISOString(),
    };
    console.log(`[process] ${result.status}: ${result.message}`);
    this.recordPreviewFromResult(result, savePath);
  }

  private recordPreviewFromResult(result: ProcessResult, savePath: string): void {
    const source = `baseline → ${basename(savePath)} (live)`;
    let entry: PreviewEntry;
    switch (result.status) {
      case 'skipped-unchanged':
        return; // nothing to show
      case 'baseline-set':
        entry = { generatedAt: new Date().toISOString(), source, live: true, kind: 'first-run', status: result.status };
        break;
      default:
        entry = {
          generatedAt: new Date().toISOString(),
          source,
          live: true,
          kind: result.summary?.embed.fields.length ? 'summary' : 'empty',
          status: result.status,
          summary: result.summary,
        };
    }
    this.previewStore.set(entry);
  }

  /** Trigger a live process of the current canonical save now (UI button). */
  async processNow(): Promise<{ status: string; message: string }> {
    const savePath = await findCanonicalSave(this.config);
    if (!savePath) {
      return { status: 'no-save', message: 'No canonical save found.' };
    }
    await this.enqueue(savePath);
    return this.lastResult ?? { status: 'unknown', message: 'Processed.' };
  }

  /** Preview the current canonical save vs the baseline, without posting. */
  async previewAgainstBaseline(): Promise<PreviewEntry> {
    const savePath = await findCanonicalSave(this.config);
    if (!savePath) {
      const entry: PreviewEntry = {
        generatedAt: new Date().toISOString(),
        source: 'baseline → (no canonical save found)',
        live: false,
        kind: 'unchanged',
      };
      this.previewStore.set(entry);
      return entry;
    }

    const computed = await computeSummary(savePath, this.store, {
      phaseCostMultiplierOverride: this.config.phaseCostMultiplier,
    });
    const source = `baseline → ${basename(savePath)}`;
    let entry: PreviewEntry;
    if (computed.isFirstRun) {
      entry = { generatedAt: new Date().toISOString(), source, live: false, kind: 'first-run' };
    } else {
      entry = {
        generatedAt: new Date().toISOString(),
        source,
        live: false,
        kind: computed.delta?.isEmpty ? 'empty' : 'summary',
        summary: computed.summary,
      };
    }
    this.previewStore.set(entry);
    return entry;
  }

  /** Preview a diff between two arbitrary save files, without posting. */
  async previewBetween(beforePath: string, afterPath: string): Promise<PreviewEntry> {
    const { delta, summary } = await computeSummaryBetween(beforePath, afterPath, {
      phaseCostMultiplierOverride: this.config.phaseCostMultiplier,
    });
    const entry: PreviewEntry = {
      generatedAt: new Date().toISOString(),
      source: `${basename(beforePath)} → ${basename(afterPath)}`,
      live: false,
      kind: delta.isEmpty ? 'empty' : 'summary',
      summary,
    };
    this.previewStore.set(entry);
    return entry;
  }

  /**
   * Send a summary to Discord on demand (for testing delivery). Builds a
   * temporary dispatcher if live posting is disabled.
   */
  async testPost(summary: SummaryResult): Promise<{ delivered: boolean; message: string }> {
    if (!hasDiscordDelivery(this.config)) {
      return { delivered: false, message: 'No Discord webhook or bot is configured.' };
    }
    const dispatcher = this.dispatcher ?? new DiscordDispatcher(this.config);
    try {
      const delivered = await dispatcher.dispatch(summary);
      return {
        delivered,
        message: delivered ? 'Test summary sent to Discord.' : 'Delivery failed (see logs).',
      };
    } finally {
      if (!this.dispatcher) await dispatcher.shutdown().catch(() => undefined);
    }
  }

  async getStatus(): Promise<RuntimeStatus> {
    const config = this.config;
    const canonicalSave = await findCanonicalSave(config);
    await this.queryServerStateSafe();
    const state = this.store.get();
    const ws = state.lastWorldState;

    return {
      savesDir: config.savesDir,
      canonicalSuffix: config.canonicalSaveSuffix,
      autosaveIntervalMinutes: config.autosaveIntervalMinutes,
      autosaveTimeToleranceSeconds: config.autosaveTimeToleranceSeconds,
      canonicalSave,
      canonicalSaveName: canonicalSave ? basename(canonicalSave) : undefined,
      watching: Boolean(this.watcher),
      postToDiscord: config.postToDiscord,
      discordReady: hasDiscordDelivery(config),
      serverApi: this.serverApiState,
      docs: this.docsStatus,
      phaseCostMultiplier: resolveMultiplier(config.phaseCostMultiplier, ws?.gamePhase.partsCostMultiplier),
      baseline: {
        hasBaseline: Boolean(ws),
        lastSaveName: state.lastSaveName,
        lastProcessedAt: state.lastProcessedAt,
        playDurationSeconds: ws?.playDurationSeconds,
        totalObjects: ws?.totalObjects,
      },
      lastResult: this.lastResult,
    };
  }

  /** List save files in the saves directory with basic metadata. */
  async listSaves(): Promise<{ name: string; path: string; mtimeMs: number; sizeBytes: number; isCanonical: boolean }[]> {
    const { readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const config = this.config;
    let names: string[];
    try {
      names = await readdir(config.savesDir);
    } catch {
      return [];
    }
    const suffix = config.canonicalSaveSuffix.toLowerCase();
    const saves = names.filter((n) => n.toLowerCase().endsWith('.sav'));
    const out: { name: string; path: string; mtimeMs: number; sizeBytes: number; isCanonical: boolean }[] = [];
    for (const name of saves) {
      const path = join(config.savesDir, name);
      const info = await stat(path).catch(() => undefined);
      if (!info) continue;
      out.push({
        name,
        path,
        mtimeMs: info.mtimeMs,
        sizeBytes: info.size,
        isCanonical: name.toLowerCase().endsWith(suffix),
      });
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return out;
  }

  async shutdown(): Promise<void> {
    await this.watcher?.close().catch(() => undefined);
    await this.dispatcher?.shutdown().catch(() => undefined);
  }

  private async queryServerStateSafe(): Promise<ServerApiState | undefined> {
    const config = this.config;
    if (!hasServerApiConfig(config)) {
      this.serverApiState = { configured: false, reachable: false, checkedAt: new Date().toISOString() };
      return undefined;
    }
    try {
      const result = await queryServerState(config);
      this.serverApiState = {
        configured: true,
        reachable: true,
        checkedAt: new Date().toISOString(),
        endpointUrl: result.endpointUrl,
        autoDetected: result.autoDetected,
        gameState: result.gameState,
      };
      return this.serverApiState;
    } catch (err) {
      this.serverApiState = {
        configured: true,
        reachable: false,
        checkedAt: new Date().toISOString(),
        error: (err as Error).message,
      };
      console.warn('[server-api] QueryServerState failed:', err);
      return this.serverApiState;
    }
  }

  private shouldSkipBecauseServerActive(state: ServerGameState | undefined): boolean {
    if (!state) return false;
    const running = state.isGameRunning !== false;
    const paused = state.isGamePaused === true;
    const players = state.numConnectedPlayers ?? 0;
    return running && !paused && players > 0;
  }
}

export function createRuntime(configManager: ConfigManager): Runtime {
  const config = configManager.get();
  const store = new StateStore(config.stateDir);
  const previewStore = new PreviewStore();
  return new Runtime(configManager, store, previewStore);
}

/** Resolve the effective parts-cost multiplier: override > save value > 1. */
function resolveMultiplier(
  override: number,
  saveValue: number | undefined,
): { value: number; source: 'override' | 'save' | 'default' } {
  if (override > 0) return { value: override, source: 'override' };
  if (typeof saveValue === 'number' && saveValue > 0) return { value: saveValue, source: 'save' };
  return { value: 1, source: 'default' };
}
