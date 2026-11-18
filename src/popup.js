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
  'Jordan', 'Nike', 'adidas', 'Under Armour', 'New Balance', 'Puma', 'Converse', 'Reebok',
  'ASICS', 'Anta', 'Li-Ning', 'Way of Wade', '361', 'Peak', 'Rigorer', 'Vans', 'Saucony', 'Hoka', 'On',
];

// Brand shops often leave the brand out of the product name ("Kobe 8 Protro"
// on nike.com), so the site itself says whose shoe it is.
const SITE_BRANDS = {
  'nike.com': 'Nike', 'jordan.com': 'Jordan', 'adidas.com': 'adidas', 'adidas.ca': 'adidas',
  'newbalance.com': 'New Balance', 'newbalance.ca': 'New Balance', 'underarmour.com': 'Under Armour',
  'underarmour.ca': 'Under Armour', 'converse.com': 'Converse', 'puma.com': 'Puma', 'anta.com': 'Anta',
};

/** A shop that publishes no brand usually starts the title with it, or is the brand. */
function guessBrand(name, site) {
  const lower = name.toLowerCase();
  const inName = KNOWN_BRANDS.find((b) => lower.startsWith(`${b.toLowerCase()} `));
  if (inName) return inName;
  const fromSite = Object.entries(SITE_BRANDS).find(([domain]) => site === domain || site.endsWith(`.${domain}`));
  // Jordan product pages live on nike.com
  if (fromSite?.[1] === 'Nike' && /^(air )?jordan\b/i.test(name)) return 'Jordan';
  return fromSite?.[1] || '';
}

/**
 * Shop titles carry extra words around the shoe: a site suffix ("| Nike",
 * ". Nike.com"), a category ("Men's Basketball Shoes"), and a quoted
 * colourway in the middle ("Kobe 8 Protro 'Shanghai Fireworks' Basketball
 * Shoes"). Peel those off and split the colourway out.
 */
function splitName(name, brand) {
  let model = name
    .replace(/\s*[|–—]\s*[^|–—]*$/, '')
    .replace(/\.?\s*[A-Za-z]+\.(com|ca|co\.uk)\s*$/i, '')
    .replace(/\s+(men's|women's|kids'|big kids'|unisex)?\s*(basketball |running |lifestyle |skate )?(shoes?|sneakers?)\s*$/i, '')
    .trim();
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) model = model.slice(brand.length).trim();
  let colorway = '';
  const quoted = model.match(/^(.*?)\s*["'“‘](.+?)["'”’]\s*(.*)$/);
  if (quoted) {
    const [, before, inQuotes, after] = quoted;
    model = `${before} ${after}`.trim();
    colorway = inQuotes;
  }
  return { model, colorway };
}

/** Is this pair already filed, and what does StockX call it? One request. */
async function resolve(settings, sku) {
  try {
    return await api(settings, 'GET', `/api/pairs/resolve?sku=${encodeURIComponent(sku)}`);
  } catch {
    // An older server without /resolve: fall back to the duplicate check alone.
    const { found, pair } = await api(settings, 'GET', `/api/pairs/lookup?sku=${encodeURIComponent(sku)}`);
    return { existing: found ? pair : null, canonical: null };
  }
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

  const brand = found.brand || guessBrand(found.name || '', found.site);
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
  let imageUrl = found.image || '';
  if (imageUrl) img.src = imageUrl; else view.querySelector('figure').hidden = true;

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

  // Match on the style code, not the name: shops and StockX often call the
  // same colourway different things, but the code is printed on the box.
  // Already filed: say so. Known to StockX: show its name and photo, which
  // is exactly what will be saved, so the grid stays consistent.
  if (found.sku) {
    try {
      const { existing, canonical } = await resolve(settings, found.sku);
      if (existing) {
        setNote(`Already in your stockroom (${existing.status === 'owned' ? 'owned' : 'wishlist'}): ${existing.model} ${existing.colorway || ''}`, 'warn');
        save.textContent = 'Already saved';
        save.disabled = true;
      } else if (canonical) {
        field('brand').value = canonical.brand || field('brand').value;
        field('model').value = canonical.model || field('model').value;
        field('colorway').value = canonical.colorway || field('colorway').value;
        if (canonical.imageUrl) {
          imageUrl = canonical.imageUrl;
          img.src = imageUrl;
          view.querySelector('figure').hidden = false;
        }
        setNote(`Matched ${found.sku} on StockX: name and photo are StockX's, so it matches the rest of your grid.`, 'ok');
      } else {
        setNote(`Not found on StockX, so the details are read from ${found.site}. Check them before saving.`);
      }
    } catch {
      // a convenience: saving still works without it
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
        // The shop's photo is only kept when StockX doesn't know the shoe;
        // with a match, the server stores StockX's photo either way.
        imageUrl,
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
