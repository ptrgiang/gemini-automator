// ============================================
// CONTENT.JS - Gemini Page Automation
// ============================================

console.log('Auto Gemini Content Script Loaded');

// ============================================
// DOM Selectors for Gemini
// ============================================
const SELECTORS = {
    promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
    generateBtn: 'mat-icon[fonticon="send"]',
    stopBtn: 'mat-icon[fonticon="stop"]'
};

// ============================================
// Robust Element Finders (Text-Based)
// ============================================

/**
 * Find tools button by looking for common icon patterns
 */
function findToolsButton() {
    // Try multiple strategies
    const strategies = [
        // Look for toolbox-drawer component
        () => document.querySelector('toolbox-drawer button'),
        // Look for button with tools/apps icon
        () => Array.from(document.querySelectorAll('button mat-icon')).find(icon =>
            icon.getAttribute('fonticon')?.includes('apps') ||
            icon.getAttribute('fonticon')?.includes('tool')
        )?.closest('button'),
        // Look in input area for leading actions
        () => document.querySelector('input-area-v2 .leading-actions-wrapper button')
    ];

    for (const strategy of strategies) {
        const btn = strategy();
        if (btn) return btn;
    }
    return null;
}

/**
 * Find option by text content (case-insensitive, flexible matching)
 * Searches within visible dropdown menus for multiple element types
 */
async function findOptionByText(searchText, retries = 10) {
    const search = searchText.toLowerCase();

    for (let attempt = 0; attempt < retries; attempt++) {
        // Search in multiple element types that Gemini might use
        const selectors = [
            'button',                          // Standard buttons
            'toolbox-drawer-item button',      // Tool menu items
            '[role="menuitem"]',               // ARIA menu items
            '[role="option"]',                 // ARIA options
            'mat-option',                      // Material options
            '.mat-menu-item',                  // Material menu items
            'toolbox-drawer-item'              // Tool drawer items
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            console.log(`Searching ${elements.length} ${selector} elements for "${searchText}"`);

            for (const element of elements) {
                const text = element.textContent?.trim().toLowerCase() || '';

                // Log what we're finding (helps debug)
                if (text.length > 0 && text.length < 50) {
                    console.log(`  Found: "${text}"`);
                }

                if (text.includes(search)) {
                    console.log(`Match found: "${text}" contains "${searchText}"`);
                    // Return the button element if it's inside a wrapper
                    const button = element.tagName === 'BUTTON' ? element : element.querySelector('button');
                    return button || element;
                }
            }
        }

        // Wait and retry if not found
        if (attempt < retries - 1) {
            console.log(`Option "${searchText}" not found, waiting 300ms... (attempt ${attempt + 1}/${retries})`);
            await sleep(300);
        }
    }

    console.error(`Option "${searchText}" not found after ${retries} attempts`);
    return null;
}

/**
 * Find button in dropdown by searching for text (single attempt, fast)
 * Searches for whole word matches to avoid false positives
 * Falls back to selecting by index if no text match found
 */
function findButtonInDropdown(searchText, fallbackIndex = null) {
    // Look for visible dropdown panels
    const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"], .mat-menu-panel, [id*="menu-panel"]');

    console.log(`\nSearching ${dropdowns.length} dropdown menus for "${searchText}"`);

    for (const dropdown of dropdowns) {
        // Only search visible dropdowns
        if (dropdown.offsetParent === null) continue;

        const buttons = dropdown.querySelectorAll('button');
        console.log(`Found ${buttons.length} buttons in dropdown`);

        // Search for the matching button
        for (const button of buttons) {
            const buttonText = button.textContent?.trim() || '';
            const buttonTextLower = buttonText.toLowerCase();

            // Use word boundary matching to avoid matching "pro" in "problems"
            const searchLower = searchText.toLowerCase();
            const wordBoundaryRegex = new RegExp(`\\b${searchLower}\\b`, 'i');

            if (wordBoundaryRegex.test(buttonTextLower)) {
                console.log(`MATCH: "${buttonText}" contains whole word "${searchText}"`);
                return button;
            }
        }

        // Fallback: select by index if no text match found
        if (fallbackIndex !== null && buttons[fallbackIndex]) {
            const fallbackButton = buttons[fallbackIndex];
            const fallbackText = fallbackButton.textContent?.trim() || '';
            console.log(`No text match found. Using fallback: button ${fallbackIndex + 1} ("${fallbackText}")`);
            return fallbackButton;
        }
    }

    console.log(`No button found containing "${searchText}" and no valid fallback`);
    return null;
}

/**
 * Find model picker button
 */
function findModelPickerButton() {
    const strategies = [
        // Look for bard-mode-switcher component
        () => document.querySelector('bard-mode-switcher button'),
        // Look in trailing actions for model picker
        () => document.querySelector('.trailing-actions-wrapper .model-picker-container button'),
        // Look for button with dropdown icon in input area
        () => Array.from(document.querySelectorAll('input-area-v2 button mat-icon')).find(icon =>
            icon.getAttribute('fonticon')?.includes('arrow_drop') ||
            icon.getAttribute('fonticon')?.includes('expand')
        )?.closest('button')
    ];

    for (const strategy of strategies) {
        const btn = strategy();
        if (btn) return btn;
    }
    return null;
}

// ============================================
// Message Listener
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request.action);

    (async () => {
        try {
            switch (request.action) {
                case 'setupGemini':
                    await setupGemini();
                    sendResponse({ success: true });
                    break;
                case 'fillPrompt':
                    await fillPrompt(request.prompt);
                    sendResponse({ success: true });
                    break;
                case 'clickGenerate':
                    await clickGenerate();
                    sendResponse({ success: true });
                    break;
                case 'waitForCompletion':
                    const result = await waitForCompletion();
                    sendResponse(result);
                    break;
                case 'ping':
                    sendResponse({ success: true, message: 'Content script active' });
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true;
});

// ============================================
// Setup Gemini (Select Tool and Model)
// ============================================
async function setupGemini() {
    console.log('Setting up Gemini for image generation...');

    // Step 1: Check and select "Create image" tool if needed
    console.log('Checking Create Image tool...');
    const toolsBtn = findToolsButton();
    if (!toolsBtn) {
        throw new Error('Tools button not found - Gemini UI may have changed');
    }

    toolsBtn.click();
    await sleep(800); // Extra time for menu to render

    // Look for "Create images" option (try English, Vietnamese, then fall back to 3rd button)
    console.log('Searching for Create Images option...');
    const createImageOption = findButtonInDropdown('create images', 2) ||
                             findButtonInDropdown('tạo hình ảnh', 2);

    if (!createImageOption) {
        throw new Error('Create Images option not found - check console for available buttons');
    }

    // Check if already selected
    const isToolSelected = createImageOption.getAttribute('aria-checked') === 'true' ||
                          createImageOption.classList.contains('is-selected') ||
                          createImageOption.classList.contains('active');
    if (isToolSelected) {
        console.log('Create Images tool already selected');
        toolsBtn.click(); // Close dropdown
        await sleep(300);
    } else {
        createImageOption.click();
        console.log('Create Images tool selected');
        await sleep(800);
    }

    // Step 2: Check and select Pro/Advanced model if needed
    console.log('Checking Pro model...');
    const modelPickerBtn = findModelPickerButton();
    if (!modelPickerBtn) {
        throw new Error('Model picker button not found - Gemini UI may have changed');
    }

    modelPickerBtn.click();
    await sleep(800); // Extra time for menu to render

    // Look for Pro model button (fall back to 3rd button for other languages)
    console.log('Searching for Pro model...');
    const proModelOption = findButtonInDropdown('pro', 2);

    if (!proModelOption) {
        throw new Error('Pro model button not found - check console for available buttons');
    }

    // Check if already selected
    const isModelSelected = proModelOption.getAttribute('aria-checked') === 'true' ||
                           proModelOption.classList.contains('is-selected') ||
                           proModelOption.classList.contains('active');
    if (isModelSelected) {
        console.log('Pro model already selected');
        modelPickerBtn.click(); // Close dropdown
        await sleep(300);
    } else {
        proModelOption.click();
        console.log('Pro model selected');
        await sleep(800);
    }

    console.log('Gemini setup complete!');
}

// ============================================
// Fill Prompt
// ============================================
async function fillPrompt(prompt) {
    console.log('Filling prompt:', prompt.substring(0, 50) + '...');

    const textarea = document.querySelector(SELECTORS.promptTextarea);
    if (!textarea) {
        throw new Error('Prompt textarea not found');
    }

    textarea.innerHTML = '';
    textarea.focus();
    textarea.textContent = prompt;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.innerHTML = `<p>${prompt}</p>`;
    textarea.classList.remove('ql-blank');

    console.log('Prompt filled');
    await sleep(500);
}

// ============================================
// Click Generate Button
// ============================================
async function clickGenerate() {
    console.log('Clicking Generate button...');

    let attempts = 0;
    let sendBtn = null;

    while (attempts < 20) {
        sendBtn = document.querySelector(SELECTORS.generateBtn);
        if (sendBtn && sendBtn.offsetParent !== null) {
            break;
        }
        await sleep(200);
        attempts++;
    }

    if (!sendBtn) {
        throw new Error('Generate button not found');
    }

    const btnElement = sendBtn.closest('button') || sendBtn.parentElement;
    if (btnElement && btnElement.tagName === 'BUTTON') {
        btnElement.click();
    } else {
        sendBtn.click();
    }

    console.log('Generate button clicked');
    await sleep(1000);
}

// ============================================
// Wait for Generation Completion
// ============================================
async function waitForCompletion() {
    console.log('Waiting for image generation to complete...');

    const maxWaitTime = 180000; // 3 minutes

    // Wait for generation to start
    console.log('Waiting 3 seconds for generation to start...');
    await sleep(3000);

    // Monitor Stop button using MutationObserver (works in background tabs)
    console.log('Monitoring Stop button with MutationObserver...');

    return new Promise((resolve) => {
        const startTime = Date.now();
        let checkCount = 0;

        // Initial check
        const initialStopBtn = document.querySelector(SELECTORS.stopBtn);
        if (!initialStopBtn || initialStopBtn.offsetParent === null) {
            console.log('Generation already complete!');
            resolve({ success: true, message: 'Complete' });
            return;
        }

        // Set up timeout
        const timeout = setTimeout(() => {
            observer.disconnect();
            console.error('Timeout waiting for completion');
            resolve({ success: false, error: 'Timeout' });
        }, maxWaitTime);

        // Create a MutationObserver to watch for DOM changes
        const observer = new MutationObserver(() => {
            const stopBtn = document.querySelector(SELECTORS.stopBtn);
            checkCount++;

            // Log progress every 5 checks
            if (checkCount % 5 === 0) {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                console.log(`Still generating... (${elapsed}s)`);
            }

            // Check if stop button disappeared
            if (!stopBtn || stopBtn.offsetParent === null) {
                clearTimeout(timeout);
                observer.disconnect();
                console.log('Generation complete!');

                // Extra safety wait
                setTimeout(() => {
                    resolve({ success: true, message: 'Complete' });
                }, 2000);
            }
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        // Also do periodic checks as backup (less frequently to avoid throttling)
        const backupInterval = setInterval(() => {
            const stopBtn = document.querySelector(SELECTORS.stopBtn);
            if (!stopBtn || stopBtn.offsetParent === null) {
                clearInterval(backupInterval);
                clearTimeout(timeout);
                observer.disconnect();
                console.log('Generation complete (backup check)!');
                setTimeout(() => {
                    resolve({ success: true, message: 'Complete' });
                }, 2000);
            }
        }, 5000); // Check every 5 seconds as backup
    });
}

// ============================================
// Utility Functions
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Content script ready!');
