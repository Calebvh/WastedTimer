// Wasted Timer - Content Script
// Injects and manages the overlay on tracked websites

(function() {
  interface TimeDataResponse {
    siteTime: string;
    weeklyTotal: string;
    siteTimeSeconds: number;
    weeklyTotalSeconds: number;
    dailyLimitSeconds: number;
    weeklyLimitSeconds: number;
  }

  interface CheckTrackedResponse {
    isTracked: boolean;
    isSnoozed?: boolean;
    domain?: string;
    siteTime?: string;
    weeklyTotal?: string;
    siteTimeSeconds?: number;
    weeklyTotalSeconds?: number;
    dailyLimitSeconds?: number;
    weeklyLimitSeconds?: number;
  }

  interface CheckSnoozeResponse {
    isSnoozed: boolean;
  }

  interface TimeUpdateMessage {
    type: 'timeUpdate';
    domain: string;
  }

  let overlay: HTMLDivElement | null = null;
  let minimizedIcon: HTMLDivElement | null = null;
  let isMinimized = false;
  let snoozeCheckInterval: number | null = null;

  // Calculate color based on usage ratio (0 to 1+)
  // 0-0.3: green, 0.3-0.6: yellow, 0.6-1.0: orange, 1.0+: red
  function getColorForRatio(ratio: number): string {
    if (ratio >= 1.0) {
      return '#ff5252'; // Red - over limit
    } else if (ratio >= 0.6) {
      // Orange range (0.6 to 1.0)
      const t = (ratio - 0.6) / 0.4;
      const r = 255;
      const g = Math.round(152 - (152 - 82) * t);
      const b = Math.round(0 + 82 * (1 - t));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (ratio >= 0.3) {
      // Yellow range (0.3 to 0.6)
      const t = (ratio - 0.3) / 0.3;
      const r = 255;
      const g = Math.round(235 - (235 - 152) * t);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Green range (0 to 0.3)
      const t = ratio / 0.3;
      const r = Math.round(76 + (255 - 76) * t);
      const g = Math.round(175 + (235 - 175) * t);
      const b = Math.round(80 - 80 * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Update the color styling for time values
  function updateColors(
    siteTimeSeconds: number,
    weeklyTotalSeconds: number,
    dailyLimitSeconds: number,
    weeklyLimitSeconds: number
  ): void {
    const siteEl = document.getElementById('wasted-timer-site');
    const weeklyEl = document.getElementById('wasted-timer-weekly');

    if (siteEl) {
      const dailyRatio = siteTimeSeconds / dailyLimitSeconds;
      const color = getColorForRatio(dailyRatio);
      siteEl.style.color = color;
      if (dailyRatio >= 1.0) {
        siteEl.style.fontWeight = '700';
      } else {
        siteEl.style.fontWeight = '600';
      }
    }

    if (weeklyEl) {
      const weeklyRatio = weeklyTotalSeconds / weeklyLimitSeconds;
      const color = getColorForRatio(weeklyRatio);
      weeklyEl.style.color = color;
      if (weeklyRatio >= 1.0) {
        weeklyEl.style.fontWeight = '700';
      } else {
        weeklyEl.style.fontWeight = '600';
      }
    }
  }

  // Initialize
  async function init(): Promise<void> {
    const response = await browser.runtime.sendMessage({
      type: 'checkTracked',
      url: window.location.href
    }) as CheckTrackedResponse;

    if (response && response.isTracked) {
      if (response.isSnoozed) {
        isMinimized = true;
        createMinimizedIcon();
        startSnoozeCheck();
      } else {
        createOverlay(response);
      }
    }
  }

  // Create the main overlay
  function createOverlay(data: CheckTrackedResponse): void {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'wasted-timer-overlay';
    overlay.innerHTML = `
      <div class="wasted-timer-header">
        <span class="wasted-timer-title">Time Tracker</span>
        <button class="wasted-timer-minimize" title="Minimize (10 min snooze)">−</button>
      </div>
      <div class="wasted-timer-content">
        <div class="wasted-timer-row">
          <span class="wasted-timer-label">This site today:</span>
          <span class="wasted-timer-value" id="wasted-timer-site">${data.siteTime || '0s'}</span>
        </div>
        <div class="wasted-timer-row">
          <span class="wasted-timer-label">Weekly total:</span>
          <span class="wasted-timer-value" id="wasted-timer-weekly">${data.weeklyTotal || '0s'}</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Apply initial colors
    if (data.siteTimeSeconds !== undefined && data.weeklyTotalSeconds !== undefined &&
        data.dailyLimitSeconds !== undefined && data.weeklyLimitSeconds !== undefined) {
      updateColors(
        data.siteTimeSeconds,
        data.weeklyTotalSeconds,
        data.dailyLimitSeconds,
        data.weeklyLimitSeconds
      );
    }

    // Add minimize button handler
    const minimizeBtn = overlay.querySelector('.wasted-timer-minimize');
    minimizeBtn?.addEventListener('click', handleMinimize);
  }

  // Create minimized icon
  function createMinimizedIcon(): void {
    if (minimizedIcon) return;

    minimizedIcon = document.createElement('div');
    minimizedIcon.id = 'wasted-timer-minimized';
    minimizedIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
        <polyline points="12,6 12,12 16,14" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;
    minimizedIcon.title = 'Click to show time tracker';

    document.body.appendChild(minimizedIcon);

    minimizedIcon.addEventListener('click', handleUnminimize);
  }

  // Handle minimize button click
  async function handleMinimize(): Promise<void> {
    isMinimized = true;

    // Tell background to start snooze timer
    await browser.runtime.sendMessage({ type: 'snooze' });

    // Hide overlay, show minimized icon
    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    createMinimizedIcon();
    startSnoozeCheck();
  }

  // Handle unminimize (click on minimized icon)
  async function handleUnminimize(): Promise<void> {
    isMinimized = false;

    // Tell background to cancel snooze
    await browser.runtime.sendMessage({ type: 'unsnooze' });

    // Stop snooze check
    if (snoozeCheckInterval !== null) {
      clearInterval(snoozeCheckInterval);
      snoozeCheckInterval = null;
    }

    // Hide minimized icon, show overlay
    if (minimizedIcon) {
      minimizedIcon.remove();
      minimizedIcon = null;
    }

    const response = await browser.runtime.sendMessage({
      type: 'getTimeData',
      url: window.location.href
    }) as TimeDataResponse | null;

    if (response) {
      createOverlay({
        isTracked: true,
        siteTime: response.siteTime,
        weeklyTotal: response.weeklyTotal,
        siteTimeSeconds: response.siteTimeSeconds,
        weeklyTotalSeconds: response.weeklyTotalSeconds,
        dailyLimitSeconds: response.dailyLimitSeconds,
        weeklyLimitSeconds: response.weeklyLimitSeconds
      });
    }
  }

  // Start checking if snooze has expired
  function startSnoozeCheck(): void {
    if (snoozeCheckInterval !== null) return;

    snoozeCheckInterval = window.setInterval(async () => {
      const response = await browser.runtime.sendMessage({ type: 'checkSnooze' }) as CheckSnoozeResponse;

      if (!response.isSnoozed && isMinimized) {
        // Snooze expired, show overlay
        handleUnminimize();
      }
    }, 5000); // Check every 5 seconds
  }

  // Update the overlay with new time data
  async function updateOverlay(): Promise<void> {
    if (!overlay || isMinimized) return;

    const response = await browser.runtime.sendMessage({
      type: 'getTimeData',
      url: window.location.href
    }) as TimeDataResponse | null;

    if (response) {
      const siteEl = document.getElementById('wasted-timer-site');
      const weeklyEl = document.getElementById('wasted-timer-weekly');

      if (siteEl) siteEl.textContent = response.siteTime;
      if (weeklyEl) weeklyEl.textContent = response.weeklyTotal;

      // Update colors based on limits
      updateColors(
        response.siteTimeSeconds,
        response.weeklyTotalSeconds,
        response.dailyLimitSeconds,
        response.weeklyLimitSeconds
      );
    }
  }

  // Listen for time update messages from background
  browser.runtime.onMessage.addListener((message: TimeUpdateMessage) => {
    if (message.type === 'timeUpdate') {
      updateOverlay();
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
