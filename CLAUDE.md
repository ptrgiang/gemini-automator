# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Userscript that automates batch image generation on Google Gemini AI with automatic watermark removal. Uses GM APIs (Tampermonkey/Violentmonkey/Greasemonkey) for privileged operations like CORS-free image fetching and style injection.

## Architecture

### Single-File Structure

```
gemini-automator.user.js
├── Userscript Metadata (@match, @grant, @require, etc.)
├── WatermarkRemover Class
│   ├── fetchBlob() - GM_xmlhttpRequest for CORS bypass
│   ├── detectWatermarkConfig() - Auto-size detection
│   ├── removeWatermark() - Alpha map algorithm
│   └── processImageElement() - Full pipeline
├── AutomationEngine Class
│   ├── Selector-based Gemini DOM interaction
│   ├── Setup automation (tool + model selection)
│   ├── Batch processing loop with delays
│   └── MutationObserver for completion detection
└── UI Management
    ├── Floating panel with Material Design 3
    ├── Toggle button (⚡) for show/hide
    └── State persistence and progress tracking

watermark-data.js (External file loaded via @require)
├── BG_48_BASE64 constant (48x48 alpha map)
└── BG_96_BASE64 constant (96x96 alpha map)
```

**Why Userscript vs Chrome Extension:**
- **CORS Bypass**: `GM_xmlhttpRequest` bypasses CORS restrictions completely
- **Authenticated Requests**: Runs in page context with full cookie access
- **Simpler Deployment**: No developer mode or manifest configuration needed
- **Auto-updates**: Userscript managers handle updates automatically
- **Full Page Access**: Can intercept and modify page resources freely

## Critical Implementation Details

### 1. Watermark Removal with GM_xmlhttpRequest

Uses `GM_xmlhttpRequest` to bypass CORS when fetching high-resolution images:

```javascript
const fetchBlob = (url) => new Promise((resolve, reject) => {
  GM_xmlhttpRequest({
    method: 'GET',
    url,
    responseType: 'blob',
    onload: (response) => resolve(response.response),
    onerror: reject
  });
});
```

**External Watermark Data:**

Watermark alpha maps are stored in `watermark-data.js` and loaded via `@require`:

```javascript
// In gemini-automator.user.js metadata:
// @require      file:///path/to/watermark-data.js
// Or for hosted:
// @require      https://raw.githubusercontent.com/user/repo/main/watermark-data.js

// In watermark-data.js:
const BG_48_BASE64 = "data:image/png;base64,iVBORw0KGgo...";
const BG_96_BASE64 = "data:image/png;base64,iVBORw0KGgo...";

// Accessed via window.WATERMARK_DATA in main script:
window.WATERMARK_DATA.BG_48_BASE64
window.WATERMARK_DATA.BG_96_BASE64
```

**Why separate file:**
- Easier to update watermark data without touching main script
- Can use local file path for testing or hosted URL for distribution
- Keeps sensitive alpha map data separate from public code

**Auto-Detection:**
```javascript
function detectWatermarkConfig(imageWidth, imageHeight) {
  if (imageWidth > 1024 && imageHeight > 1024) {
    return { logoSize: 96, marginRight: 64, marginBottom: 64 };
  }
  return { logoSize: 48, marginRight: 32, marginBottom: 32 };
}
```

Uses 48px watermark for images ≤1024px, 96px for larger images.

**Watermark Algorithm:**
```javascript
// Formula: original = (watermarked - alpha * LOGO_VALUE) / (1 - alpha)
const original = (channel - alpha * 255) / (1 - alpha);
```

### 2. MutationObserver for Image Detection

Watches for new Gemini-generated images with debouncing:

```javascript
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processAllImages();
  }, 100);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
```

**Why:** Detects images as they appear without polling. 100ms debounce prevents excessive processing during DOM updates.

### 3. Robust Element Selection

**Core Selectors** (stable, icon-based):
```javascript
const SELECTORS = {
  promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
  generateBtn: 'mat-icon[fonticon="send"]',
  stopBtn: 'mat-icon[fonticon="stop"]'
};
```

**Setup Automation:**
Uses text-based searching with multiple fallback strategies:

```javascript
// Find tools button by component name
const findToolsButton = () => {
  const toolboxDrawer = document.querySelector('toolbox-drawer');
  if (!toolboxDrawer) return null;
  return toolboxDrawer.querySelector('button[mat-button]');
};

// Find option by text content (case-insensitive)
const findOptionByText = (text) => {
  const options = document.querySelectorAll('mat-option, [role="option"]');
  for (const option of options) {
    if (option.textContent.toLowerCase().includes(text.toLowerCase())) {
      return option;
    }
  }
  return null;
};
```

**Auto-setup process:**
1. Opens tools menu → searches for "create image" text
2. Opens model picker → searches for "pro" text
3. Checks if already selected before clicking
4. Falls back to 3rd button if text not found (language support)

**Why this approach:**
- **Survives UI updates**: Text content is more stable than DOM structure
- **Multiple fallbacks**: Component names, text matching, position-based
- **Language support**: Primary text search with positional fallback
- **Clear errors**: Reports which step failed when UI changes

### 4. UI Initialization Timing

**Critical:** Must wait for document.body before creating UI:

```javascript
const waitForBody = () => new Promise(resolve => {
  if (document.body) {
    resolve();
  } else {
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
});

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

**Why:** Userscripts can run before document.body exists. Attempting to append elements to null body causes silent failures.

### 5. Material Design 3 Styling

Uses `GM_addStyle` to inject CSS that matches Gemini's dark theme:

```javascript
GM_addStyle(`
  #gemini-automator-panel {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 1px solid rgba(66, 133, 244, 0.3);
    border-radius: 16px;
    backdrop-filter: blur(10px);
  }
`);
```

**Color Palette:**
- Background: Deep Charcoal (#131314)
- Surface: #1e1f20
- Accent: Google Blue (#4285f4)
- Text: Off-White (#e3e3e3)

**Position:** Fixed top-right with z-index: 999999 to overlay Gemini UI.

## Common Issues

### UI Not Appearing

**Problem:** Can't see the ⚡ toggle button

**Solutions:**
1. Check browser console (F12) for initialization messages:
   ```
   [Gemini Automator] Initializing...
   [Gemini Automator] DOM ready
   [Gemini Automator] UI created - Look for ⚡ button in top-right corner!
   ```
2. Verify userscript manager shows script is enabled
3. Check script runs on gemini.google.com (check @match pattern)
4. Hard refresh page (Ctrl+Shift+R)
5. Look for errors in console related to document.body or element creation

### Watermarks Not Removed

**Problem:** Watermarks still visible on generated images

**Solutions:**
1. **Base64 data not filled**: Verify `watermark-data.js` has actual base64 data:
   ```javascript
   const BG_48_BASE64 = "data:image/png;base64,iVBORw0KGgo..."; // Should be ~13KB
   const BG_96_BASE64 = "data:image/png;base64,iVBORw0KGgo..."; // Should be ~52KB
   ```
2. **File not loaded**: Check `@require` path in userscript metadata points to correct location
3. **Console warning**: If you see "watermark removal disabled", check watermark-data.js is accessible
4. **Checkbox disabled**: Ensure "Remove Watermarks" checkbox is checked
5. **CORS/fetch errors**: Check console for GM_xmlhttpRequest errors
6. **Wrong alpha map**: Verify base64 strings are valid PNG images with correct format
7. Console should show: `[Gemini Automator] Watermark removed successfully`

### Automation Not Starting

**Problem:** Nothing happens when clicking "Start"

**Solutions:**
1. Add prompts (one per line) in the textarea
2. Check console for error messages
3. Click "Setup Gemini" button first to configure tool and model
4. Verify you're on the main Gemini chat page (not settings or other pages)
5. Try manually selecting "Create image" tool and Pro model if auto-setup fails

### Setup Fails

**Problem:** "Setup failed" message appears

**Solutions:**
1. Gemini UI might have changed - check console for specific error
2. Manually select "Create image" tool from tools menu
3. Manually select Pro model from model picker
4. Automation will still work after manual setup
5. Report issue with console logs if text/selectors changed

### Gemini UI Changes

If automation breaks after Gemini updates:

**Most stable (rarely break):**
- Prompt textarea: `rich-textarea .ql-editor[contenteditable="true"]`
- Send button: `mat-icon[fonticon="send"]`
- Stop button: `mat-icon[fonticon="stop"]`

**May require updates:**
- Tools menu text: Currently "create image" / "imagen" / "tạo hình ảnh"
- Model picker text: Currently "pro" / "flash experimental" / "advanced"
- Component names: `toolbox-drawer`, `bard-mode-switcher`

**To debug:**
1. Open browser DevTools on gemini.google.com
2. Inspect current text on buttons/options
3. Check if component tag names changed
4. Update selectors or text matching in userscript
5. Report findings in GitHub issues

## Development

### Testing Changes

1. **Edit userscript**: Open Tampermonkey dashboard → click script name → edit
2. **Save changes**: Ctrl+S in editor
3. **Reload Gemini page**: Hard refresh (Ctrl+Shift+R)
4. **Check console**: Look for initialization messages and errors

**No extension reload needed** - userscript managers auto-reload on save.

### Debug Logging

Add logging at key points:

```javascript
console.log('[Gemini Automator] Processing image:', imgElement.src);
console.log('[Gemini Automator] Watermark config:', config);
console.log('[Gemini Automator] Setup step:', step, element);
```

**Console Logging Standards:**
- Prefix with `[Gemini Automator]` for easy filtering
- Do not use emojis in console.log statements
- Keep messages clear and concise
- Use plain text for better readability

### Alpha Map Generation

To create and configure watermark alpha maps:

1. **Extract watermark** from sample Gemini-generated image
2. **Convert to grayscale alpha map** (white = opaque watermark, black = transparent)
3. **Resize** to exactly 48x48 or 96x96 pixels
4. **Encode as PNG** with base64
5. **Add prefix**: `data:image/png;base64,`
6. **Save to watermark-data.js**:
   ```javascript
   const BG_48_BASE64 = "data:image/png;base64,iVBORw0KGgo...";
   const BG_96_BASE64 = "data:image/png;base64,iVBORw0KGgo...";
   ```

**Validation:**
- PNG signature should start with: `iVBORw0KGgo`
- File size: ~13KB for 48x48, ~52KB for 96x96
- Must be valid PNG format (test by creating image element)
- Check `window.WATERMARK_DATA` is defined in browser console

**File Locations:**
- **Local development**: Use `file:///` path in `@require`
- **Production**: Upload to GitHub and use raw URL in `@require`

### Git Commits

When creating commits, focus on clear, concise commit messages only. Do not add co-author attributions or metadata. Work on behalf of the user directly.

Example:
```
Improve setup button robustness and performance

- Add null checks for button elements
- Implement retry logic for async operations
- Reduce setup timeout to 5 seconds
```

## Important Constraints

**No additional markdown files**: Only README.md and CLAUDE.md should exist. Remove any others created during development.

**Keep README.md in sync**: When making changes to source code, always check if README.md needs updates. User-facing features, settings, usage instructions, or behavior changes must be reflected in README.md immediately.

**Single userscript file**: All code must remain in gemini-automator.user.js. Do not split into multiple files.

**Gemini-only**: Script is scoped to gemini.google.com via @match directive. Do not expand to other domains.

**Required GM APIs**:
- `GM_xmlhttpRequest`: CORS bypass for image fetching
- `GM_addStyle`: CSS injection for UI styling

## Permissions

```javascript
// @grant        GM_xmlhttpRequest  // Bypass CORS for googleusercontent.com
// @grant        GM_addStyle        // Inject Material Design CSS
```

These permissions allow:
- **GM_xmlhttpRequest**: Fetch authenticated images without CORS restrictions
- **GM_addStyle**: Add custom styling for floating UI panel

Both are essential for core functionality - do not remove.
