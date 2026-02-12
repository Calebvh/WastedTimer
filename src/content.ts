// Wasted Timer - Content Script
// Injects and manages the overlay on tracked websites

(function() {
  interface TimeDataResponse {
    siteTime: string;
    weeklyTotal: string;
  }

  interface CheckTrackedResponse {
    isTracked: boolean;
    isSnoozed?: boolean;
    domain?: string;
    siteTime?: string;
    weeklyTotal?: string;
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
        weeklyTotal: response.weeklyTotal
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
