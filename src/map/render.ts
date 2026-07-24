/**
 * Headless map-image rendering.
 *
 * The embedded Satisfactory map only renders client-side (Rust → WASM + WebGL),
 * so to produce a static image for Discord we drive a headless Chromium to the
 * map page, have it load a chosen save via the AuditBot API, apply the admin's
 * default view, and screenshot the rendered canvas.
 *
 * Playwright is loaded lazily via a computed specifier so the rest of the app
 * (and `tsc`) work even when the package/browser is not installed; rendering
 * then fails with a clear, actionable error instead.
 */
import type { MapImageConfig } from '../config.js';

export interface RenderMapOptions {
  /** Base URL of the running web server, e.g. http://127.0.0.1:8080 */
  baseUrl: string;
  /** Absolute path of the save to render (must be an allowlisted save). */
  savePath: string;
  /** Default view + output settings. */
  mapImage: MapImageConfig;
  /** Overall timeout in milliseconds. */
  timeoutMs?: number;
}

export interface RenderMapResult {
  /** PNG image bytes. */
  buffer: Buffer;
  /** Pixel dimensions of the produced image. */
  width: number;
  height: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

// SwiftShader/ANGLE so WebGL works in headless Chromium without a real GPU.
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--ignore-gpu-blocklist',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

/** Lazily obtain Playwright's chromium launcher without a compile-time dep. */
async function loadChromium(): Promise<{ launch: (opts: unknown) => Promise<HeadlessBrowser> }> {
  const specifier = 'playwright';
  try {
    const pw = (await import(/* @vite-ignore */ specifier)) as { chromium: { launch: (opts: unknown) => Promise<HeadlessBrowser> } };
    return pw.chromium;
  } catch {
    throw new Error(
      'Headless map rendering requires the "playwright" package with a Chromium browser. ' +
        'Install it (npm i playwright && npx playwright install --with-deps chromium) or disable the map image.',
    );
  }
}

/** Minimal structural types for the slice of Playwright we use. */
interface HeadlessBrowser {
  newContext(opts: unknown): Promise<HeadlessContext>;
  close(): Promise<void>;
}
interface HeadlessContext {
  newPage(): Promise<HeadlessPage>;
}
interface HeadlessLocator {
  first(): HeadlessLocator;
  count(): Promise<number>;
  screenshot(opts: unknown): Promise<Buffer>;
}
interface HeadlessPage {
  on(event: string, handler: (arg: { message?: string; type?: () => string; text?: () => string }) => void): void;
  goto(url: string, opts: unknown): Promise<unknown>;
  waitForFunction(fn: () => boolean, arg: unknown, opts: unknown): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
  locator(selector: string): HeadlessLocator;
  screenshot(opts: unknown): Promise<Buffer>;
}

/** Build the internal map URL with the headless render parameters. */
function buildMapUrl(options: RenderMapOptions): string {
  const { baseUrl, savePath, mapImage } = options;
  const url = new URL('/map/index.html', baseUrl);
  const q = url.searchParams;
  q.set('headless', '1');
  q.set('apiSave', savePath);
  q.set('zoom', String(mapImage.zoom));
  if (mapImage.centerX !== undefined && mapImage.centerY !== undefined) {
    q.set('centerX', String(mapImage.centerX));
    q.set('centerY', String(mapImage.centerY));
  }
  if (mapImage.layers.length > 0) {
    q.set('layers', mapImage.layers.join(','));
  }
  return url.toString();
}

/**
 * Render the map to a PNG for the given save + view. Throws with a clear message
 * if Playwright/Chromium is unavailable or the in-browser render reports failure.
 */
export async function renderMapImage(options: RenderMapOptions): Promise<RenderMapResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { width, height } = options.mapImage;
  const chromium = await loadChromium();

  const browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message) errors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type?.() === 'error' && msg.text) errors.push(msg.text());
    });

    await page.goto(buildMapUrl(options), { waitUntil: 'load', timeout: timeoutMs });

    // The patched frontend signals completion (or failure) through globals.
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __MAP_RENDER_READY__?: boolean }).__MAP_RENDER_READY__ === true ||
        Boolean((globalThis as unknown as { __MAP_RENDER_ERROR__?: string }).__MAP_RENDER_ERROR__),
      undefined,
      { timeout: timeoutMs },
    );

    const renderError = await page.evaluate<string | null>(
      () => (globalThis as unknown as { __MAP_RENDER_ERROR__?: string }).__MAP_RENDER_ERROR__ ?? null,
    );
    if (renderError) {
      throw new Error(`Map render failed in browser: ${renderError}`);
    }

    // Prefer the map container/canvas; fall back to the full viewport.
    const target = page.locator('#map, .leaflet-container, canvas').first();
    const count = await target.count();
    const shot =
      count > 0
        ? await target.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png' });

    return { buffer: Buffer.from(shot), width, height };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
