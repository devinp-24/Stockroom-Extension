# Save to Stockroom

A Chrome extension that saves the sneaker you're looking at, on any shop, to
[The Stockroom](https://github.com/devinp-24/the-stockroom) wishlist in one
click (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>).

I keep a wishlist of 800+ pairs. Before this, adding one meant copying the
name and style code from a shop tab, switching to the app and searching
again. Now it takes one click from the page I'm already on.

## How it works

1. **Reading the page.** When you click the icon, a small function runs in the current tab. It reads
   the schema.org `Product` data most shops publish for search engines (name, brand, style code, colour,
   image, price). Then it falls back to Open Graph tags, then to a style-code pattern in the visible text.
2. **Checking first.** If there's a style code, the popup asks the Stockroom whether the pair is already
   filed, so you see "Already on your wishlist" before clicking anything.
3. **Saving.** One `POST /api/pairs`. With a style code, the server looks the shoe up on KicksDB and
   stores its canonical name, colourway, photo and market price, so a pair saved from any shop looks
   like one added by search. It also queues the write and refuses duplicates.

## Permissions

`activeTab`, `scripting` and `storage`, and nothing else. The extension can
only read a page after you click its icon on that page. It never runs in the
background and has no access to sites you haven't clicked it on. The
Stockroom address and owner token are kept in `chrome.storage.local`, in this
browser only.

## Install (unpacked)

1. `git clone https://github.com/devinp-24/stockroom-extension`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.
3. Open the extension's **Settings**, enter your Stockroom address and owner token, then click
   **Save and test**.

## Tested on

The extraction is tested against fixture pages with JSON-LD in a `@graph`
(Nike-style) and against Open-Graph-only pages. Shops change their markup, so
any field it gets wrong can be edited in the popup before saving.

## Next

- A right-click "Save image to Stockroom" for shops with no structured data.
- Show the market price against the page's price, so it's obvious whether this listing is a good deal.

MIT licence.
