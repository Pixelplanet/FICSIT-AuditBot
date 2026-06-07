/**
 * Web server providing a configuration + preview UI for debugging. Exposes a
 * small JSON API consumed by the static frontend in `public/`.
 */
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { ConfigManager, SettingsPatch } from '../config.js';
import type { Runtime } from '../runtime.js';
import { toDiscordEmbed } from '../discord/embed.js';
import { getRecentLogs } from '../logs/store.js';

export interface WebServerHandle {
  close(): Promise<void>;
}

export async function startWebServer(
  configManager: ConfigManager,
  runtime: Runtime,
): Promise<WebServerHandle> {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

  // --- API ---
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(configManager.getPublic());
  });

  app.put('/api/config', asyncHandler(async (req: Request, res: Response) => {
    const patch = req.body as SettingsPatch;
    await configManager.update(patch ?? {});
    res.json(configManager.getPublic());
  }));

  app.get('/api/status', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await runtime.getStatus());
  }));

  app.get('/api/logs', (req: Request, res: Response) => {
    const limitRaw = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
    res.json(getRecentLogs(limit));
  });

  app.get('/api/saves', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await runtime.listSaves());
  }));

  app.get('/api/preview', asyncHandler(async (_req: Request, res: Response) => {
    res.json(serializePreview(runtime.previewStore.getLatest()));
  }));

  app.get('/api/preview/history', (_req: Request, res: Response) => {
    res.json(runtime.previewStore.getHistory().map(serializePreview));
  });

  // Preview baseline -> current canonical save (no posting).
  app.post('/api/preview', asyncHandler(async (_req: Request, res: Response) => {
    const entry = await runtime.previewAgainstBaseline();
    res.json(serializePreview(entry));
  }));

  // Preview an arbitrary pair of saves (no posting).
  app.post('/api/preview/between', asyncHandler(async (req: Request, res: Response) => {
    const { beforePath, afterPath } = req.body ?? {};
    if (typeof beforePath !== 'string' || typeof afterPath !== 'string') {
      res.status(400).json({ error: 'beforePath and afterPath are required.' });
      return;
    }
    if (!(await isAllowedSave(runtime, beforePath)) || !(await isAllowedSave(runtime, afterPath))) {
      res.status(400).json({ error: 'Paths must reference saves in the configured saves directory.' });
      return;
    }
    const entry = await runtime.previewBetween(beforePath, afterPath);
    res.json(serializePreview(entry));
  }));

  // Send the current preview summary to Discord (test delivery).
  app.post('/api/test-post', asyncHandler(async (_req: Request, res: Response) => {
    const latest = runtime.previewStore.getLatest();
    if (!latest?.summary) {
      res.status(400).json({ error: 'No preview summary available to post. Generate a preview first.' });
      return;
    }
    const result = await runtime.testPost(latest.summary);
    res.json(result);
  }));

  // Trigger a live process of the current canonical save now.
  app.post('/api/process-now', asyncHandler(async (_req: Request, res: Response) => {
    const result = await runtime.processNow();
    res.json(result);
  }));

  // Reload the game Docs.json (after changing the path or updating the game).
  app.post('/api/docs/reload', asyncHandler(async (_req: Request, res: Response) => {
    const status = await runtime.loadDocs();
    res.json(status);
  }));

  // --- Static frontend ---
  app.use(express.static(publicDir));

  // --- Error handler ---
  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error('[web] error:', err);
    res.status(500).json({ error: err.message });
  });

  const port = configManager.get().webPort;
  const server: Server = await new Promise((resolveServer) => {
    const s = app.listen(port, () => resolveServer(s));
  });

  console.log(`[web] UI available at http://localhost:${port}`);

  return {
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
}

/** Convert a preview entry to a JSON-friendly shape including the Discord embed. */
function serializePreview(entry: import('../preview/store.js').PreviewEntry | undefined) {
  if (!entry) return null;
  return {
    generatedAt: entry.generatedAt,
    source: entry.source,
    live: entry.live,
    kind: entry.kind,
    status: entry.status,
    text: entry.summary?.text,
    embed: entry.summary ? toDiscordEmbed(entry.summary.embed) : undefined,
  };
}

/** Ensure a path refers to a save listed in the configured saves directory. */
async function isAllowedSave(runtime: Runtime, candidate: string): Promise<boolean> {
  const saves = await runtime.listSaves();
  return saves.some((s) => s.path === candidate);
}

/** Wrap an async route handler so rejected promises hit the error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: express.NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
