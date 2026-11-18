// The popup: read the product off the current tab, let the owner fix anything
// the page got wrong, then send one POST to The Stockroom.
import { extractProduct } from './extract.js';
import { getSettings } from './settings.js';

const view = document.getElementById('view');
document.getElementById('settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

const say = (html) => { view.innerHTML = `<p class="status">${html}</p>`; };

const KNOWN_BRANDS = [
  'Air Jordan', 'Jordan', 'Nike', 'adidas', 'Under Armour', 'New Balance', 'Puma', 'Converse', 'Reebok',
  'ASICS', 'Anta', 'Li-Ning', 'Way of Wade', '361', 'Peak', 'Rigorer', 'Vans', 'Saucony', 'Hoka', 'On',
];

/** A shop that publishes no brand usually starts the title with it. */
function guessBrand(name) {
  const lower = name.toLowerCase();
  return KNOWN_BRANDS.find((b) => lower.startsWith(`${b.toLowerCase()} `)) || '';
}

/** Shops prefix the brand and often append the colourway: split them back out. */
function splitName(name, brand) {
  let model = name.replace(/\s*[|–-]\s*(Nike|StockX|GOAT|Foot Locker|adidas|New Balance|Flight Club)[^|]*$/i, '').trim();
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) model = model.slice(brand.length).trim();
  let colorway = '';
  const quoted = model.match(/^(.*?)\s*["'“‘](.+?)["'”’]\s*$/);
  if (quoted) [, model, colorway] = quoted;
  return { model, colorway };
}

async function api(settings, method, route, body) {
  const res = await fetch(`${settings.url}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('The Stockroom refused the owner token. Check it in Settings.');
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const settings = await getSettings();
  if (!settings.url || !settings.token) {
    say('Add your Stockroom address and owner token in <a href="#" id="go">Settings</a> first.');
    document.getElementById('go').onclick = () => chrome.runtime.openOptionsPage();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let found;
  try {
    [{ result: found }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProduct });
  } catch {
    say('This page cannot be read. Open a product page on a shop and try again.');
    return;
  }

  const brand = found.brand || guessBrand(found.name || '');
  const { model, colorway } = splitName(found.name || '', brand);
  view.replaceChildren(document.getElementById('product').content.cloneNode(true));
  const field = (n) => view.querySelector(`[name="${n}"]`);
  field('brand').value = brand;
  field('model').value = model;
  field('colorway').value = found.colorway || colorway;
  field('sku').value = found.sku || '';
  field('price').value = found.price ? String(Math.round(found.price)) : '';
  const img = view.querySelector('img');
  img.onerror = () => { view.querySelector('figure').hidden = true; };
  if (found.image) img.src = found.image; else view.querySelector('figure').hidden = true;

  let status = 'want';
  view.querySelectorAll('.toggle button').forEach((b) =>
    b.addEventListener('click', () => {
      status = b.dataset.status;
      view.querySelectorAll('.toggle button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
    })
  );

  const note = view.querySelector('.note');
  const save = view.querySelector('#save');
  const setNote = (text, tone = '') => { note.textContent = text; note.className = `note ${tone}`; };
  setNote(`Read from ${found.site} (${found.source}). Check the details, then save.`);

  // Already filed? Say so before the owner clicks anything.
  if (found.sku) {
    try {
      const { found: dupe, pair } = await api(settings, 'GET', `/api/pairs/lookup?sku=${encodeURIComponent(found.sku)}`);
      if (dupe) {
        setNote(`Already in your stockroom (${pair.status === 'owned' ? 'owned' : 'wishlist'}): ${pair.model} ${pair.colorway || ''}`, 'warn');
        save.textContent = 'Already saved';
        save.disabled = true;
      }
    } catch {
      // lookup is a convenience; saving still works without it
    }
  }

  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = 'Saving…';
    try {
      const sku = field('sku').value.trim();
      const { duplicate, pair } = await api(settings, 'POST', '/api/pairs', {
        brand: field('brand').value,
        model: field('model').value,
        colorway: field('colorway').value,
        sku,
        price: field('price').value,
        status,
        // An image the shop serves is a fallback: with a style code the
        // server swaps in KicksDB's photo, which matches the rest of the grid.
        imageUrl: found.image || '',
        notes: `Saved from ${found.site}`,
        lookup: Boolean(sku),
      });
      if (duplicate) {
        setNote('Already in your stockroom. Nothing added.', 'warn');
        save.textContent = 'Already saved';
      } else {
        setNote(`Saved ${pair.model} ${pair.colorway || ''} to your ${pair.status === 'owned' ? 'collection' : 'wishlist'}.`, 'ok');
        save.textContent = 'Saved';
      }
    } catch (error) {
      setNote(error.message, 'warn');
      save.disabled = false;
      save.textContent = 'Try again';
    }
  });
}

main();
