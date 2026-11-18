// Where The Stockroom lives and the owner token, kept in this browser only
// (chrome.storage.local, never synced to other machines).
export async function getSettings() {
  const { url = '', token = '' } = await chrome.storage.local.get(['url', 'token']);
  return { url: url.replace(/\/$/, ''), token };
}

export async function saveSettings({ url, token }) {
  await chrome.storage.local.set({ url: url.trim().replace(/\/$/, ''), token: token.trim() });
}
