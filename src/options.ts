// Wasted Timer - Options Script
// Manages the settings page for configuring tracked domains, URLs, and limits

(function() {
  let trackedDomains: string[] = [];
  let trackedUrls: string[] = [];
  let settings: Settings = {
    resetDay: 0, // Sunday
    dailyLimitMinutes: 60,
    weeklyLimitMinutes: 420
  };

  interface Settings {
    resetDay: number;
    dailyLimitMinutes: number;
    weeklyLimitMinutes: number;
  }

  // Initialize
  async function init(): Promise<void> {
    await loadPatterns();
    await loadSettings();
    renderLists();
    renderSettings();

    const domainForm = document.getElementById('add-domain-form') as HTMLFormElement;
    const urlForm = document.getElementById('add-url-form') as HTMLFormElement;
    const settingsForm = document.getElementById('settings-form') as HTMLFormElement;

    domainForm.addEventListener('submit', handleAddDomain);
    urlForm.addEventListener('submit', handleAddUrl);
    settingsForm.addEventListener('submit', handleSaveSettings);
  }

  // Load tracked patterns from storage
  async function loadPatterns(): Promise<void> {
    const result = await browser.storage.sync.get(['trackedDomains', 'trackedUrls']);
    trackedDomains = (result.trackedDomains as string[]) || [];
    trackedUrls = (result.trackedUrls as string[]) || [];
  }

  // Load settings from storage
  async function loadSettings(): Promise<void> {
    const result = await browser.storage.sync.get(['settings']);
    if (result.settings) {
      settings = result.settings as Settings;
    }
  }

  // Save tracked domains to storage
  async function saveDomains(): Promise<void> {
    await browser.storage.sync.set({ trackedDomains });
  }

  // Save tracked URLs to storage
  async function saveUrls(): Promise<void> {
    await browser.storage.sync.set({ trackedUrls });
  }

  // Save settings to storage
  async function saveSettings(): Promise<void> {
    await browser.storage.sync.set({ settings });
  }

  // Render both lists
  function renderLists(): void {
    renderDomainList();
    renderUrlList();
  }

  // Render settings form values
  function renderSettings(): void {
    const resetDaySelect = document.getElementById('reset-day') as HTMLSelectElement;
    const dailyLimitInput = document.getElementById('daily-limit') as HTMLInputElement;
    const weeklyLimitInput = document.getElementById('weekly-limit') as HTMLInputElement;

    resetDaySelect.value = settings.resetDay.toString();
    dailyLimitInput.value = settings.dailyLimitMinutes.toString();
    weeklyLimitInput.value = settings.weeklyLimitMinutes.toString();
  }

  // Render the domain list
  function renderDomainList(): void {
    const listEl = document.getElementById('domain-list');
    if (!listEl) return;

    if (trackedDomains.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No domains tracked yet</div>';
      return;
    }

    listEl.innerHTML = trackedDomains.map(domain => `
      <div class="list-item">
        <span class="item-name">${escapeHtml(domain)}</span>
        <button class="delete-btn" data-type="domain" data-value="${escapeHtml(domain)}">Remove</button>
      </div>
    `).join('');

    // Add delete button handlers
    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('click', () => handleDelete('domain', button.dataset.value || ''));
    });
  }

  // Render the URL list
  function renderUrlList(): void {
    const listEl = document.getElementById('url-list');
    if (!listEl) return;

    if (trackedUrls.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No URLs tracked yet</div>';
      return;
    }

    listEl.innerHTML = trackedUrls.map(url => `
      <div class="list-item">
        <span class="item-name">${escapeHtml(url)}</span>
        <button class="delete-btn" data-type="url" data-value="${escapeHtml(url)}">Remove</button>
      </div>
    `).join('');

    // Add delete button handlers
    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('click', () => handleDelete('url', button.dataset.value || ''));
    });
  }

  // Handle adding a new domain
  async function handleAddDomain(e: Event): Promise<void> {
    e.preventDefault();

    const input = document.getElementById('domain-input') as HTMLInputElement;
    let domain = input.value.trim().toLowerCase();

    // Clean up the domain
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');

    if (!domain) {
      showMessage('Please enter a domain', 'error');
      return;
    }

    // Basic domain validation
    if (!/^[a-z0-9]+([\-\.][a-z0-9]+)*\.[a-z]{2,}$/i.test(domain)) {
      showMessage('Please enter a valid domain (e.g., reddit.com)', 'error');
      return;
    }

    if (trackedDomains.includes(domain)) {
      showMessage('This domain is already tracked', 'error');
      return;
    }

    trackedDomains.push(domain);
    trackedDomains.sort();
    await saveDomains();
    renderDomainList();

    input.value = '';
    showMessage(`Added domain: ${domain}`, 'success');
  }

  // Handle adding a new URL
  async function handleAddUrl(e: Event): Promise<void> {
    e.preventDefault();

    const input = document.getElementById('url-input') as HTMLInputElement;
    let url = input.value.trim().toLowerCase();

    // Clean up the URL - remove protocol and www, keep path
    url = url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');

    if (!url) {
      showMessage('Please enter a URL', 'error');
      return;
    }

    // Basic URL validation - must have domain and path
    if (!/^[a-z0-9]+([\-\.][a-z0-9]+)*\.[a-z]{2,}(\/[^\s]*)?$/i.test(url)) {
      showMessage('Please enter a valid URL (e.g., reddit.com/r/programming)', 'error');
      return;
    }

    if (trackedUrls.includes(url)) {
      showMessage('This URL is already tracked', 'error');
      return;
    }

    trackedUrls.push(url);
    trackedUrls.sort();
    await saveUrls();
    renderUrlList();

    input.value = '';
    showMessage(`Added URL: ${url}`, 'success');
  }

  // Handle saving settings
  async function handleSaveSettings(e: Event): Promise<void> {
    e.preventDefault();

    const resetDaySelect = document.getElementById('reset-day') as HTMLSelectElement;
    const dailyLimitInput = document.getElementById('daily-limit') as HTMLInputElement;
    const weeklyLimitInput = document.getElementById('weekly-limit') as HTMLInputElement;

    const dailyLimit = parseInt(dailyLimitInput.value, 10);
    const weeklyLimit = parseInt(weeklyLimitInput.value, 10);

    if (isNaN(dailyLimit) || dailyLimit < 1) {
      showMessage('Please enter a valid daily limit (minimum 1 minute)', 'error');
      return;
    }

    if (isNaN(weeklyLimit) || weeklyLimit < 1) {
      showMessage('Please enter a valid weekly limit (minimum 1 minute)', 'error');
      return;
    }

    settings = {
      resetDay: parseInt(resetDaySelect.value, 10),
      dailyLimitMinutes: dailyLimit,
      weeklyLimitMinutes: weeklyLimit
    };

    await saveSettings();
    showMessage('Settings saved', 'success');
  }

  // Handle deleting a domain or URL
  async function handleDelete(type: 'domain' | 'url', value: string): Promise<void> {
    if (type === 'domain') {
      trackedDomains = trackedDomains.filter(d => d !== value);
      await saveDomains();
      renderDomainList();
      showMessage(`Removed domain: ${value}`, 'success');
    } else {
      trackedUrls = trackedUrls.filter(u => u !== value);
      await saveUrls();
      renderUrlList();
      showMessage(`Removed URL: ${value}`, 'success');
    }
  }

  // Show a temporary message
  function showMessage(text: string, type: 'success' | 'error'): void {
    const messageEl = document.getElementById('message');
    if (!messageEl) return;

    messageEl.className = `message ${type}`;
    messageEl.textContent = text;

    setTimeout(() => {
      messageEl.textContent = '';
      messageEl.className = '';
    }, 3000);
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();
