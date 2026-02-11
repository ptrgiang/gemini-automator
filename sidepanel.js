// ============================================
// AUTO GEMINI GENERATOR - SIDE PANEL CONTROLLER
// ============================================

console.log('🎨 Gemini Automator initialized');

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
  isRunning: false,
  isPaused: false,
  prompts: [],
  currentIndex: 0
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
  promptList: document.getElementById('promptList'),
  promptCount: document.getElementById('promptCount'),
  minDelay: document.getElementById('minDelay'),
  maxDelay: document.getElementById('maxDelay'),
  setupBtn: document.getElementById('setupBtn'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  currentProgress: document.getElementById('currentProgress'),
  totalProgress: document.getElementById('totalProgress'),
  statusPill: document.getElementById('statusPill'),
  logArea: document.getElementById('logArea'),
  clearLogsBtn: document.getElementById('clearLogsBtn')
};

// ============================================
// LOGGING SYSTEM
// ============================================
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;

  elements.logArea.appendChild(logEntry);
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

// ============================================
// PROMPT PARSING
// ============================================
function parsePrompts() {
  const text = elements.promptList.value.trim();

  if (!text) {
    state.prompts = [];
    updatePromptCount(0);
    return;
  }

  // Split by single newlines
  state.prompts = text
    .split(/\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  updatePromptCount(state.prompts.length);
}

function updatePromptCount(count) {
  elements.promptCount.textContent = count.toString();
}

// ============================================
// PROGRESS TRACKING
// ============================================
function updateProgress() {
  const total = state.prompts.length;
  const current = state.currentIndex;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  elements.progressFill.style.width = `${percentage}%`;
  elements.progressPercentage.textContent = `${percentage}%`;
  elements.currentProgress.textContent = current;
  elements.totalProgress.textContent = total;
}

function setStatus(status, className = '') {
  elements.statusPill.textContent = status;
  elements.statusPill.className = `status-pill ${className}`;
}

// ============================================
// UI STATE MANAGEMENT
// ============================================
function setRunningState() {
  elements.startBtn.disabled = true;
  elements.pauseBtn.disabled = false;
  elements.stopBtn.disabled = false;
  elements.progressSection.style.display = 'block';
  setStatus('Running', 'running');
}

function setPausedState() {
  elements.pauseBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2L13 8L3 14V2Z" fill="currentColor"/>
    </svg>
    <span>Resume</span>
  `;
  setStatus('Paused', 'paused');
}

function setResumedState() {
  elements.pauseBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="2" width="3" height="12" fill="currentColor"/>
      <rect x="9" y="2" width="3" height="12" fill="currentColor"/>
    </svg>
    <span>Pause</span>
  `;
  setStatus('Running', 'running');
}

function setStoppedState() {
  elements.startBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.pauseBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="2" width="3" height="12" fill="currentColor"/>
      <rect x="9" y="2" width="3" height="12" fill="currentColor"/>
    </svg>
    <span>Pause</span>
  `;
  setStatus('Stopped', 'error');
}

function setCompletedState() {
  elements.startBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  setStatus('Completed', 'completed');
}

// ============================================
// VALIDATION
// ============================================
function validateSettings() {
  const errors = [];

  if (state.prompts.length === 0) {
    errors.push('Please enter at least one prompt');
  }

  const minDelay = parseInt(elements.minDelay.value);
  const maxDelay = parseInt(elements.maxDelay.value);

  if (minDelay >= maxDelay) {
    errors.push('Min delay must be less than max delay');
  }

  if (minDelay < 5) {
    errors.push('Min delay must be at least 5 seconds');
  }

  return errors;
}

async function validateGeminiTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.includes('gemini.google.com')) {
    throw new Error('Please open Gemini tab before starting');
  }

  return tab;
}

// ============================================
// BATCH PROCESSING
// ============================================
async function startBatchProcess(tabId) {
  for (let i = state.currentIndex; i < state.prompts.length; i++) {
    // Check if stopped
    if (!state.isRunning) {
      log('Batch process stopped', 'warning');
      break;
    }

    // Wait during pause
    while (state.isPaused && state.isRunning) {
      await sleep(500);
    }

    if (!state.isRunning) break;

    const prompt = state.prompts[i].trim();
    const promptPreview = prompt.length > 60
      ? prompt.substring(0, 60) + '...'
      : prompt;

    log(`Processing prompt ${i + 1}/${state.prompts.length}: ${promptPreview}`, 'info');

    try {
      // Verify tab still exists and make it active
      try {
        const tab = await chrome.tabs.get(tabId);

        // Make tab active to ensure rendering works
        await chrome.tabs.update(tabId, { active: true });
        await sleep(300);

        // Check if tab was discarded by Chrome
        if (tab.discarded) {
          await chrome.tabs.reload(tabId);
          await sleep(3000);
          log('Gemini tab was suspended, reloaded it', 'warning');
        }
      } catch (error) {
        log('Gemini tab was closed - stopping batch process', 'error');
        state.isRunning = false;
        break;
      }

      // Step 1: Fill prompt
      log('Filling prompt...', 'info');
      await chrome.tabs.sendMessage(tabId, {
        action: 'fillPrompt',
        prompt: prompt
      });
      await sleep(1000);

      // Step 2: Click generate
      log('Clicking generate button...', 'info');
      await chrome.tabs.sendMessage(tabId, {
        action: 'clickGenerate'
      });

      // Step 3: Wait for completion
      log('Waiting for image generation...', 'info');
      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'waitForCompletion'
      });

      if (!result.success) {
        log(`Error: ${result.error}`, 'error');
        continue;
      }

      log('Generation complete', 'success');

      // Update progress immediately after completion
      state.currentIndex = i + 1;
      updateProgress();

      // Step 4: Delay before next prompt
      if (i < state.prompts.length - 1) {
        const minDelay = parseInt(elements.minDelay.value);
        const maxDelay = parseInt(elements.maxDelay.value);
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        log(`Waiting ${delay} seconds before next prompt...`, 'info');
        await sleep(delay * 1000);
      }

    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      console.error('Batch process error:', error);

      // Check if it's a connection error (tab closed/navigated)
      if (error.message.includes('Could not establish connection') ||
          error.message.includes('Receiving end does not exist')) {
        log('Lost connection to Gemini tab - stopping', 'error');
        state.isRunning = false;
        break;
      }
    }
  }

  // Complete
  if (state.isRunning) {
    state.currentIndex = state.prompts.length;
    updateProgress();
    setCompletedState();
    log('All prompts completed successfully', 'success');

    // Show notification for background completion
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Gemini Automator',
        message: `Completed ${state.prompts.length} prompts!`,
        priority: 2
      });
    } catch (error) {
      console.log('Notification not available');
    }

    state.isRunning = false;
  }
}

// ============================================
// EVENT HANDLERS
// ============================================
elements.promptList.addEventListener('input', parsePrompts);

elements.setupBtn.addEventListener('click', async () => {
  // Validate Gemini tab
  let tab;
  try {
    tab = await validateGeminiTab();
  } catch (error) {
    log(error.message, 'error');
    return;
  }

  // Ensure content script is loaded
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await sleep(1000);
    } catch (injectError) {
      log('Failed to inject content script: ' + injectError.message, 'error');
      return;
    }
  }

  // Disable setup button during setup
  elements.setupBtn.disabled = true;

  // Setup Gemini
  try {
    log('Configuring Gemini...', 'info');
    await chrome.tabs.sendMessage(tab.id, { action: 'setupGemini' });
    log('Gemini configured: Create Image tool + Pro model selected', 'success');
  } catch (error) {
    log('Setup failed: ' + error.message, 'error');
    log('Try manually selecting Create Image tool and Pro model', 'info');
  } finally {
    elements.setupBtn.disabled = false;
  }
});

elements.startBtn.addEventListener('click', async () => {
  parsePrompts();

  // Validate settings
  const errors = validateSettings();
  if (errors.length > 0) {
    errors.forEach(error => log(error, 'error'));
    return;
  }

  // Validate Gemini tab
  let tab;
  try {
    tab = await validateGeminiTab();
  } catch (error) {
    log(error.message, 'error');
    return;
  }

  // Ensure content script is loaded
  try {
    log('Checking content script...', 'info');
    await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
  } catch (error) {
    log('Content script not found, injecting...', 'warning');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await sleep(1000); // Wait for script to initialize
      log('Content script injected', 'success');
    } catch (injectError) {
      log('Failed to inject content script: ' + injectError.message, 'error');
      return;
    }
  }

  // Initialize state
  state.isRunning = true;
  state.isPaused = false;
  state.currentIndex = 0;

  // Update UI
  setRunningState();
  updateProgress();
  log('Starting batch generation process', 'success');
  log('Keep Gemini tab visible/active - automation requires active tab', 'warning');
  log('Tip: Open Gemini in separate window to work in another window', 'info');

  // Auto-scroll to activity log
  setTimeout(() => {
    elements.logArea.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, 300);

  // Start processing
  startBatchProcess(tab.id);
});

elements.pauseBtn.addEventListener('click', () => {
  if (state.isPaused) {
    // Resume
    state.isPaused = false;
    setResumedState();
    log('Resumed batch process', 'info');
  } else {
    // Pause
    state.isPaused = true;
    setPausedState();
    log('Paused batch process', 'warning');
  }
});

elements.stopBtn.addEventListener('click', () => {
  state.isRunning = false;
  state.isPaused = false;
  setStoppedState();
  log('Stopped batch process', 'error');
});

elements.clearLogsBtn.addEventListener('click', () => {
  elements.logArea.innerHTML = '';
  log('Logs cleared', 'info');
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
  log('Gemini Automator ready', 'success');
  parsePrompts();
  updateProgress();
}

// Start application
init();
