// ============================================
// CONTENT.JS - Gemini Page Automation
// ============================================

console.log('🤖 Auto Gemini Content Script Loaded');

// ============================================
// DOM Selectors for Gemini
// ============================================
const SELECTORS = {
    promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
    generateBtn: 'mat-icon[fonticon="send"]',
    stopBtn: 'mat-icon[fonticon="stop"]'
};

// ============================================
// Message Listener
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received message:', request.action);

    (async () => {
        try {
            switch (request.action) {
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
            console.error('❌ Error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true;
});

// ============================================
// Fill Prompt
// ============================================
async function fillPrompt(prompt) {
    console.log('✏️ Filling prompt:', prompt.substring(0, 50) + '...');

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

    console.log('✅ Prompt filled');
    await sleep(500);
}

// ============================================
// Click Generate Button
// ============================================
async function clickGenerate() {
    console.log('🎨 Clicking Generate button...');

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

    console.log('✅ Generate button clicked');
    await sleep(1000);
}

// ============================================
// Wait for Generation Completion
// ============================================
async function waitForCompletion() {
    console.log('⏳ Waiting for image generation to complete...');

    const maxWaitTime = 180000; // 3 minutes

    // Wait for generation to start
    console.log('⏱️ Waiting 3 seconds for generation to start...');
    await sleep(3000);

    // Monitor Stop button using MutationObserver (works in background tabs)
    console.log('👀 Monitoring Stop button with MutationObserver...');

    return new Promise((resolve) => {
        const startTime = Date.now();
        let checkCount = 0;

        // Initial check
        const initialStopBtn = document.querySelector(SELECTORS.stopBtn);
        if (!initialStopBtn || initialStopBtn.offsetParent === null) {
            console.log('✅ Generation already complete!');
            resolve({ success: true, message: 'Complete' });
            return;
        }

        // Set up timeout
        const timeout = setTimeout(() => {
            observer.disconnect();
            console.error('❌ Timeout waiting for completion');
            resolve({ success: false, error: 'Timeout' });
        }, maxWaitTime);

        // Create a MutationObserver to watch for DOM changes
        const observer = new MutationObserver(() => {
            const stopBtn = document.querySelector(SELECTORS.stopBtn);
            checkCount++;

            // Log progress every 5 checks
            if (checkCount % 5 === 0) {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                console.log(`🔄 Still generating... (${elapsed}s)`);
            }

            // Check if stop button disappeared
            if (!stopBtn || stopBtn.offsetParent === null) {
                clearTimeout(timeout);
                observer.disconnect();
                console.log('✅ Generation complete!');

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
                console.log('✅ Generation complete (backup check)!');
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

console.log('✅ Content script ready!');
