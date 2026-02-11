# Gemini Automator

A professional Chrome extension for automating batch image generation with Gemini AI.

## Features

- **Batch Processing**: Generate multiple images from a list of prompts automatically
- **Smart Delays**: Randomized delays between requests to avoid rate limiting
- **Progress Tracking**: Real-time progress monitoring with detailed activity logs
- **Pause/Resume**: Full control over the automation process

## Important Note

**The Gemini tab must remain active and visible during automation.** Chrome's background tab optimizations prevent reliable automation in hidden tabs.

**Recommended workflow:** Open Gemini in a separate window and work in your main browser window.

## Design Philosophy

This extension features a **Technical Minimalism** aesthetic:

- **Typography**: DM Mono for technical elements paired with Manrope for body text
- **Color Palette**: Muted professional tones with amber accents
- **Layout**: Clean, structured grid-based design with precise spacing
- **Visual Language**: Subtle shadows and borders, no gradients
- **User Experience**: Clear hierarchy, accessible colors, smooth transitions

The design prioritizes clarity, professionalism, and functionality - perfect for a productivity tool.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. Navigate to [Gemini](https://gemini.google.com)
6. Click the extension icon to open the side panel

## Usage

### Basic Workflow

1. **Enter Prompts**: Add your image generation prompts in the text area, separating each prompt with a blank line

2. **Configure Timing**: Set the minimum and maximum delay between generations (recommended: 10-20 seconds)

3. **Start Generation**: Click "Start Generation" to begin the automated batch process

4. **Monitor Progress**: Track completion status, current prompt, and activity logs in real-time

5. **Control Execution**: Use Pause/Resume or Stop buttons as needed

### Prompt Format

```
A serene mountain landscape at dawn

A futuristic cityscape with flying vehicles

Abstract geometric patterns in warm tones
```

Each prompt should be separated by a blank line (double newline).

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
├── content.js             # Gemini page interaction
├── sidepanel.html         # Side panel UI
├── sidepanel.css          # Styling
├── sidepanel.js           # UI controller
└── README.md              # Documentation
```

### Selectors

The extension interacts with Gemini's UI using Material Design selectors. If Gemini updates their interface, you may need to update the selectors in `content.js`:

```javascript
const SELECTORS = {
  promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
  generateBtn: 'mat-icon[fonticon="send"]',
  stopBtn: 'mat-icon[fonticon="stop"]'
};
```

The stop button visibility is used to detect when generation is complete.

## Safety Features

- **Input Validation**: Validates prompts and settings before starting
- **Tab Detection**: Ensures Gemini is open before processing
- **Error Handling**: Graceful error handling with detailed logging
- **Rate Limiting**: Configurable delays to respect API limits

## Customization

### Adjust Delays

Modify the delay range in the side panel UI to control the pace of generation:
- **Faster**: 5-10 seconds (higher risk of rate limiting)
- **Recommended**: 10-20 seconds (balanced)
- **Conservative**: 20-30 seconds (safest)

### Color Scheme

Edit CSS variables in `sidepanel.css` to customize the color palette:

```css
:root {
  --color-accent: #d97706;        /* Primary accent color */
  --color-bg: #fafaf9;            /* Background color */
  --color-surface: #ffffff;       /* Card backgrounds */
  /* ... more variables */
}
```

## Troubleshooting

### Extension not working

1. Ensure you're on `gemini.google.com`
2. Check that the extension is enabled in `chrome://extensions/`
3. Reload the Gemini page
4. Check the browser console for errors

### Selectors not matching

If Gemini updates their UI, update the selectors in `content.js` to match the new structure.

## License

MIT License - feel free to modify and distribute as needed.

## Credits

Built with a focus on professional design and reliable automation.
