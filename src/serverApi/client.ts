import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import type { AppConfig } from '../config.js';

export interface ServerGameState {
  activeSessionName?: string;
  numConnectedPlayers?: number;
  techTier?: number;
  activeSchematic?: string;
  gamePhase?: string;
  isGameRunning?: boolean;
  totalGameDuration?: number;
  isGamePaused?: boolean;
  averageTickRate?: number;
}

export interface ServerApiState {
  configured: boolean;
  reachable: boolean;
  endpointUrl?: string;
  autoDetected?: boolean;
  gameState?: ServerGameState;
  checkedAt?: string;
  error?: string;
}

export function hasServerApiConfig(config: Pick<AppConfig, 'serverApi'>): boolean {
  return Boolean(config.serverApi.token?.trim());
}

export interface ServerQueryResult {
  endpointUrl: string;
  autoDetected: boolean;
  gameState: ServerGameState;
}

/** Build endpoint candidates from optional user URL plus local Docker-friendly defaults. */
export function buildServerApiCandidates(url?: string): string[] {
  const out = new Set<string>();
  const add = (value: string): void => {
    const normalized = normalizeEndpoint(value);
    if (normalized) out.add(normalized);
  };

  const trimmed = url?.trim();
  if (trimmed) {
    if (/^https?:\/\//i.test(trimmed)) {
      add(trimmed);
    } else {
      add(`https://${trimmed}`);
      add(`http://${trimmed}`);
    }
  }

  const defaults = [
    'https://127.0.0.1:7777/api/v1',
    'https://localhost:7777/api/v1',
    'https://host.docker.internal:7777/api/v1',
    'http://127.0.0.1:7777/api/v1',
    'http://localhost:7777/api/v1',
    'http://host.docker.internal:7777/api/v1',
  ];
  for (const endpoint of defaults) add(endpoint);

  return [...out];
}

export async function queryServerState(config: Pick<AppConfig, 'serverApi'>): Promise<ServerQueryResult> {
  const configuredUrl = config.serverApi.url?.trim();
  const token = config.serverApi.token?.trim();
  if (!token) {
    throw new Error('Server API is not configured (missing token).');
  }

  const candidates = buildServerApiCandidates(configuredUrl);
  if (candidates.length === 0) {
    throw new Error('No valid server API endpoint candidates could be derived.');
  }

  const errors: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const endpointUrl = candidates[i];
    const timeoutMs = configuredUrl && i === 0
      ? Math.max(100, config.serverApi.timeoutMs)
      : Math.max(100, Math.min(config.serverApi.timeoutMs, 1500));
    try {
      const gameState = await requestServerState(endpointUrl, token, config.serverApi.allowInsecureTls, timeoutMs);
      return {
        endpointUrl,
        autoDetected: !configuredUrl || endpointUrl !== normalizeEndpoint(configuredUrl),
        gameState,
      };
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${endpointUrl} -> ${msg}`);
    }
  }

  const source = configuredUrl
    ? `Configured URL failed and auto-detection could not reach any endpoint.`
    : `Auto-detection could not reach any endpoint.`;
  throw new Error(`${source} Tried: ${errors.join(' | ')}`);
}

async function requestServerState(
  url: string,
  token: string,
  allowInsecureTls: boolean,
  timeoutMs: number,
): Promise<ServerGameState> {
  const body = JSON.stringify({ function: 'QueryServerState', data: {} });
  const endpoint = new URL(url);
  const isHttps = endpoint.protocol === 'https:';
  const transport = isHttps ? https : http;

  const response = await new Promise<string>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.pathname + endpoint.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: !allowInsecureTls } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(Buffer.from(d)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            reject(new Error(`HTTPS API ${code}: ${raw || res.statusMessage || 'request failed'}`));
            return;
          }
          resolve(raw);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('HTTPS API request timed out.'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const parsed = JSON.parse(response) as { data?: { serverGameState?: ServerGameState; ServerGameState?: ServerGameState } };
  const state = parsed?.data?.serverGameState ?? parsed?.data?.ServerGameState;
  if (!state || typeof state !== 'object') {
    throw new Error('HTTPS API response did not contain serverGameState.');
  }
  return state;
}

function normalizeEndpoint(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/api/v1';
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
