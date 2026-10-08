// Test-only extension in an owned isolated browser profile. No content scripts,
// network permissions, secrets, or product installation. The test invokes the
// native chrome.tabs zoom API on its exact local protected fixture tab.
chrome.runtime.onInstalled.addListener(() => {});
