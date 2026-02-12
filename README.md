# Wasted Timer

A Firefox extension that tracks time spent on configurable websites, displaying an overlay with your daily and weekly totals.

## Features

- **Time tracking overlay** - Appears in the bottom-right corner on tracked sites
- **Track domains or specific URLs** - Monitor entire sites (e.g., `reddit.com`) or specific paths (e.g., `reddit.com/r/videos`)
- **Human-readable time** - Displays time as "2h 15m 30s"
- **Daily and weekly limits** - Set time budgets with color-coded warnings
- **Color-coded progress** - Timer shifts from green → yellow → orange → red as you approach limits
- **Configurable reset day** - Choose which day your weekly timer resets
- **Minimizable** - Snooze the overlay for 10 minutes
- **Persistent** - Time data persists across browser sessions

## Color Scale

The timer values change color based on how much of your limit you've used:

| Usage | Color |
|-------|-------|
| 0-30% | Green |
| 30-60% | Yellow |
| 60-100% | Orange |
| Over limit | Bold Red |

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/Calebvh/WastedTimer.git
   cd WastedTimer
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Firefox:
   - Navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on..."
   - Select the `manifest.json` file

## Usage

1. Click the extension icon → "Manage Extension" → "Options"
2. Configure your settings:
   - **Weekly Reset Day** - When your weekly total resets (default: Sunday)
   - **Daily Limit** - Per-site daily time budget in minutes (default: 60)
   - **Weekly Limit** - Total weekly budget across all sites in minutes (default: 420)
3. Add domains (tracks entire site) or URLs (tracks specific paths)
4. Visit a tracked site - the timer overlay appears in the bottom-right
5. Click the minimize button to snooze for 10 minutes

## Development

```bash
npm run build    # Compile TypeScript
npm run watch    # Watch mode for development
npm run clean    # Remove compiled files
```

## Project Structure

```
WastedTimer/
├── src/
│   ├── background.ts   # Time tracking, storage, and settings
│   ├── content.ts      # Overlay injection and color updates
│   └── options.ts      # Settings page logic
├── dist/               # Compiled JavaScript
├── manifest.json       # Extension manifest
├── content.css         # Overlay styles
└── options.html        # Settings page
```

## License

MIT
