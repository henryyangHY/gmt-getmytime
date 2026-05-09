# Privacy Policy — GMT (Get My Time)

**Last updated:** 2026-05-10

## Summary

GMT (Get My Time) does **not** collect, store, or transmit any user data. The extension runs entirely within your browser.

## Data Collection

This extension does **not** collect any of the following:

- Personal information (name, email, etc.)
- Browsing history or website content
- Location data
- Analytics or usage telemetry
- Cookies or tracking identifiers

## How the Extension Works

1. When you select text on a webpage and right-click "🕐 Get My Time", the extension reads the selected text **locally in your browser** to parse time and timezone information.
2. The conversion result is displayed in a tooltip on the same page.
3. If you click "Add to Google Calendar", a URL is generated locally and opened in a new tab — no data is sent to any intermediary server.

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Read text selection on the current tab when you trigger "Get My Time" |
| `storage` | Save your timezone preference locally via `chrome.storage.sync` |
| `contextMenus` | Register the right-click "🕐 Get My Time" menu item |
| `<all_urls>` (content script) | Inject the tooltip UI on any webpage so the extension works everywhere |

## Third-Party Services

This extension does **not** communicate with any external server or third-party service. The only external interaction is when you explicitly click the Google Calendar button, which opens a Google Calendar URL in your browser.

## Changes

If this policy is updated, the changes will be reflected here with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/henryyang-microsoft/gmt-getmytime).
