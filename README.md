# Gemini Automator

**Batch image generation automation + automatic watermark removal for Google Gemini AI**

A powerful userscript that automates batch prompt processing and removes NanoBanana watermarks from generated images.

---

## Features

### Batch Image Generation
- **Process multiple prompts automatically** - Enter prompts, click start
- **Smart delays** - Configurable random delays between generations
- **Full control** - Pause, resume, or stop anytime
- **Progress tracking** - Real-time status updates

### Automatic Watermark Removal
- **Removes NanoBanana watermarks** - Clean, professional images
- **Auto-detection** - Handles both 48px and 96px watermarks
- **Real-time processing** - Works as images generate
- **No quality loss** - Advanced alpha map algorithm

### Auto-Configuration
- **One-click setup** - Automatically selects "Create image" tool
- **Model selection** - Auto-selects Pro model
- **No manual configuration** - Just click and go

---

## Installation

### Step 1: Install a Userscript Manager

Choose one (Tampermonkey recommended):

- **[Tampermonkey](https://www.tampermonkey.net/)** - Chrome, Firefox, Edge, Safari
- **[Violentmonkey](https://violentmonkey.github.io/)** - Chrome, Firefox, Edge
- **[Greasemonkey](https://www.greasespot.net/)** - Firefox only

### Step 2: Install the Script

**Watermark data is already included!** The script is ready to use.

**Option A: Direct Install from GitHub (Recommended)**
1. Click this link: [Install gemini-automator.user.js](https://github.com/ptrgiang/gemini-automator/raw/main/gemini-automator.user.js)
2. Your userscript manager will prompt you to install
3. Click **"Install"** - Done!

**Option B: Manual Install**
1. Copy the contents of [`gemini-automator.user.js`](https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/gemini-automator.user.js)
2. Open your userscript manager dashboard
3. Click **"Create a new script"**
4. Paste the code and save (Ctrl+S)

**Note:** The watermark removal data is loaded automatically from `watermark-data.js` hosted on GitHub.

### Automatic Updates

The script is configured to automatically check for updates from GitHub.

**How it works:**
- Tampermonkey checks for updates daily (configurable in settings)
- When a new version is available, you'll be notified
- Updates are downloaded and installed automatically

**Manual update check:**
1. Click the Tampermonkey icon
2. Click the **Dashboard** button
3. Find "Gemini Automator"
4. Click the **"Last updated"** timestamp
5. Click **"Check for updates"**

**Update settings:**
- Open Tampermonkey Dashboard → Settings
- Under "Script Update" section:
  - Check interval: Daily (recommended)
  - Update type: Check for updates (or automatic install)

---

## Usage

### Quick Start

1. **Navigate to Gemini**: https://gemini.google.com
2. **Find the toggle**: Look for the toggle button (top-right corner)
3. **Open panel**: Click the toggle button
4. **Setup**: Click **"Setup Gemini"** button
5. **Add prompts**: Enter one prompt per line
6. **Configure delays**: Set min/max delay (default: 10-20 seconds)
7. **Start**: Click **"Start"** button

### Interface

```
┌─────────────────────────────┐
│ Gemini Automator            │
├─────────────────────────────┤
│ Prompts (one per line):     │
│ ┌─────────────────────────┐ │
│ │ A serene mountain...    │ │
│ │ A futuristic city...    │ │
│ │ Abstract patterns...    │ │
│ └─────────────────────────┘ │
│                             │
│ Min Delay (sec): [10]       │
│ Max Delay (sec): [20]       │
│ Remove Watermarks: [X]      │
│                             │
│ [Setup] [Start] [Pause] [Stop] │
│                             │
│ Progress: 2/5               │
│ Status: Processing...       │
└─────────────────────────────┘
```

### Controls

| Button | Function |
|--------|----------|
| **Setup Gemini** | Auto-configure tool and model |
| **Start** | Begin batch processing |
| **Pause/Resume** | Pause or resume automation |
| **Stop** | Stop completely |
| **Toggle** | Show/hide control panel |

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Prompts** | One prompt per line | - |
| **Min Delay** | Minimum seconds between prompts | 10 |
| **Max Delay** | Maximum seconds between prompts | 20 |
| **Remove Watermarks** | Automatically remove watermarks | Enabled |

---

## How It Works

### Automation Flow

```
Setup → Fill Prompt → Generate → Wait for Completion → Remove Watermark → Random Delay → Next Prompt
```

### Watermark Removal Process

**For Displayed Images:**
1. **Detect** - MutationObserver watches for new images
2. **Fetch** - Get high-resolution version via `GM_xmlhttpRequest` (bypasses CORS)
3. **Process** - Apply alpha map algorithm to remove watermark
4. **Replace** - Update image with clean version

**For Downloads:**
1. **Intercept** - Script intercepts all `fetch()` requests for Gemini images
2. **Process** - Automatically processes the image blob before download
3. **Return** - Provides the clean image without watermarks

This means **all downloads (click download button or right-click → Save image as) will automatically use the watermark-removed version** when the "Remove Watermarks" checkbox is enabled.

### Technical Details

**Why userscript vs Chrome extension?**

| Feature | Userscript | Extension |
|---------|-----------|-----------|
| **CORS Bypass** | Yes - `GM_xmlhttpRequest` | No - Limited |
| **Fetch Interception** | Yes - Full access | No - Restricted |
| **Authenticated Requests** | Yes - Works perfectly | No - Issues |
| **Installation** | Yes - One-click | Requires developer mode |
| **Auto-updates** | Yes - Automatic | No - Manual reload |

---

## Troubleshooting

### UI Not Appearing

**Problem:** Can't see the toggle button

**Solutions:**
1. Open console (F12) and check for: `[Gemini Automator] UI created`
2. Look for the toggle button in top-right corner (might be hidden)
3. Verify script is enabled in Tampermonkey
4. Hard refresh page (Ctrl+Shift+R)
5. Check console for errors

### Watermarks Not Removed

**Problem:** Watermarks still visible on images

**Solutions:**
1. Verify `BG_48_BASE64` and `BG_96_BASE64` are filled correctly in `watermark-data.js`
2. Check that `@require` path in userscript points to correct location
3. Check watermark removal is enabled (checkbox)
4. Open console and look for: `[Gemini Automator] Watermark removed`
5. If you see "watermark removal disabled" warning, check watermark-data.js is loaded
6. Verify the base64 data format is correct: `data:image/png;base64,iVBORw0KGgo...`

### Automation Not Starting

**Problem:** Nothing happens when clicking "Start"

**Solutions:**
1. Make sure prompts are entered (one per line)
2. Check console for error messages
3. Click "Setup Gemini" first
4. Verify you're on the main Gemini chat page

### Setup Fails

**Problem:** "Setup failed" error

**Solutions:**
1. Try manually selecting "Create image" tool and Pro model
2. Check console for specific error message
3. Gemini UI might have changed - report issue with console logs
4. Continue with automation anyway (setup not always required)

---

## Console Messages

Monitor progress in browser console (F12):

```bash
[Gemini Automator] Initializing...
[Gemini Automator] DOM ready
[Gemini Automator] UI created - Look for toggle button in top-right corner!
[Gemini Automator] Toggle button added to page
[Gemini Automator] Watermark removal ready
[Gemini Automator] Ready! Click the toggle button to open the panel.

# During use:
[Gemini Automator] Setting up Gemini...
[Gemini Automator] Setup complete
[Gemini Automator] Found 2 images to process
[Gemini Automator] Watermark removed
```

---

## Customization

### Change UI Position

Edit the CSS in the script:

```javascript
#gemini-automator-panel {
  top: 80px;    // Change this
  right: 20px;  // Or this
}

.toggle-panel {
  top: 20px;    // Toggle button position
  right: 20px;
}
```

### Modify Delay Calculation

Find this code and adjust:

```javascript
const minDelay = parseInt(document.getElementById('ga-min-delay').value) * 1000;
const maxDelay = parseInt(document.getElementById('ga-max-delay').value) * 1000;
const delay = Math.random() * (maxDelay - minDelay) + minDelay;
```

### Disable Watermark Removal

Set to `false` by default:

```javascript
const state = {
  removeWatermark: false  // Change to false
};
```

---

## Permissions

```javascript
// @grant        GM_xmlhttpRequest  // Bypass CORS for image fetching
// @grant        GM_addStyle        // Inject custom CSS
```

These permissions allow:
- **GM_xmlhttpRequest**: Fetch images from googleusercontent.com without CORS restrictions
- **GM_addStyle**: Add custom styling for the UI panel

---

## License

MIT License - Free to use and modify!

---

## Credits

- **Watermark Removal**: Advanced alpha map algorithm
- **UI Design**: Material Design 3 (Google)
- **Automation**: Gemini AI interaction patterns

---

## Support

**Having issues?**

1. Check browser console (F12) for error messages
2. Verify all installation steps completed
3. Try the troubleshooting section above
4. Open an issue with console logs

---

**Made for Gemini power users**
