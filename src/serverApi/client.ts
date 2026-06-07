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
  gameState?: ServerGameState;
  checkedAt?: string;
  error?: string;
}

export function hasServerApiConfig(config: Pick<AppConfig, 'serverApi'>): boolean {
  return Boolean(config.serverApi.url && config.serverApi.token);
}

export async function queryServerState(config: Pick<AppConfig, 'serverApi'>): Promise<ServerGameState> {
  const url = config.serverApi.url?.trim();
  const token = config.serverApi.token?.trim();
  if (!url || !token) {
    throw new Error('Server API is not configured (missing URL or token).');
  }

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
        timeout: Math.max(100, config.serverApi.timeoutMs),
        ...(isHttps ? { rejectUnauthorized: !config.serverApi.allowInsecureTls } : {}),
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
