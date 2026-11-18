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

  // Style codes: Nike/Jordan "CW2190-300", adidas "IF1234", New Balance "BB550WT1".
  const STYLE_CODE = /\b([A-Z]{1,3}\d{3,5}[- ]\d{3}|[A-Z]{2}\d{4}|[A-Z]{1,3}\d{3,4}[A-Z]{1,4}\d?)\b/;
  const fromText = () => {
    const labelled = document.body.innerText.match(/(?:style|sku|style code|product code)\s*[:#]?\s*([A-Z0-9-]{5,14})/i);
    if (labelled) return labelled[1].toUpperCase();
    const anywhere = document.body.innerText.slice(0, 20000).match(STYLE_CODE);
    return anywhere ? anywhere[1] : '';
  };

  const offers = asArray(product?.offers).flatMap((o) => asArray(o.offers || o));
  const price = offers.map((o) => Number(o.price ?? o.lowPrice)).find((n) => Number.isFinite(n) && n > 0) || null;
  const image = asArray(product?.image).map((i) => (typeof i === 'string' ? i : i?.url)).find(Boolean) || meta('og:image');

  return {
    url: location.href,
    site: location.hostname.replace(/^www\./, ''),
    name: text(product?.name) || meta('og:title') || document.title,
    brand: text(product?.brand),
    colorway: text(product?.color),
    sku: String(product?.sku || product?.mpn || product?.productID || '').trim() || fromText(),
    image: image || '',
    price,
    currency: offers.map((o) => o.priceCurrency).find(Boolean) || null,
    source: product ? 'structured data' : 'page tags',
  };
}
