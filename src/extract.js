// Runs inside the shop's page (injected on click, never in the background) and
// reads what the page already says about the product. Returns a plain object;
// it must not reference anything outside this function, because
// chrome.scripting serialises it on its own.
//
// Order of trust:
//   1. schema.org Product data in JSON-LD: Nike, Foot Locker, GOAT, most
//      Shopify stores and many others publish name, brand, SKU, image and price
//      for search engines.
//   2. Open Graph tags: almost every shop has og:title and og:image.
//   3. A style-code pattern in the visible text, e.g. "CW2190-300".
export function extractProduct() {
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const text = (v) => (typeof v === 'string' ? v.trim() : v?.name ? String(v.name).trim() : '');

  function findProduct(node) {
    for (const item of asArray(node)) {
      if (!item || typeof item !== 'object') continue;
      const type = asArray(item['@type']).map(String);
      if (type.includes('Product') || type.includes('ProductGroup')) return item;
      const nested = findProduct(item['@graph']) || findProduct(item.mainEntity) || findProduct(item.hasVariant);
      if (nested) return nested;
    }
    return null;
  }

  let product = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      product = findProduct(JSON.parse(script.textContent));
      if (product) break;
    } catch {
      // a malformed block on some other part of the page
    }
  }

  const meta = (name) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';

  // Style codes. Shops write the same code differently: Nike and StockX use
  // "CW2190-300", GOAT uses "CW2190 300", some shops run it together. Accept a
  // dash, a space or nothing between the two parts, and tidy the separator to
  // a dash so it looks like StockX's (matching ignores it either way).
  // Case-sensitive on purpose: codes are upper case, and a case-insensitive
  // match would happily take an ordinary word from a product description.
  const CODE = /^[A-Z0-9]{2,10}(?:[- ]?[A-Z0-9]{2,5})?$/;
  const tidyCode = (code) => code.trim().replace(/^([A-Z]{1,3}\d{3,5})[ ](\d{3})$/, '$1-$2');

  // Spec tables ("SKU" over "IQ5365 400" on GOAT, "Style: CW2190-300"
  // elsewhere) render as a label line followed by its value, or both on one
  // line. Read them as label/value pairs rather than searching loose text.
  const lines = document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  function labelled(labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const label of labels) {
        const same = line.match(new RegExp(`^${label}\\s*[:#]\\s*(.+)$`, 'i'));
        if (same) return same[1].trim();
        if (line.toLowerCase() === label.toLowerCase() && lines[i + 1]) return lines[i + 1];
      }
    }
    return '';
  }

  const fromLabels = () => {
    const value = labelled(['SKU', 'Style', 'Style Code', 'Style #', 'Style No', 'Product Code', 'Manufacturer SKU', 'Model Number']);
    return CODE.test(value) ? tidyCode(value) : '';
  };
  const fromLooseText = () => {
    // Last resort: a Nike-shaped code anywhere in the title or the top of the page.
    const text = `${document.title}\n${document.body.innerText.slice(0, 20000)}`;
    const hit = text.match(/\b([A-Z]{1,3}\d{3,5}[- ]\d{3})\b/);
    return hit ? tidyCode(hit[1]) : '';
  };
  const offers = asArray(product?.offers).flatMap((o) => asArray(o.offers || o));
  const price = offers.map((o) => Number(o.price ?? o.lowPrice)).find((n) => Number.isFinite(n) && n > 0) || null;
  const image = asArray(product?.image).map((i) => (typeof i === 'string' ? i : i?.url)).find(Boolean) || meta('og:image');

  return {
    url: location.href,
    site: location.hostname.replace(/^www\./, ''),
    name: text(product?.name) || meta('og:title') || document.title,
    brand: text(product?.brand),
    // GOAT's spec table names the colourway "Nickname"; "Colorway" there is
    // the material colour list ("Varsity Royal/White-Black-Metallic Silver").
    colorway: text(product?.color) || labelled(['Nickname']),
    sku: (() => {
      const structured = String(product?.sku || product?.mpn || product?.productID || '').trim();
      return (structured && CODE.test(structured) ? tidyCode(structured) : '') || fromLabels() || fromLooseText();
    })(),
    image: image || '',
    price,
    currency: offers.map((o) => o.priceCurrency).find(Boolean) || null,
    source: product ? 'structured data' : 'page tags',
  };
}
