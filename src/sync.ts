// Wasted Timer - Sync Script
// Handles account auth (JWT) and periodic sync of settings/patterns/stats with a
// self-hosted WastedTimer backend. Loaded as a classic background script (no ES
// modules, same as background.ts/content.ts) and exposes its API on the shared
// background-page global as `WastedTimerSync`.

(function () {
  interface AuthState {
    serverUrl: string;
    email: string;
    userId: string;
    deviceId: string;
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshToken: string;
  }

  interface Settings {
    resetDay: number;
    dailyLimitMinutes: number;
    weeklyLimitMinutes: number;
  }

  type PatternType = 'domain' | 'url';

  interface PatternDto {
    patternType: PatternType;
    patternValue: string;
    active: boolean;
    updatedAt: string;
  }

  interface PatternKeyIndexEntry {
    patternType: string;
    patternValue: string;
    date: string;
  }

  interface DeviceInfo {
    deviceId: string;
    deviceName: string;
    createdAt: string;
    lastSeenAt: string;
    isCurrent: boolean;
  }

  interface AuthStatus {
    loggedIn: boolean;
    email?: string;
    serverUrl?: string;
  }

  const BASE_INTERVAL_MS = 45_000;
  const MAX_BACKOFF_MS = 180_000;
  const REMOTE_SUPPRESS_WINDOW_MS = 1_000;

  const AUTH_KEYS = [
    'auth.serverUrl',
    'auth.email',
    'auth.userId',
    'auth.deviceId',
    'auth.accessToken',
    'auth.accessTokenExpiresAt',
    'auth.refreshToken'
  ];

  let authState: AuthState | null = null;
  let currentIntervalMs = BASE_INTERVAL_MS;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressAutoSyncUntil = 0;

  // ---- auth state persistence (per-device, storage.local only - never storage.sync) ----

  async function loadAuthState(): Promise<AuthState | null> {
    const result = await browser.storage.local.get(AUTH_KEYS);
    if (!result['auth.accessToken'] || !result['auth.refreshToken']) {
      return null;
    }
    return {
      serverUrl: result['auth.serverUrl'] as string,
      email: result['auth.email'] as string,
      userId: result['auth.userId'] as string,
      deviceId: result['auth.deviceId'] as string,
      accessToken: result['auth.accessToken'] as string,
      accessTokenExpiresAt: result['auth.accessTokenExpiresAt'] as string,
      refreshToken: result['auth.refreshToken'] as string
    };
  }

  async function saveAuthState(state: AuthState): Promise<void> {
    authState = state;
    await browser.storage.local.set({
      'auth.serverUrl': state.serverUrl,
      'auth.email': state.email,
      'auth.userId': state.userId,
      'auth.deviceId': state.deviceId,
      'auth.accessToken': state.accessToken,
      'auth.accessTokenExpiresAt': state.accessTokenExpiresAt,
      'auth.refreshToken': state.refreshToken
    });
  }

  async function clearAuthState(): Promise<void> {
    authState = null;
    await browser.storage.local.remove(AUTH_KEYS);
  }

  async function ensureAuthLoaded(): Promise<void> {
    if (authState === null) {
      authState = await loadAuthState();
    }
  }

  // ---- HTTP helpers ----

  async function extractError(response: Response): Promise<string> {
    try {
      const data = await response.json() as { message?: string };
      if (data && data.message) return data.message;
    } catch {
      // fall through
    }
    return `Request failed (${response.status})`;
  }

  async function tryRefresh(): Promise<boolean> {
    if (!authState) return false;
    try {
      const response = await fetch(`${authState.serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: authState.refreshToken })
      });

      if (!response.ok) {
        // Refresh token itself is invalid/expired/revoked - the session is dead.
        await clearAuthState();
        return false;
      }

      const data = await response.json() as {
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
      };

      await saveAuthState({
        ...authState,
        accessToken: data.accessToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
        refreshToken: data.refreshToken
      });
      return true;
    } catch {
      // Network error - leave the session alone, just fail this sync attempt.
      return false;
    }
  }

  async function apiFetch(path: string, method: string, body?: unknown, isRetry = false): Promise<Response> {
    if (!authState) throw new Error('Not authenticated');

    const response = await fetch(`${authState.serverUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authState.accessToken}`
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (response.status === 401 && !isRetry) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return apiFetch(path, method, body, true);
      }
    }

    return response;
  }

  // ---- pattern <-> storage key helpers (mirrors background.ts's getStorageKey) ----

  function sanitizeForKey(pattern: string): string {
    return pattern.replace(/[^a-zA-Z0-9:]/g, '_');
  }

  function remoteStorageKey(patternType: string, patternValue: string, date: string): string {
    const sanitized = sanitizeForKey(`${patternType}:${patternValue}`);
    return `remote_${sanitized}_${date}`;
  }

  // ---- login-time / periodic reconciliation ----

  async function markSuppressed(): Promise<void> {
    suppressAutoSyncUntil = Date.now() + REMOTE_SUPPRESS_WINDOW_MS;
  }

  function activePatternDtos(domains: string[], urls: string[], updatedAt: string): PatternDto[] {
    return [
      ...domains.map((d): PatternDto => ({ patternType: 'domain', patternValue: d, active: true, updatedAt })),
      ...urls.map((u): PatternDto => ({ patternType: 'url', patternValue: u, active: true, updatedAt }))
    ];
  }

  async function getLocalPatterns(): Promise<{ domains: string[]; urls: string[] }> {
    const result = await browser.storage.sync.get(['trackedDomains', 'trackedUrls']);
    return {
      domains: (result.trackedDomains as string[]) || [],
      urls: (result.trackedUrls as string[]) || []
    };
  }

  async function getLocalSettings(): Promise<Settings | null> {
    const result = await browser.storage.sync.get(['settings']);
    return (result.settings as Settings) || null;
  }

  async function getKnownPatternKeys(): Promise<Set<string>> {
    const result = await browser.storage.local.get('sync.knownPatternKeys');
    const keys = (result['sync.knownPatternKeys'] as string[]) || [];
    return new Set(keys);
  }

  async function setKnownPatternKeys(keys: Set<string>): Promise<void> {
    await browser.storage.local.set({ 'sync.knownPatternKeys': Array.from(keys) });
  }

  async function applyPulledPatterns(patterns: PatternDto[]): Promise<void> {
    const domains = patterns
      .filter((p) => p.patternType === 'domain' && p.active)
      .map((p) => p.patternValue)
      .sort();
    const urls = patterns
      .filter((p) => p.patternType === 'url' && p.active)
      .map((p) => p.patternValue)
      .sort();

    const local = await getLocalPatterns();
    const changed =
      JSON.stringify(local.domains.slice().sort()) !== JSON.stringify(domains) ||
      JSON.stringify(local.urls.slice().sort()) !== JSON.stringify(urls);

    if (changed) {
      await markSuppressed();
      await browser.storage.sync.set({ trackedDomains: domains, trackedUrls: urls });
    }

    const activeKeys = new Set(patterns.filter((p) => p.active).map((p) => `${p.patternType}:${p.patternValue}`));
    await setKnownPatternKeys(activeKeys);
  }

  async function applyPulledSettings(settings: Settings): Promise<void> {
    const local = await getLocalSettings();
    if (local && JSON.stringify(local) === JSON.stringify(settings)) return;

    await markSuppressed();
    await browser.storage.sync.set({ settings });
  }

  /**
   * Pushes only what actually changed locally since the last known-good server
   * state - newly-added patterns (active:true) and newly-removed ones (tombstoned)
   * - then pulls the merged authoritative list back so cross-device adds/removes
   * show up locally too.
   *
   * Deliberately does NOT resend already-known-active patterns on every call: doing
   * so would stamp them with a fresh updatedAt on every sync tick, which (since the
   * server's row-level merge is last-write-wins) would silently resurrect a pattern
   * another device had just tombstoned, because this device's resend would look
   * newer than that device's removal.
   */
  async function pushPatternsNow(): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) return;

    const { domains, urls } = await getLocalPatterns();
    const now = new Date().toISOString();
    const current = activePatternDtos(domains, urls, now);
    const currentKeys = new Set(current.map((p) => `${p.patternType}:${p.patternValue}`));

    const known = await getKnownPatternKeys();

    const added = current.filter((p) => !known.has(`${p.patternType}:${p.patternValue}`));
    const removed: PatternDto[] = Array.from(known)
      .filter((key) => !currentKeys.has(key))
      .map((key) => {
        const idx = key.indexOf(':');
        return {
          patternType: key.substring(0, idx) as PatternType,
          patternValue: key.substring(idx + 1),
          active: false,
          updatedAt: now
        };
      });

    const patches = [...added, ...removed];

    try {
      if (patches.length > 0) {
        const response = await apiFetch('/api/patterns', 'PUT', { patterns: patches });
        if (response.ok) {
          await setKnownPatternKeys(currentKeys);
        }
      }
      // Always pull, even when there was nothing local to push - this is what lets a
      // brand-new device (no local patterns yet) receive an account's existing patterns.
      await pullPatternsNow();
    } catch {
      // offline - the periodic tick will retry
    }
  }

  async function pullPatternsNow(): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) return;
    try {
      const response = await apiFetch('/api/patterns', 'GET');
      if (!response.ok) return;
      const data = await response.json() as { patterns: PatternDto[] };
      await applyPulledPatterns(data.patterns);
    } catch {
      // offline - the periodic tick will retry
    }
  }

  async function pushSettingsNow(): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) return;

    const settings = await getLocalSettings();
    if (!settings) return;

    try {
      await apiFetch('/api/settings', 'PUT', settings);
    } catch {
      // offline - the periodic tick will retry
    }
  }

  async function pullSettingsNow(): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) return;
    try {
      const response = await apiFetch('/api/settings', 'GET');
      if (response.status === 404) return; // nothing set server-side yet
      if (!response.ok) return;
      const data = await response.json() as Settings;
      await applyPulledSettings(data);
    } catch {
      // offline - the periodic tick will retry
    }
  }

  // Mirrors background.ts's getWeekStartDate() day-of-week arithmetic exactly, so
  // the set of dates considered "this week" here matches what the overlay displays.
  function getWeekDates(resetDay: number): string[] {
    const now = new Date();
    const currentDay = now.getDay();
    let daysSinceReset = currentDay - resetDay;
    if (daysSinceReset < 0) daysSinceReset += 7;

    const dates: string[] = [];
    for (let i = daysSinceReset; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  async function syncStatsOnce(): Promise<boolean> {
    await ensureAuthLoaded();
    if (!authState) return true; // not logged in - nothing to do, not a failure

    const [indexResult, allLocal, patternsLocal, settingsLocal] = await Promise.all([
      browser.storage.local.get('patternKeyIndex'),
      browser.storage.local.get(null),
      getLocalPatterns(),
      getLocalSettings()
    ]);

    const patternKeyIndex = (indexResult.patternKeyIndex as Record<string, PatternKeyIndexEntry>) || {};
    const weekDates = getWeekDates(settingsLocal ? settingsLocal.resetDay : 0);
    const weekDateSet = new Set(weekDates);

    const entries: { patternType: PatternType; patternValue: string; date: string; seconds: number }[] = [];
    for (const [key, value] of Object.entries(allLocal)) {
      if (!key.startsWith('time_')) continue;
      const meta = patternKeyIndex[key];
      if (!meta) continue;
      if (!weekDateSet.has(meta.date)) continue;
      entries.push({
        patternType: meta.patternType as PatternType,
        patternValue: meta.patternValue,
        date: meta.date,
        seconds: (value as number) || 0
      });
    }

    const coveredKeys = new Set(entries.map((e) => `${e.patternType}:${e.patternValue}:${e.date}`));
    const pullTargets: { patternType: PatternType; patternValue: string; date: string }[] = [];
    const activePatterns: { patternType: PatternType; patternValue: string }[] = [
      ...patternsLocal.domains.map((d): { patternType: PatternType; patternValue: string } => ({ patternType: 'domain', patternValue: d })),
      ...patternsLocal.urls.map((u): { patternType: PatternType; patternValue: string } => ({ patternType: 'url', patternValue: u }))
    ];
    for (const p of activePatterns) {
      for (const date of weekDates) {
        const key = `${p.patternType}:${p.patternValue}:${date}`;
        if (!coveredKeys.has(key)) {
          pullTargets.push({ patternType: p.patternType, patternValue: p.patternValue, date });
        }
      }
    }

    try {
      const response = await apiFetch('/api/stats/sync', 'POST', { entries, pullTargets });
      if (!response.ok) return false;

      const data = await response.json() as {
        totals: { patternType: PatternType; patternValue: string; date: string; otherDevicesSeconds: number }[];
      };

      const remoteUpdates: Record<string, number> = {};
      for (const total of data.totals) {
        const key = remoteStorageKey(total.patternType, total.patternValue, total.date);
        remoteUpdates[key] = total.otherDevicesSeconds;
      }
      if (Object.keys(remoteUpdates).length > 0) {
        await browser.storage.local.set(remoteUpdates);
      }
      return true;
    } catch {
      return false;
    }
  }

  // ---- periodic sync loop with exponential backoff ----

  async function runSyncTick(): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) {
      scheduleNext(BASE_INTERVAL_MS);
      return;
    }

    let ok = true;
    try {
      await pullSettingsNow();
      await pullPatternsNow();
      const statsOk = await syncStatsOnce();
      ok = ok && statsOk;
    } catch {
      ok = false;
    }

    currentIntervalMs = ok ? BASE_INTERVAL_MS : Math.min(currentIntervalMs * 2, MAX_BACKOFF_MS);
    scheduleNext(currentIntervalMs);
  }

  function scheduleNext(delayMs: number): void {
    if (syncTimer !== null) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      void runSyncTick();
    }, delayMs);
  }

  function stopSyncTimer(): void {
    if (syncTimer !== null) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    currentIntervalMs = BASE_INTERVAL_MS;
  }

  function start(): void {
    scheduleNext(currentIntervalMs);
  }

  // ---- login-time reconciliation (see plan: push-then-pull ordering matters) ----

  async function reconcileAfterAuth(): Promise<void> {
    if (!authState) return;

    await pushPatternsNow(); // unions this device's pre-existing local patterns into the server, then pulls merged

    const localSettings = await getLocalSettings();
    try {
      const response = await apiFetch('/api/settings', 'GET');
      if (response.status === 404) {
        if (localSettings) {
          await apiFetch('/api/settings', 'PUT', localSettings);
        }
      } else if (response.ok) {
        const remoteSettings = await response.json() as Settings;
        await applyPulledSettings(remoteSettings);
      }
    } catch {
      // offline - periodic tick will retry
    }

    await syncStatsOnce();
  }

  // ---- public API ----

  async function register(serverUrl: string, email: string, password: string, deviceName: string): Promise<void> {
    const response = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceName })
    });
    if (!response.ok) throw new Error(await extractError(response));

    const data = await response.json() as {
      userId: string;
      deviceId: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
    };

    await saveAuthState({ serverUrl, email, ...data });
    await reconcileAfterAuth();
    currentIntervalMs = BASE_INTERVAL_MS;
    scheduleNext(currentIntervalMs);
  }

  async function login(serverUrl: string, email: string, password: string, deviceName: string): Promise<void> {
    await ensureAuthLoaded();
    const existingDeviceId = authState && authState.serverUrl === serverUrl ? authState.deviceId : undefined;

    const response = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceName, deviceId: existingDeviceId })
    });
    if (!response.ok) throw new Error(await extractError(response));

    const data = await response.json() as {
      userId: string;
      deviceId: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
    };

    await saveAuthState({ serverUrl, email, ...data });
    await reconcileAfterAuth();
    currentIntervalMs = BASE_INTERVAL_MS;
    scheduleNext(currentIntervalMs);
  }

  async function logout(): Promise<void> {
    await ensureAuthLoaded();
    if (authState) {
      try {
        await fetch(`${authState.serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: authState.refreshToken })
        });
      } catch {
        // best-effort; clear local session regardless
      }
    }
    await clearAuthState();
  }

  async function getAuthStatus(): Promise<AuthStatus> {
    await ensureAuthLoaded();
    if (!authState) return { loggedIn: false };
    return { loggedIn: true, email: authState.email, serverUrl: authState.serverUrl };
  }

  async function listDevices(): Promise<{ devices: DeviceInfo[] }> {
    await ensureAuthLoaded();
    if (!authState) throw new Error('Not authenticated');
    const response = await apiFetch('/api/devices', 'GET');
    if (!response.ok) throw new Error(await extractError(response));
    return response.json() as Promise<{ devices: DeviceInfo[] }>;
  }

  async function revokeDevice(deviceId: string): Promise<void> {
    await ensureAuthLoaded();
    if (!authState) throw new Error('Not authenticated');
    const response = await apiFetch(`/api/devices/${deviceId}`, 'DELETE');
    if (!response.ok && response.status !== 204) throw new Error(await extractError(response));
  }

  function shouldSuppressAutoSync(): boolean {
    return Date.now() < suppressAutoSyncUntil;
  }

  (self as unknown as Record<string, unknown>).WastedTimerSync = {
    start,
    stop: stopSyncTimer,
    register,
    login,
    logout,
    getAuthStatus,
    listDevices,
    revokeDevice,
    pushPatternsNow,
    pushSettingsNow,
    shouldSuppressAutoSync
  };
})();
