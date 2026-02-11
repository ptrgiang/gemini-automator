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
    stopBtn: 'mat-icon[fonticon="stop"]',
    toolsBtn: '#app-root > main > side-navigation-v2 > bard-sidenav-container > bard-sidenav-content > div.content-wrapper > div > div.content-container > chat-window > div > input-container > div > input-area-v2 > div > div > div.leading-actions-wrapper.ng-tns-c3776338945-8.ui-ready-fade-in.has-model-picker.ng-star-inserted > toolbox-drawer > div > div > button',
    createImageOption: '#toolbox-drawer-menu > toolbox-drawer-item:nth-child(4) > button',
    modelPickerBtn: '#app-root > main > side-navigation-v2 > bard-sidenav-container > bard-sidenav-content > div.content-wrapper > div > div.content-container > chat-window > div > input-container > div > input-area-v2 > div > div > div.trailing-actions-wrapper.ui-ready-fade-in.ng-tns-c3776338945-8 > div.model-picker-container.ng-tns-c3776338945-8.ng-star-inserted > bard-mode-switcher > div > button',
    // Use dynamic selector with attribute starts-with for menu panel ID
    proModelOption: '[id^="mat-menu-panel-"] > div > div > button.bard-mode-list-button:nth-child(6)'
};

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
    const toolsBtn = document.querySelector(SELECTORS.toolsBtn);
    if (!toolsBtn) {
        throw new Error('Tools button not found');
    }

    toolsBtn.click();
    await sleep(500);

    const createImageOption = document.querySelector(SELECTORS.createImageOption);
    if (!createImageOption) {
        throw new Error('Create Image option not found');
    }

    // Check if already selected
    const isToolSelected = createImageOption.getAttribute('aria-checked') === 'true';
    if (isToolSelected) {
        console.log('Create Image tool already selected');
        // Close dropdown by clicking tools button again
        toolsBtn.click();
        await sleep(500);
    } else {
        createImageOption.click();
        console.log('Create Image tool selected');
        await sleep(1000);
    }

    // Step 2: Check and select Pro model if needed
    console.log('Checking Pro model...');
    const modelPickerBtn = document.querySelector(SELECTORS.modelPickerBtn);
    if (!modelPickerBtn) {
        throw new Error('Model picker button not found');
    }

    modelPickerBtn.click();
    await sleep(500);

    const proModelOption = document.querySelector(SELECTORS.proModelOption);
    if (!proModelOption) {
        throw new Error('Pro model option not found');
    }

    // Check if already selected (either aria-checked or has is-selected class)
    const isModelSelected = proModelOption.getAttribute('aria-checked') === 'true' ||
                           proModelOption.classList.contains('is-selected');
    if (isModelSelected) {
        console.log('Pro model already selected');
        // Close dropdown by clicking elsewhere or pressing Escape
        document.body.click();
        await sleep(500);
    } else {
        proModelOption.click();
        console.log('Pro model selected');
        await sleep(1000);
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
