import { describe, expect, it } from 'vitest';
import { buildServerApiCandidates, hasServerApiConfig } from '../src/serverApi/client.js';

describe('server API endpoint discovery', () => {
  it('treats token-only config as configured', () => {
    const configured = hasServerApiConfig({
      serverApi: {
        url: undefined,
        token: 'abc',
        allowInsecureTls: true,
        timeoutMs: 5000,
      },
    } as any);
    expect(configured).toBe(true);
  });

  it('normalizes configured URL and keeps it first', () => {
    const candidates = buildServerApiCandidates('https://10.0.0.25:7777');
    expect(candidates[0]).toBe('https://10.0.0.25:7777/api/v1');
  });

  it('adds local discovery endpoints when no URL is provided', () => {
    const candidates = buildServerApiCandidates(undefined);
    expect(candidates).toContain('https://127.0.0.1:7777/api/v1');
    expect(candidates).toContain('https://localhost:7777/api/v1');
    expect(candidates).toContain('https://satisfactory:7777/api/v1');
    expect(candidates).toContain('http://satisfactory-server:7777/api/v1');
    expect(candidates).toContain('http://host.docker.internal:7777/api/v1');
  });

  it('accepts host:port input without scheme', () => {
    const candidates = buildServerApiCandidates('192.168.1.10:7777');
    expect(candidates[0]).toBe('https://192.168.1.10:7777/api/v1');
    expect(candidates[1]).toBe('http://192.168.1.10:7777/api/v1');
  });

  it('supports custom discovery hosts via env var', () => {
    process.env.SERVER_API_DISCOVERY_HOSTS = 'game-a, game-b:7777';
    const candidates = buildServerApiCandidates(undefined);
    expect(candidates).toContain('https://game-a:7777/api/v1');
    expect(candidates).toContain('http://game-a:7777/api/v1');
    expect(candidates).toContain('https://game-b:7777/api/v1');
    expect(candidates).toContain('http://game-b:7777/api/v1');
    delete process.env.SERVER_API_DISCOVERY_HOSTS;
  });
});
