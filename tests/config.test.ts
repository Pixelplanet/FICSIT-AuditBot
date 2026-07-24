import { afterEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigManager } from '../src/config.js';

const PATH_VARS = [
  'DATA_DIR',
  'STATE_DIR',
  'DOCS_PATH',
  'SAVES_DIR',
  'AUTOSAVE_INTERVAL_MINUTES',
  'AUTOSAVE_TIME_TOLERANCE_SECONDS',
  'SERVER_API_URL',
  'SERVER_API_TOKEN',
  'SERVER_API_ALLOW_INSECURE_TLS',
  'SERVER_API_TIMEOUT_MS',
  'MAP_IMAGE_ENABLED',
] as const;

function clearPathEnv(): void {
  for (const key of PATH_VARS) delete process.env[key];
}

afterEach(clearPathEnv);

describe('config path derivation', () => {
  it('derives state and docs from DATA_DIR', () => {
    clearPathEnv();
    process.env.DATA_DIR = '/data';
    const cfg = new ConfigManager().get();
    expect(cfg.stateDir).toBe(join(resolve('/data'), 'state'));
    expect(cfg.docsPath).toBe(join(resolve('/data'), 'docs'));
  });

  it('lets explicit STATE_DIR and DOCS_PATH override DATA_DIR', () => {
    clearPathEnv();
    process.env.DATA_DIR = '/data';
    process.env.STATE_DIR = '/custom/state';
    process.env.DOCS_PATH = '/custom/docs/Docs.json';
    const cfg = new ConfigManager().get();
    expect(cfg.stateDir).toBe(resolve('/custom/state'));
    expect(cfg.docsPath).toBe('/custom/docs/Docs.json');
  });

  it('falls back to ./state and auto-discover when nothing is set', () => {
    clearPathEnv();
    const cfg = new ConfigManager().get();
    expect(cfg.stateDir).toBe(resolve('./state'));
    expect(cfg.docsPath).toBeUndefined();
  });
});

describe('map image config', () => {
  it('defaults to disabled with sane render settings', () => {
    clearPathEnv();
    const cfg = new ConfigManager().get();
    expect(cfg.mapImage.enabled).toBe(false);
    expect(cfg.mapImage.source).toBe('canonical');
    expect(cfg.mapImage.width).toBeGreaterThan(0);
    expect(cfg.mapImage.height).toBeGreaterThan(0);
  });

  it('exposes mapImage in the public view', () => {
    clearPathEnv();
    const pub = new ConfigManager().getPublic();
    expect(pub.mapImage).toBeDefined();
    expect(pub.mapImage.enabled).toBe(false);
  });

  it('applies, clamps and diffs a mapImage patch', async () => {
    clearPathEnv();
    process.env.STATE_DIR = join(tmpdir(), `auditbot-cfg-${Date.now()}`);
    const mgr = new ConfigManager();
    await mgr.load();
    let changed: Set<string> | undefined;
    mgr.onChange((_c, keys) => {
      changed = keys;
    });
    await mgr.update({
      mapImage: { enabled: true, width: 100000, height: 64, layers: ['belts', '', 'power'], zoom: 6 },
    });
    const cfg = mgr.get();
    expect(cfg.mapImage.enabled).toBe(true);
    expect(cfg.mapImage.width).toBe(4096); // clamped to max
    expect(cfg.mapImage.height).toBe(256); // clamped to min
    expect(cfg.mapImage.layers).toEqual(['belts', 'power']);
    expect(cfg.mapImage.zoom).toBe(6);
    expect(changed?.has('mapImage')).toBe(true);
  });
});
