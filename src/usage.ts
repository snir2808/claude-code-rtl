import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
/** `security` exits with 44 (errSecItemNotFound) when the Keychain has no such item. */
const KEYCHAIN_ITEM_NOT_FOUND = 44;
/** Printable ASCII only: no spaces, no control characters, nothing a header could not carry. */
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;
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

/**
 * Extracts the OAuth access token from Claude Code's stored credentials JSON.
 * The token goes into an HTTP header, so anything but printable ASCII counts
 * as no token: a malformed one would only make fetch fail with the token
 * quoted in its error.
 */
export function parseAccessToken(raw: string): string | null {
  try {
    const token = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } }).claudeAiOauth?.accessToken;
    return typeof token === 'string' && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * The credentials could not be read, which is not the same as there being
 * none. The message is fixed text, never the tool's output or the raw error,
 * so it is safe to show. `denied` marks a Keychain that refused or never
 * answered: retrying on a timer would only raise its prompt again.
 */
export class CredentialReadError extends Error {
  constructor(message: string, readonly denied: boolean) {
    super(message);
    this.name = 'CredentialReadError';
  }
}

/** An errno name such as EACCES; anything else is 'unknown', so no free-form text gets through. */
function errnoName(code: unknown): string {
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(code) ? code : 'unknown';
}

function unreadable(code: unknown): CredentialReadError {
  return new CredentialReadError(`could not read Claude Code credentials (${errnoName(code)})`, false);
}

/**
 * Sorts a failed `security find-generic-password` run: 'missing' when the
 * Keychain has no such item (exit 44), otherwise the error to throw. Only the
 * exit code, kill flag and signal are read, never the tool's output or message.
 */
export function classifyKeychainError(
  err: { code?: unknown; killed?: boolean; signal?: unknown }
): 'missing' | CredentialReadError {
  if (err.code === KEYCHAIN_ITEM_NOT_FOUND) {
    return 'missing';
  }
  if (err.killed || err.signal === 'SIGTERM') {
    return new CredentialReadError('the Keychain did not answer', true);
  }
  // A number is an exit code; anything else means the tool did not run at all.
  return typeof err.code === 'number'
    ? new CredentialReadError('Keychain access was denied', true)
    : unreadable(err.code);
}

/** The raw credentials text, or null when the Keychain has no such item. */
function readKeychain(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { timeout: 10000 },
      (err, stdout) => {
        if (!err) {
          resolve(stdout.trim());
          return;
        }
        const failure = classifyKeychainError(err);
        if (failure === 'missing') {
          resolve(null);
        } else {
          reject(failure);
        }
      }
    );
  });
}

/** The raw credentials text, or null when the file does not exist. Takes the path so tests can use temp files. */
export async function readCredentialsFile(file: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      return null;
    }
    throw unreadable(code);
  }
}

/**
 * Reads Claude Code's OAuth access token from the macOS Keychain, or from
 * ~/.claude/.credentials.json elsewhere. Returns null only when there are no
 * credentials to read (signed out, or using an API key): an expected state the
 * status bar shows. Every other failure throws a CredentialReadError.
 */
export async function readAccessToken(): Promise<string | null> {
  const raw = process.platform === 'darwin'
    ? await readKeychain()
    : await readCredentialsFile(path.join(os.homedir(), '.claude', '.credentials.json'));
  return raw === null ? null : parseAccessToken(raw);
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal; redirect?: 'error' }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Fetches the current usage windows. The token is sent only to USAGE_URL, and
 * a redirect is an error so it cannot follow one to another host. Every error
 * message here is fixed text: what fetch or the body parser report can quote
 * the token or the response, so none of it is passed on.
 */
export async function fetchUsage(
  token: string,
  fetchFn: FetchLike = (url, init) => fetch(url, init)
): Promise<Usage> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchFn(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
  } catch (err: unknown) {
    throw new Error(isTimeout(err) ? 'the usage request timed out' : 'network error');
  }
  if (!response.ok) {
    throw new Error(`usage request failed (HTTP ${response.status})`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err: unknown) {
    // The timeout signal also covers reading the body.
    throw new Error(isTimeout(err) ? 'the usage request timed out' : 'unexpected usage response');
  }
  const usage = parseUsage(body);
  if (!usage) {
    throw new Error('unexpected usage response');
  }
  return usage;
}
