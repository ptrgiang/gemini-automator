# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that automates batch image generation on Google Gemini AI. Uses side panel UI for batch prompt processing with Material Design selector-based automation.

## Architecture

### Component Communication Flow

```
sidepanel.js → chrome.tabs.sendMessage() → content.js → Gemini DOM
     ↓                                           ↓
  UI state                              Automation actions
  Progress                              (fill, click, wait)
  Logging
```

**Critical:** All automation happens in `content.js` on the Gemini page. Side panel only coordinates and displays progress.

### Key Files & Responsibilities

- **content.js**: DOM automation on Gemini page
  - Uses MutationObserver for completion detection (not throttled by Chrome)
  - Material Design selectors for Gemini UI interactions
  - Requires active tab - no background operation possible

- **sidepanel.js**: Batch orchestration and UI
  - Manages batch state (prompts, progress, pause/resume)
  - Sends messages to content script via tab ID
  - Activates tab before each prompt (Chrome requirement)
  - Handles desktop notifications on completion

- **background.js**: Side panel lifecycle
  - Enables/disables side panel based on URL (Gemini only)
  - Manages tab-specific panel availability

## Critical Implementation Details

### 1. MutationObserver for Completion (content.js)

Chrome throttles `setInterval`/`setTimeout` to 1/minute in background tabs. We use MutationObserver which is NOT throttled:

```javascript
// Watches stop button appearance/disappearance
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true
});
```

**Why:** Polling with `sleep()` fails in background tabs due to throttling. However, note that despite using MutationObserver, the tab must still be active for Gemini to generate images.

### 2. Material Design Selectors (content.js)

Gemini uses Material Design components. Selectors target icon fonts and specific DOM paths:

```javascript
const SELECTORS = {
  promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
  generateBtn: 'mat-icon[fonticon="send"]',
  stopBtn: 'mat-icon[fonticon="stop"]',
  toolsBtn: '#app-root > main > side-navigation-v2 > ...',
  createImageOption: '#toolbox-drawer-menu > toolbox-drawer-item:nth-child(4)',
  modelPickerBtn: '#app-root > main > side-navigation-v2 > ...',
  proModelOption: '#mat-menu-panel-56 > div > div > button:nth-child(6)'
};
```

**Important:**
- Stop button visibility = generation in progress
- Stop button disappears = generation complete
- This is the most reliable completion signal
- Auto-setup selects "Create Image" tool and Pro model before batch processing

### 3. Chrome Tab Requirements (Critical Limitation)

Chrome requires tabs to be active for reliable automation - there is no workaround. In `sidepanel.js`:

```javascript
await chrome.tabs.update(tabId, { active: true });
```

**Why:** Chrome throttles network requests, rendering, and JavaScript execution in background tabs. This is a fundamental browser limitation that cannot be bypassed. Gemini will not generate images unless the tab is visible and active.

## Common Issues

### Gemini UI Changes
If automation breaks, Gemini likely updated their UI. Check these selectors first:
- Prompt textarea structure
- Send button icon name
- Stop button icon name
- Tools button and Create Image option paths
- Model picker and Pro model option paths

Use browser DevTools on gemini.google.com to inspect current structure.

**Note:** The auto-setup feature (tool/model selection) uses long CSS selectors that may break with UI updates. If setup fails, it will log a warning but continue - users can manually configure Gemini settings.

### Content Script Not Loading
1. Check manifest.json `matches` patterns include current Gemini URL
2. Verify `run_at: "document_end"` so DOM is ready
3. Check browser console for "🤖 Auto Gemini Content Script Loaded"

### Automation Timeout or Failure
If automation times out or images don't generate:
1. Verify Gemini tab is actually visible (not minimized or in background)
2. Check that tab is being activated before each prompt
3. Ensure MutationObserver is being used (not polling loops)
4. Keep Gemini window visible - open in separate window if needed

## Development

### Git Commits

When creating commits, focus on clear, concise commit messages only. Do not add co-author attributions or metadata. Work on behalf of the user directly.

Example:
```
Update prompt separator to use single newlines

Changed from blank line (double newline) separator to single newline
for simpler prompt input. Updated UI hints and README accordingly.
```

### Testing Changes

1. **Reload extension**: `chrome://extensions/` → click reload icon
2. **Reload Gemini page**: Hard refresh (Ctrl+Shift+R) to reload content script
3. **Check console**: Both extension DevTools and Gemini page console

### Message Passing Debug

Add logging in both locations:
```javascript
// sidepanel.js
console.log('Sending message:', action);

// content.js
console.log('Received message:', request.action);
```

### UI Changes

All UI in `sidepanel.html/css`. Design system uses:
- **Material Design 3**: Matches Gemini's dark theme aesthetic
- **Typography**: Google Sans (headings) + Google Sans Text (body)
- **Color Palette**:
  - Deep Charcoal (#131314) background
  - Surface Gray (#1e1f20) containers
  - Google Blue (#4285f4) accents
  - Off-White (#e3e3e3) text
- **Spacing**: Larger corner radii (16-24px) for modern feel
- **Effects**: Glassmorphism with backdrop-filter blur
- **Responsive**: Container queries for button text/icon scaling

## Important Constraints

**No additional markdown files**: Only README.md and CLAUDE.md should exist. Remove any others created during development.

**Keep README.md in sync**: When making changes to source code, always check if README.md needs updates. User-facing features, settings, usage instructions, or behavior changes must be reflected in README.md immediately.

**Chrome Manifest V3**: Uses service workers, not background pages. No persistent background context.

**Gemini-only**: Extension is intentionally scoped to gemini.google.com only. Side panel disabled on other sites.
