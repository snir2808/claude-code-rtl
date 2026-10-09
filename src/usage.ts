import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface UsageWindow {
  /** Share of the window used, 0–100. */
  utilization: number;
  /** When the window resets; null when no window is active. */
  resetsAt: Date | null;
}

export interface Usage {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
}

export interface UsageStatus {
  text: string;
  tooltip: string;
}

function parseWindow(raw: unknown): UsageWindow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { utilization, resets_at: resetsAt } = raw as { utilization?: unknown; resets_at?: unknown };
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) {
    return null;
  }
  if (resetsAt === null || resetsAt === undefined) {
    return { utilization, resetsAt: null };
  }
  const time = typeof resetsAt === 'string' ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(time) ? { utilization, resetsAt: new Date(time) } : null;
}

/** Reads the usage endpoint's body; the windows sit at the top level or under rate_limits. */
export function parseUsage(body: unknown): Usage | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const root = body as Record<string, unknown>;
  const limits = (
    root.rate_limits && typeof root.rate_limits === 'object' ? root.rate_limits : root
  ) as Record<string, unknown>;
  if (!('five_hour' in limits) && !('seven_day' in limits)) {
    return null;
  }
  return { session: parseWindow(limits.five_hour), weekly: parseWindow(limits.seven_day) };
}

/** 24-hour local clock, e.g. 07:05. */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function weeklyLine(weekly: UsageWindow | null): string {
  if (!weekly) {
    return '';
  }
  const resets = weekly.resetsAt
    ? `, resets ${WEEKDAYS[weekly.resetsAt.getDay()]} ${formatClock(weekly.resetsAt)}`
    : '';
  return `\nWeekly (7 days): ${Math.round(weekly.utilization)}% used${resets}.`;
}

export function formatUsageStatus(usage: Usage, now: Date): UsageStatus {
  const session = usage.session;
  const weekly = weeklyLine(usage.weekly);
  if (!session || !session.resetsAt || session.resetsAt.getTime() <= now.getTime()) {
    return {
      text: '$(watch) —',
      tooltip: `Claude session (5h): no active window — it starts with your next message.${weekly}\nClick to refresh.`,
    };
  }
  const clock = formatClock(session.resetsAt);
  const used = Math.round(session.utilization);
  return {
    text: `$(watch) ${clock} · ${used}%`,
    tooltip: `Claude session (5h): ${used}% used, resets at ${clock}.${weekly}\nClick to refresh.`,
  };
}

export function formatUsageError(reason: string): UsageStatus {
  return {
    text: '$(watch) —',
    tooltip: `Claude session (5h): unavailable — ${reason}. Click to retry.`,
  };
}

/** Extracts the OAuth access token from Claude Code's stored credentials JSON. */
export function parseAccessToken(raw: string): string | null {
  try {
    const token = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } }).claudeAiOauth?.accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function readKeychain(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { timeout: 10000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
    );
  });
}

/**
 * Reads Claude Code's OAuth access token from the macOS Keychain, or from
 * ~/.claude/.credentials.json elsewhere. Returns null when there is none
 * (signed out, or using an API key): an expected state the status bar shows,
 * not an error.
 */
export async function readAccessToken(): Promise<string | null> {
  try {
    const raw = process.platform === 'darwin'
      ? await readKeychain()
      : await fs.promises.readFile(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8');
    return parseAccessToken(raw);
  } catch {
    return null;
  }
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetches the current usage windows. The token is sent only to USAGE_URL. */
export async function fetchUsage(
  token: string,
  fetchFn: FetchLike = (url, init) => fetch(url, init)
): Promise<Usage> {
  const response = await fetchFn(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`usage request failed (HTTP ${response.status})`);
  }
  const usage = parseUsage(await response.json());
  if (!usage) {
    throw new Error('unexpected usage response');
  }
  return usage;
}
