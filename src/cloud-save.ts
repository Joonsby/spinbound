/// <reference types="vite/client" />
import { getOperationalEnvironment, User } from '@apps-in-toss/web-framework';
import { getPlayerProgress, onPlayerProgressSaved, recoverPlayerProgress, savePlayerProgress, type PlayerProgress } from './progress';
import { mergeProgress, sameProgress, toSynced } from './progress-merge';

// Per-player copy of the progress on spinbound-api, keyed by the Toss user. Only runs inside
// Toss; local storage stays the working copy, so the game never waits on the network.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'https://spinbound.fit-plate.com';
const STATE_KEY = 'spinbound:cloud-save:v1';
const UPLOAD_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 8000;
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

type CloudState = { token?: string; tokenExpiresAt?: string; serverVersion: number; dirty: boolean };
type Remote = { data: unknown; version: number; updatedAt: string };

class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`spinbound-api ${status}`);
    this.status = status;
    this.body = body;
  }
}

let state = readState();
let applying = false;
let running: Promise<void> | undefined;
let again = false;
let timer: number | undefined;
let onRemoteApplied = () => {};

function readState(): CloudState {
  try {
    const stored = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as CloudState | null;
    if (stored && typeof stored.serverVersion === 'number') return stored;
  } catch { /* fall through */ }
  // First run on this device: whatever is saved locally has never been uploaded.
  return { serverVersion: 0, dirty: true };
}

function writeState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

async function request(method: string, path: string, body?: unknown, auth = true): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth && state.token) headers.authorization = `Bearer ${state.token}`;
    const response = await fetch(API_BASE + path, { method, headers, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) throw new ApiError(response.status, json);
    return json;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function login() {
  const { code } = await User.createAnonymousKeyAuthCode();
  const session = await request('POST', '/v1/auth/toss', { authCode: code }, false) as { token: string; expiresAt: string };
  state.token = session.token;
  state.tokenExpiresAt = session.expiresAt;
  writeState();
}

// Runs `call` with a valid session, logging in again once if the server rejects the token.
async function authed<T>(call: () => Promise<T>): Promise<T> {
  if (!state.token || !(Date.parse(state.tokenExpiresAt ?? '') - Date.now() > RENEW_BEFORE_MS)) await login();
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
    await login();
    return call();
  }
}

function apply(next: PlayerProgress) {
  applying = true;
  try { savePlayerProgress(next); } finally { applying = false; }
  onRemoteApplied();
}

// Server copy wins while nothing changed here since the last sync; otherwise the two merge.
// The result is uploaded based on the server's version, and a lost race (409) merges again.
async function reconcile(remote: Remote | undefined, attempt = 0): Promise<void> {
  const local = getPlayerProgress();
  let target = local;
  if (remote) {
    const remoteProgress = recoverPlayerProgress({ ...(remote.data as object), soundEnabled: local.soundEnabled, graphicsQuality: local.graphicsQuality });
    target = state.dirty ? mergeProgress(local, toSynced(remoteProgress)) : remoteProgress;
    if (!sameProgress(target, local)) apply(target);
    if (sameProgress(target, remoteProgress)) {
      state.serverVersion = remote.version;
      state.dirty = false;
      writeState();
      return;
    }
  }
  try {
    const saved = await authed(() => request('PUT', '/v1/progress', { data: toSynced(target), baseVersion: remote?.version ?? 0 })) as { version: number };
    state.serverVersion = saved.version;
    state.dirty = !sameProgress(getPlayerProgress(), target);
    writeState();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409 && attempt < 2)) throw error;
    state.dirty = true;
    const current = (error.body as { current?: Remote | null } | undefined)?.current ?? undefined;
    await reconcile(current, attempt + 1);
  }
}

async function sync() {
  const remote = await authed(async () => {
    try {
      return await request('GET', '/v1/progress') as Remote;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  });
  await reconcile(remote);
}

function run() {
  running ??= sync()
    .catch((error: unknown) => console.warn('[cloud-save] 동기화하지 못했습니다:', error instanceof Error ? error.message : error))
    .finally(() => {
      running = undefined;
      if (again) { again = false; schedule(); }
    });
  return running;
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { void run(); }, UPLOAD_DELAY_MS);
}

// `refresh` redraws whatever shows the progress after the cloud copy replaced it.
export function startCloudSave(refresh: () => void) {
  let environment: string;
  try { environment = getOperationalEnvironment(); } catch { return; }
  if (environment !== 'toss' && environment !== 'sandbox') return;
  onRemoteApplied = refresh;
  let lastSaved = JSON.stringify(toSynced(getPlayerProgress()));
  onPlayerProgressSaved((value) => {
    const json = JSON.stringify(toSynced(value));
    if (applying || json === lastSaved) return;
    lastSaved = json;
    state.dirty = true;
    writeState();
    if (running) again = true;
    else schedule();
  });
  // Retry unsent changes when the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.dirty) void run(); });
  void run();
}
