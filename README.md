# Wasted Timer

A Firefox extension that tracks time spent on configurable websites, displaying an overlay with your daily and weekly totals.

## Features

- **Time tracking overlay** - Appears in the bottom-right corner on tracked sites
- **Track domains or specific URLs** - Monitor entire sites (e.g., `reddit.com`) or specific paths (e.g., `reddit.com/r/videos`)
- **Human-readable time** - Displays time as "2h 15m 30s"
- **Weekly totals** - See cumulative time across all tracked sites (resets Sunday)
- **Minimizable** - Snooze the overlay for 10 minutes
- **Persistent** - Time data persists across browser sessions

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
2. Add domains (tracks entire site) or URLs (tracks specific paths)
3. Visit a tracked site - the timer overlay appears in the bottom-right
4. Click the minimize button to snooze for 10 minutes

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
│   ├── background.ts   # Time tracking and storage
│   ├── content.ts      # Overlay injection
│   └── options.ts      # Settings page logic
├── dist/               # Compiled JavaScript
├── manifest.json       # Extension manifest
├── content.css         # Overlay styles
└── options.html        # Settings page
```

## License

MIT
