// ─── Time Zone Contextual Converter v2 — Background Service Worker ───
// Registers context menu and routes messages to content script.

const DEFAULTS = {
  fallbackZone: 'America/Chicago',
};

const MENU_ID = 'tz-get-my-time';

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '🕐 Get My Time',
      contexts: ['selection'],
    });
  });
}

// Re-create the menu on install/update AND on every browser startup, so the
// item never goes missing even if Chrome's persistence misbehaves.
chrome.runtime.onInstalled.addListener(() => {
  registerContextMenu();
  chrome.storage.sync.get(['fallbackZone'], (result) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...result });
  });
});
chrome.runtime.onStartup.addListener(registerContextMenu);

// Send a message to a tab; if the content script isn't there (orphaned after
// extension reload, or page loaded before install), inject it on demand and retry.
async function sendWithAutoInject(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return;
  } catch (e) {
    // Receiving end missing — try to inject the content script + CSS, then retry.
  }
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css'],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // Injection blocked (e.g., chrome:// pages, Web Store, PDF viewer, file:// without permission).
    console.warn('[GMT] Could not deliver to tab', tabId, '—', e?.message || e);
  }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText && tab?.id) {
    sendWithAutoInject(tab.id, {
      type: 'CONVERT_SELECTION',
      text: info.selectionText,
    }).catch((e) => console.warn('[GMT] menu click handler:', e?.message || e));
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
    sendWithAutoInject(sender.tab.id, {
      type: 'CONVERT_SELECTION',
      text: msg.text,
    }).catch((e) => console.warn('[GMT] TEST_CONVERT relay:', e?.message || e));
  }
});
