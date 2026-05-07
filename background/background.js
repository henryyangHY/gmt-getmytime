// ─── Time Zone Contextual Converter v2 — Background Service Worker ───
// Registers context menu and routes messages to content script.

const DEFAULTS = {
  fallbackZone: 'America/Chicago',
};

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tz-get-my-time',
      title: '🕐 Get My Time',
      contexts: ['selection'],
    });
  });

  chrome.storage.sync.get(['fallbackZone'], (result) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...result });
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tz-get-my-time' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONVERT_SELECTION',
      text: info.selectionText,
    });
  }
});

// Relay settings requests + test trigger
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['fallbackZone'], (result) => {
      sendResponse({ ...DEFAULTS, ...result });
    });
    return true;
  }
  // Test support: forward conversion request back to the same tab's content script
  if (msg.type === 'TEST_CONVERT' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'CONVERT_SELECTION',
      text: msg.text,
    });
  }
});
