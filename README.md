# Gemini Automator

A professional Chrome extension for automating batch image generation with Gemini AI.

## Features

- **Auto-Configuration**: Automatically selects "Create Image" tool and Pro model
- **Batch Processing**: Generate multiple images from a list of prompts automatically
- **Smart Delays**: Randomized delays between requests to avoid rate limiting
- **Progress Tracking**: Real-time progress monitoring with detailed activity logs
- **Pause/Resume**: Full control over the automation process

## Important Note

**The Gemini tab must remain active and visible during automation.** Chrome's background tab optimizations prevent reliable automation in hidden tabs.

**Recommended workflow:** Open Gemini in a separate window and work in your main browser window.

## Design Philosophy

This extension matches **Gemini's Dark Theme** using Material Design 3:

- **Typography**: Google Sans for headings, Google Sans Text for body - optimized for readability
- **Color Palette**: Deep charcoal backgrounds (#131314) with Google Blue accents (#4285f4)
- **Layout**: Spacious design with large corner radii (16-24px) and generous padding
- **Visual Language**: Subtle glassmorphism effects with backdrop blur and soft shadows
- **User Experience**: Cohesive with Gemini's interface, reduced eye strain, smooth transitions

The design seamlessly integrates with Gemini's aesthetic while maintaining full functionality.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Navigate to [Gemini](https://gemini.google.com)
6. Click the extension icon to open the side panel

## Usage

### Basic Workflow

1. **Enter Prompts**: Add your image generation prompts in the text area, one prompt per line

2. **Configure Timing**: Set the minimum and maximum delay between generations (recommended: 10-20 seconds)

3. **Setup Gemini** (first time only): Click "Setup Gemini" to automatically:
   - Select the "Create Image" tool
   - Switch to Pro model

   *Note: Only needed once per session or if you change tools/model manually*

4. **Start Generation**: Click "Start Generation" to begin processing your prompts

5. **Monitor Progress**: Track completion status, current prompt, and activity logs in real-time

6. **Control Execution**: Use Pause/Resume or Stop buttons as needed

### Prompt Format

```
A serene mountain landscape at dawn
A futuristic cityscape with flying vehicles
Abstract geometric patterns in warm tones
```

Enter one prompt per line.

## Technical Details

### Architecture

- **Manifest V3**: Modern Chrome extension architecture
- **Side Panel API**: Clean, persistent UI that doesn't interfere with browsing
- **Content Scripts**: Direct interaction with Gemini web interface
- **Message Passing**: Robust communication between components

### File Structure

```
gemini-automator/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── content.js             # Gemini page automation
├── sidepanel.html         # Side panel UI
├── sidepanel.css          # Material Design 3 styling
├── sidepanel.js           # UI controller & batch orchestration
├── icon.svg               # Source icon (star theme)
├── icon16.png             # Extension icon (16x16)
├── icon48.png             # Extension icon (48x48)
├── icon128.png            # Extension icon (128x128)
├── CLAUDE.md              # Development guidelines
└── README.md              # Documentation
```

### Selectors

The extension interacts with Gemini's UI using Material Design selectors. If Gemini updates their interface, you may need to update the selectors in `content.js`:

```javascript
const SELECTORS = {
  // Core automation
  promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
  generateBtn: 'mat-icon[fonticon="send"]',
  stopBtn: 'mat-icon[fonticon="stop"]',

  // Auto-setup (tool & model selection)
  toolsBtn: '#app-root > main > side-navigation-v2 > ...',
  createImageOption: '#toolbox-drawer-menu > toolbox-drawer-item:nth-child(4) > button',
  modelPickerBtn: '#app-root > main > side-navigation-v2 > ...',
  proModelOption: '[id^="mat-menu-panel-"] > div > div > button.bard-mode-list-button:nth-child(6)'
};
```

**Key Detection Methods:**
- Stop button visibility = generation in progress
- Stop button disappears = generation complete (most reliable signal)
- MutationObserver monitors DOM changes (not throttled in background tabs)

## Safety Features

- **Smart Setup Verification**: Checks if tools/model are already configured before making changes
- **Input Validation**: Validates prompts and settings before starting
- **Tab Detection**: Ensures Gemini is open and active before processing
- **Error Handling**: Graceful error handling with color-coded activity logs
- **Rate Limiting**: Configurable delays (5-120 seconds) to respect API limits
- **Progress Tracking**: Real-time updates after each completion, not during delays

## Customization

### Adjust Delays

Modify the delay range in the side panel UI to control the pace of generation:
- **Faster**: 5-10 seconds (higher risk of rate limiting)
- **Recommended**: 10-20 seconds (balanced)
- **Conservative**: 20-30 seconds (safest)

### Color Scheme

The extension uses Gemini's Material Design 3 dark palette:

```css
:root {
  --color-accent: #4285f4;              /* Google Blue */
  --color-bg: #131314;                  /* Deep Charcoal */
  --color-surface: #1e1f20;             /* Surface Gray */
  --color-surface-elevated: #28292a;    /* Elevated Surface */
  --color-text-primary: #e3e3e3;        /* Off-White */
  /* ... more variables in sidepanel.css */
}
```

## Troubleshooting

### Extension not working

1. Ensure you're on `gemini.google.com`
2. Check that the extension is enabled in `chrome://extensions/`
3. Reload the Gemini page
4. Check the browser console for errors

### Setup button fails

If auto-setup fails, it's likely Gemini updated their UI:
1. Manually select "Create Image" tool and Pro model
2. Update selectors in `content.js` to match new structure
3. The extension will still work - setup is optional

### Selectors not matching

If Gemini updates their UI:
1. Open Chrome DevTools on gemini.google.com
2. Inspect the target elements (prompt box, buttons, etc.)
3. Update selectors in `content.js` to match new structure
4. Pay special attention to dynamic menu panel IDs (use `[id^="..."]` patterns)

## License

MIT License - feel free to modify and distribute as needed.

## Credits

Built with a focus on professional design and reliable automation.
