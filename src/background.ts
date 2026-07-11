// Wasted Timer - Background Script
// Handles time tracking, storage, and messaging with content scripts

(function() {
  interface TimeData {
    siteTime: number;
    weeklyTotal: number;
  }

  interface Settings {
    resetDay: number;
    dailyLimitMinutes: number;
    weeklyLimitMinutes: number;
  }

  interface CheckTrackedResponse {
    isTracked: boolean;
    isSnoozed?: boolean;
    matchedPattern?: string;
    siteTime?: string;
    weeklyTotal?: string;
    siteTimeSeconds?: number;
    weeklyTotalSeconds?: number;
    dailyLimitSeconds?: number;
    weeklyLimitSeconds?: number;
  }

  interface GetTimeDataResponse {
    siteTime: string;
    weeklyTotal: string;
    siteTimeSeconds: number;
    weeklyTotalSeconds: number;
    dailyLimitSeconds: number;
    weeklyLimitSeconds: number;
  }

  interface Message {
    type: string;
    url?: string;
    serverUrl?: string;
    email?: string;
    password?: string;
    deviceName?: string;
    deviceId?: string;
  }

  interface TrackedPatterns {
    domains: string[];
    urls: string[];
  }

  interface PatternKeyIndexEntry {
    patternType: string;
    patternValue: string;
    date: string;
  }

  interface AuthStatusResponse {
    loggedIn: boolean;
    email?: string;
    serverUrl?: string;
  }

  interface DeviceInfo {
    deviceId: string;
    deviceName: string;
    createdAt: string;
    lastSeenAt: string;
    isCurrent: boolean;
  }

  interface WastedTimerSyncApi {
    start(): void;
    stop(): void;
    register(serverUrl: string, email: string, password: string, deviceName: string): Promise<void>;
    login(serverUrl: string, email: string, password: string, deviceName: string): Promise<void>;
    logout(): Promise<void>;
    getAuthStatus(): Promise<AuthStatusResponse>;
    listDevices(): Promise<{ devices: DeviceInfo[] }>;
    revokeDevice(deviceId: string): Promise<void>;
    pushPatternsNow(): Promise<void>;
    pushSettingsNow(): Promise<void>;
    shouldSuppressAutoSync(): boolean;
  }

  function getSync(): WastedTimerSyncApi {
    return (self as unknown as { WastedTimerSync: WastedTimerSyncApi }).WastedTimerSync;
  }

  let activeTabId: number | null = null;
  let activeTabUrl: string | null = null;
  let activeMatchedPattern: string | null = null;
  let trackedPatterns: TrackedPatterns = { domains: [], urls: [] };
  let settings: Settings = {
    resetDay: 0,
    dailyLimitMinutes: 60,
    weeklyLimitMinutes: 420
  };
  let patternKeyIndex: Record<string, PatternKeyIndexEntry> = {};
  const snoozeState: Record<number, number> = {}; // tabId -> snoozeEndTime

  // Initialize extension
  async function init(): Promise<void> {
    await loadTrackedPatterns();
    await loadSettings();
    await loadPatternKeyIndex();

    // Start the tracking interval
    setInterval(updateTime, 1000);

    // Listen for tab changes
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.tabs.onUpdated.addListener(handleTabUpdated);
    browser.windows.onFocusChanged.addListener(handleWindowFocusChanged);

    // Listen for messages from content scripts
    browser.runtime.onMessage.addListener(handleMessage);

    // Listen for storage changes (when options are updated)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.trackedDomains) {
          trackedPatterns.domains = changes.trackedDomains.newValue || [];
        }
        if (changes.trackedUrls) {
          trackedPatterns.urls = changes.trackedUrls.newValue || [];
        }
        if (changes.settings) {
          settings = changes.settings.newValue || settings;
        }

        // Immediately push local edits to the sync server, unless this change
        // was caused by sync.ts itself writing pulled remote state back in
        // (which would otherwise trigger an infinite push/pull loop).
        if (!getSync().shouldSuppressAutoSync()) {
          if (changes.trackedDomains || changes.trackedUrls) {
            void getSync().pushPatternsNow();
          }
          if (changes.settings) {
            void getSync().pushSettingsNow();
          }
        }
      }
    });

    // Start the periodic account sync loop (no-op until the user logs in)
    getSync().start();

    // Get the current active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id !== undefined) {
      activeTabId = tabs[0].id;
      activeTabUrl = tabs[0].url || null;
      activeMatchedPattern = getMatchedPattern(activeTabUrl);
    }
  }

  // Load tracked patterns from storage
  async function loadTrackedPatterns(): Promise<void> {
    const result = await browser.storage.sync.get(['trackedDomains', 'trackedUrls']);
    trackedPatterns.domains = (result.trackedDomains as string[]) || [];
    trackedPatterns.urls = (result.trackedUrls as string[]) || [];
  }

  // Load settings from storage
  async function loadSettings(): Promise<void> {
    const result = await browser.storage.sync.get(['settings']);
    if (result.settings) {
      settings = result.settings as Settings;
    }
  }

  // Load the pattern-key index (maps sanitized storage keys back to their
  // original pattern type/value, since getStorageKey's sanitization is lossy)
  async function loadPatternKeyIndex(): Promise<void> {
    const result = await browser.storage.local.get('patternKeyIndex');
    patternKeyIndex = (result.patternKeyIndex as Record<string, PatternKeyIndexEntry>) || {};
  }

  // Extract domain from URL
  function extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  // Extract path from URL (domain + pathname)
  function extractPath(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      return domain + urlObj.pathname;
    } catch {
      return null;
    }
  }

  // Check if URL matches any tracked pattern and return the matched pattern
  function getMatchedPattern(url: string | null): string | null {
    if (!url) return null;

    const domain = extractDomain(url);
    const path = extractPath(url);

    if (!domain || !path) return null;

    // Check URL patterns first (more specific)
    for (const trackedUrl of trackedPatterns.urls) {
      // Normalize the tracked URL for comparison
      const normalizedTracked = trackedUrl.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
      const normalizedPath = path.replace(/\/$/, '');

      if (normalizedPath === normalizedTracked || normalizedPath.startsWith(normalizedTracked + '/')) {
        return `url:${trackedUrl}`;
      }
    }

    // Check domain patterns
    for (const trackedDomain of trackedPatterns.domains) {
      if (domain === trackedDomain || domain.endsWith('.' + trackedDomain)) {
        return `domain:${trackedDomain}`;
      }
    }

    return null;
  }

  // Get the current week's start date based on configured reset day
  function getWeekStartDate(): string {
    const now = new Date();
    const currentDay = now.getDay();
    const resetDay = settings.resetDay;

    // Calculate days since the reset day
    let daysSinceReset = currentDay - resetDay;
    if (daysSinceReset < 0) {
      daysSinceReset += 7;
    }

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceReset);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart.toISOString().split('T')[0];
  }

  // Get today's date key
  function getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Get storage key for a pattern and date
  function getStorageKey(pattern: string, date: string): string {
    // Sanitize pattern for use as storage key
    const sanitized = pattern.replace(/[^a-zA-Z0-9:]/g, '_');
    return `time_${sanitized}_${date}`;
  }

  // Get storage key for a pattern/date's synced-from-other-devices seconds
  // (mirrors getStorageKey's sanitization; written by sync.ts, read here)
  function getRemoteStorageKey(pattern: string, date: string): string {
    const sanitized = pattern.replace(/[^a-zA-Z0-9:]/g, '_');
    return `remote_${sanitized}_${date}`;
  }

  // Update time for the active tab
  async function updateTime(): Promise<void> {
    if (!activeTabId || !activeTabUrl || !activeMatchedPattern) {
      return;
    }

    const today = getTodayKey();
    const storageKey = getStorageKey(activeMatchedPattern, today);

    // Get current time for this pattern/date
    const result = await browser.storage.local.get(storageKey);
    const currentTime = (result[storageKey] as number) || 0;

    // Increment by 1 second
    await browser.storage.local.set({ [storageKey]: currentTime + 1 });

    // Record which pattern/date this storage key represents, since the key
    // sanitization above is lossy - sync.ts needs this to push stats correctly.
    if (!(storageKey in patternKeyIndex)) {
      const colonIdx = activeMatchedPattern.indexOf(':');
      patternKeyIndex[storageKey] = {
        patternType: activeMatchedPattern.substring(0, colonIdx),
        patternValue: activeMatchedPattern.substring(colonIdx + 1),
        date: today
      };
      await browser.storage.local.set({ patternKeyIndex });
    }

    // Notify the content script to update the display
    try {
      await browser.tabs.sendMessage(activeTabId, {
        type: 'timeUpdate',
        pattern: activeMatchedPattern
      });
    } catch {
      // Content script might not be ready
    }
  }

  // Get time data for a pattern
  async function getTimeData(pattern: string): Promise<TimeData> {
    const today = getTodayKey();
    const weekStart = getWeekStartDate();

    // Get today's time for this pattern (local tracking + other devices' synced total)
    const todayKey = getStorageKey(pattern, today);
    const todayRemoteKey = getRemoteStorageKey(pattern, today);
    const todayResult = await browser.storage.local.get([todayKey, todayRemoteKey]);
    const siteTime = ((todayResult[todayKey] as number) || 0) + ((todayResult[todayRemoteKey] as number) || 0);

    // Calculate weekly total across all tracked patterns (local + synced remote)
    let weeklyTotal = 0;
    const allKeys = await browser.storage.local.get(null);

    for (const [key, value] of Object.entries(allKeys)) {
      if (key.startsWith('time_') || key.startsWith('remote_')) {
        const parts = key.split('_');
        const dateStr = parts[parts.length - 1];

        if (dateStr >= weekStart && dateStr <= today) {
          weeklyTotal += value as number;
        }
      }
    }

    return { siteTime, weeklyTotal };
  }

  // Format seconds to human-readable string
  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  // Handle tab activation
  async function handleTabActivated(activeInfo: browser.tabs._OnActivatedActiveInfo): Promise<void> {
    activeTabId = activeInfo.tabId;
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      activeTabUrl = tab.url || null;
      activeMatchedPattern = getMatchedPattern(activeTabUrl);
    } catch {
      activeTabUrl = null;
      activeMatchedPattern = null;
    }
  }

  // Handle tab URL updates
  function handleTabUpdated(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    _tab: browser.tabs.Tab
  ): void {
    if (tabId === activeTabId && changeInfo.url) {
      activeTabUrl = changeInfo.url;
      activeMatchedPattern = getMatchedPattern(activeTabUrl);
    }
  }

  // Handle window focus changes
  async function handleWindowFocusChanged(windowId: number): Promise<void> {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      // Browser lost focus
      activeTabId = null;
      activeTabUrl = null;
      activeMatchedPattern = null;
    } else {
      // Browser gained focus, get active tab
      const tabs = await browser.tabs.query({ active: true, windowId });
      if (tabs[0]?.id !== undefined) {
        activeTabId = tabs[0].id;
        activeTabUrl = tabs[0].url || null;
        activeMatchedPattern = getMatchedPattern(activeTabUrl);
      }
    }
  }

  interface AuthActionResponse {
    success: boolean;
    error?: string;
  }

  interface ListDevicesResponse {
    devices: DeviceInfo[];
    error?: string;
  }

  type HandleMessageResponse =
    | CheckTrackedResponse
    | GetTimeDataResponse
    | { success: boolean }
    | { isSnoozed: boolean }
    | AuthStatusResponse
    | AuthActionResponse
    | ListDevicesResponse
    | null;

  // Handle messages from content scripts
  function handleMessage(
    message: Message,
    sender: browser.runtime.MessageSender
  ): Promise<HandleMessageResponse> | undefined {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case 'checkTracked': {
        return (async (): Promise<CheckTrackedResponse> => {
          const matchedPattern = getMatchedPattern(message.url || '');
          const isTracked = matchedPattern !== null;
          const isSnoozed = tabId !== undefined && snoozeState[tabId] !== undefined && Date.now() < snoozeState[tabId];

          if (isTracked && matchedPattern) {
            const timeData = await getTimeData(matchedPattern);
            return {
              isTracked,
              isSnoozed,
              matchedPattern,
              siteTime: formatTime(timeData.siteTime),
              weeklyTotal: formatTime(timeData.weeklyTotal),
              siteTimeSeconds: timeData.siteTime,
              weeklyTotalSeconds: timeData.weeklyTotal,
              dailyLimitSeconds: settings.dailyLimitMinutes * 60,
              weeklyLimitSeconds: settings.weeklyLimitMinutes * 60
            };
          }
          return { isTracked: false };
        })();
      }

      case 'getTimeData': {
        return (async (): Promise<GetTimeDataResponse | null> => {
          const matchedPattern = getMatchedPattern(message.url || '');
          if (matchedPattern) {
            const timeData = await getTimeData(matchedPattern);
            return {
              siteTime: formatTime(timeData.siteTime),
              weeklyTotal: formatTime(timeData.weeklyTotal),
              siteTimeSeconds: timeData.siteTime,
              weeklyTotalSeconds: timeData.weeklyTotal,
              dailyLimitSeconds: settings.dailyLimitMinutes * 60,
              weeklyLimitSeconds: settings.weeklyLimitMinutes * 60
            };
          }
          return null;
        })();
      }

      case 'snooze': {
        if (tabId !== undefined) {
          // Set snooze for 10 minutes
          snoozeState[tabId] = Date.now() + (10 * 60 * 1000);
        }
        return Promise.resolve({ success: true });
      }

      case 'checkSnooze': {
        const isSnoozed = tabId !== undefined && snoozeState[tabId] !== undefined && Date.now() < snoozeState[tabId];
        if (!isSnoozed && tabId !== undefined && snoozeState[tabId] !== undefined) {
          delete snoozeState[tabId];
        }
        return Promise.resolve({ isSnoozed });
      }

      case 'unsnooze': {
        if (tabId !== undefined) {
          delete snoozeState[tabId];
        }
        return Promise.resolve({ success: true });
      }

      case 'authStatus': {
        return getSync().getAuthStatus();
      }

      case 'register': {
        return (async (): Promise<AuthActionResponse> => {
          try {
            await getSync().register(
              message.serverUrl || '',
              message.email || '',
              message.password || '',
              message.deviceName || ''
            );
            return { success: true };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Registration failed' };
          }
        })();
      }

      case 'login': {
        return (async (): Promise<AuthActionResponse> => {
          try {
            await getSync().login(
              message.serverUrl || '',
              message.email || '',
              message.password || '',
              message.deviceName || ''
            );
            return { success: true };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
          }
        })();
      }

      case 'logout': {
        return (async (): Promise<AuthActionResponse> => {
          await getSync().logout();
          return { success: true };
        })();
      }

      case 'listDevices': {
        return (async (): Promise<ListDevicesResponse> => {
          try {
            const result = await getSync().listDevices();
            return { devices: result.devices };
          } catch (err) {
            return { devices: [], error: err instanceof Error ? err.message : 'Failed to list devices' };
          }
        })();
      }

      case 'revokeDevice': {
        return (async (): Promise<AuthActionResponse> => {
          try {
            await getSync().revokeDevice(message.deviceId || '');
            return { success: true };
          } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Failed to revoke device' };
          }
        })();
      }
    }

    return undefined;
  }

  // Initialize
  init();
})();
