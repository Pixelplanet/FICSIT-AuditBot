import { afterEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { ConfigManager } from '../src/config.js';

const PATH_VARS = ['DATA_DIR', 'STATE_DIR', 'DOCS_PATH', 'SAVES_DIR'] as const;

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
