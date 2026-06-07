export interface LogEntry {
  at: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

const MAX_LOG_ENTRIES = 400;
const entries: LogEntry[] = [];

function push(level: LogEntry['level'], args: unknown[]): void {
  const message = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

  entries.push({ at: new Date().toISOString(), level, message });
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }
}

export function installConsoleCapture(): void {
  const baseLog = console.log.bind(console);
  const baseWarn = console.warn.bind(console);
  const baseError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    push('log', args);
    baseLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    push('warn', args);
    baseWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    push('error', args);
    baseError(...args);
  };
}

export function getRecentLogs(limit = 200): LogEntry[] {
  const n = Math.max(1, Math.min(1000, Math.floor(limit)));
  return entries.slice(-n);
}
