// ============================================
// BACKGROUND SERVICE WORKER
// ============================================

console.log('🔧 Background service worker initialized');

// Check if URL is Gemini
function isGeminiUrl(url) {
  return url && url.includes('gemini.google.com');
}

// Update side panel availability
async function updateSidePanel(tab) {
  const { id: tabId, url, windowId } = tab;

  if (isGeminiUrl(url)) {
    // Enable and configure side panel for Gemini tabs
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    // Disable side panel for non-Gemini tabs
    try {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
    } catch (error) {
      // Ignore errors if side panel wasn't enabled
    }
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    await updateSidePanel(tab);
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  await updateSidePanel(tab);
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (isGeminiUrl(tab.url)) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    console.log('Side panel only available on Gemini pages');
  }
});

// Initialize side panel for existing tabs on startup
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await updateSidePanel(tab);
  }
});
