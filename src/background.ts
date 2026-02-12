// Wasted Timer - Background Script
// Handles time tracking, storage, and messaging with content scripts

(function() {
  interface TimeData {
    siteTime: number;
    weeklyTotal: number;
  }

  interface CheckTrackedResponse {
    isTracked: boolean;
    isSnoozed?: boolean;
    matchedPattern?: string;
    siteTime?: string;
    weeklyTotal?: string;
  }

  interface GetTimeDataResponse {
    siteTime: string;
    weeklyTotal: string;
  }

  interface Message {
    type: string;
    url?: string;
  }

  interface TrackedPatterns {
    domains: string[];
    urls: string[];
  }

  let activeTabId: number | null = null;
  let activeTabUrl: string | null = null;
  let activeMatchedPattern: string | null = null;
  let trackedPatterns: TrackedPatterns = { domains: [], urls: [] };
  const snoozeState: Record<number, number> = {}; // tabId -> snoozeEndTime

  // Initialize extension
  async function init(): Promise<void> {
    await loadTrackedPatterns();

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
      }
    });

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

  // Get the current week's start date (Sunday)
  function getWeekStartDate(): string {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const diff = now.getDate() - day;
    const weekStart = new Date(now);
    weekStart.setDate(diff);
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

    // Get today's time for this pattern
    const todayKey = getStorageKey(pattern, today);
    const todayResult = await browser.storage.local.get(todayKey);
    const siteTime = (todayResult[todayKey] as number) || 0;

    // Calculate weekly total across all tracked patterns
    let weeklyTotal = 0;
    const allKeys = await browser.storage.local.get(null);

    for (const [key, value] of Object.entries(allKeys)) {
      if (key.startsWith('time_')) {
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

  // Handle messages from content scripts
  function handleMessage(
    message: Message,
    sender: browser.runtime.MessageSender
  ): Promise<CheckTrackedResponse | GetTimeDataResponse | { success: boolean } | { isSnoozed: boolean } | null> | undefined {
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
              weeklyTotal: formatTime(timeData.weeklyTotal)
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
              weeklyTotal: formatTime(timeData.weeklyTotal)
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
    }

    return undefined;
  }

  // Initialize
  init();
})();
