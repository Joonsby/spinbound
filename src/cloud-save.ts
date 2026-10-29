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
    super(`서버 응답 ${status} ${(body as { error?: string } | undefined)?.error ?? ''}`.trim());
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
// Shown in Settings so a failed sync can be read on the device.
let status: { state: 'off' | 'syncing' | 'synced' | 'error'; detail?: string; at?: Date } = { state: 'off' };

const describe = (error: unknown) => {
  if (error instanceof Error) return error.name === 'AbortError' ? '응답 시간 초과' : error.message;
  if (typeof error === 'object' && error !== null) return JSON.stringify(error);
  return String(error);
};

const withTimeout = <T>(promise: Promise<T>, label: string) => Promise.race([
  promise,
  new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(`${label}: 응답 없음`)), REQUEST_TIMEOUT_MS)),
]);

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
    let response: Response;
    try {
      response = await fetch(API_BASE + path, { method, headers, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new Error(`서버 연결 실패 (${method} ${path}): ${describe(error)}`);
    }
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) throw new ApiError(response.status, json);
    return json;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function login() {
  let code: string;
  try {
    ({ code } = await withTimeout(User.createAnonymousKeyAuthCode(), '토스 인증 코드'));
  } catch (error) {
    throw new Error(`토스 인증 코드 발급 실패: ${describe(error)}`);
  }
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
  if (running) return running;
  status = { state: 'syncing' };
  running = sync()
    .then(() => { status = { state: 'synced', at: new Date() }; })
    .catch((error: unknown) => {
      status = { state: 'error', detail: describe(error), at: new Date() };
      console.warn('[cloud-save] 동기화하지 못했습니다:', status.detail);
    })
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

export function cloudSaveStatusText() {
  const time = status.at?.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) ?? '';
  if (status.state === 'off') return '토스 앱에서 실행하면 진행 데이터가 서버에도 저장돼요';
  if (status.state === 'syncing') return '동기화 중…';
  if (status.state === 'synced') return `서버에 저장됨 · ${time}`;
  return `동기화 실패 · ${time} · ${status.detail}`;
}

export function syncCloudSaveNow() {
  return status.state === 'off' ? Promise.resolve() : run();
}

// `refresh` redraws whatever shows the progress after the cloud copy replaced it.
export function startCloudSave(refresh: () => void) {
  let environment: string;
  try { environment = getOperationalEnvironment(); } catch { return; }
  if (environment !== 'toss' && environment !== 'sandbox') return;
  status = { state: 'syncing' };
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
