import { getSettings, saveSettings } from './settings.js';

const url = document.getElementById('url');
const token = document.getElementById('token');
const result = document.getElementById('result');

const current = await getSettings();
url.value = current.url;
token.value = current.token;

document.getElementById('save').addEventListener('click', async () => {
  await saveSettings({ url: url.value, token: token.value });
  const s = await getSettings();
  try {
    const res = await fetch(`${s.url}/api/auth`, { headers: { Authorization: `Bearer ${s.token}` } });
    const data = await res.json();
    result.className = `note ${data.canEdit ? 'ok' : 'warn'}`;
    result.textContent = data.canEdit
      ? 'Connected. The extension can save to your Stockroom.'
      : 'Reached the Stockroom, but it did not accept that token.';
  } catch {
    result.className = 'note warn';
    result.textContent = 'Could not reach that address.';
  }
});
