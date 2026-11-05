import { useEffect, useState, useSyncExternalStore } from 'react';
import { readBodyWithProgress } from '@/lib/utils/read-body-with-progress';

/**
 * Tooth artwork for the odontogram, drawn as cached images.
 *
 * The sprite (`public/teeth-sprite.svg`, ~2.1 MB, 16 symbols) is very heavy
 * vector art: 6,839 paths, 904 gradients, 100 masks, 98 filters, 195
 * embedded PNGs, and opacity / isolation / blend classes on most paths.
 * Drawn live as `<svg><use href="#tooth-NN"/></svg>` (about 46 instances on
 * screen: a segmented tooth stacks one clipped copy per colour), every one
 * of those effects became paint chunks of the PAGE, so any repaint anywhere
 * on it (hovering a tooth, the dashboard sidebar, a popover, a keystroke)
 * made Chrome re-layerize all of them: 25–38 ms a frame, 100–174 ms with a
 * 4× CPU throttle.
 *
 * Each glyph now draws an IMAGE: a standalone SVG document cut from the
 * fetched sprite, one per (symbol, colour, outline), with `--tooth-color` /
 * `--tooth-outline` set on its root, where the artwork reads them. The page
 * paints an image as ONE item whatever it holds, and no copy of the sprite
 * lives in the DOM.
 *
 * The image goes in an SVG `<image>` inside the same outer `<svg>` as
 * before, not in an `<img>`: an `<img>` lays its SVG out at a box rounded
 * to whole pixels (61.25 → 61), which moved every edge by up to 0.08 px.
 * Sized in the tooth's own viewBox units, with `preserveAspectRatio="none"`
 * on both sides, the image lands exactly where the `<use>` instance did
 * (pixel-diffed against it: only edge anti-aliasing moves, by a few levels).
 *
 * Images are blob: URLs. If the frontend ever gets a Content-Security-Policy,
 * its `img-src` must allow `blob:`.
 */

// Sprite URL — Next.js serves /public files at the root.
const SPRITE_URL = '/teeth-sprite.svg';

// The sprite is served with a fixed size (~2.1 MB); used as the total when
// the response is content-encoded and Content-Length can't be trusted.
const SPRITE_EXPECTED_BYTES = 2_106_392;

/** An image no glyph shows any more is released after this long, so going
 *  back and forth between wizard steps reuses it instead of re-decoding. */
const RELEASE_AFTER_MS = 60_000;

type ToothSymbol = { viewBox: string; body: string };

type ToothArt = {
  url: string;
  /** Decoded and drawable (or failed: then nothing is drawn, rather than
   *  the chart waiting on it forever). */
  loaded: boolean;
  /** Keeps the decoded image in the document's image cache, so an
   *  `<image>` given this URL draws in the very frame it is inserted. */
  image: HTMLImageElement | null;
  /** Mounted glyphs showing it. */
  refs: number;
  releaseTimer: number | undefined;
};

/** Parsed sprite, kept for the session: symbol number → markup. */
let symbols: ReadonlyMap<number, ToothSymbol> | null = null;
let spritePromise: Promise<boolean> | null = null;
/** Download progress of the shared sprite: `null` = byte total unknown
 *  (indeterminate), 100 = downloaded and parsed. */
let spriteProgress: number | null = 0;
const art = new Map<string, ToothArt>();

// One change channel for React (useSyncExternalStore): download progress,
// sprite parsed, an image finished decoding.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publishSpriteProgress(percent: number | null) {
  spriteProgress = percent;
  notify();
}

/**
 * Through `<use>`, Chrome resolves the gradients a tooth references to the
 * ORIGINAL elements in the hidden sprite, where `--tooth-color` is not set:
 * the four gradient stops that read it (root tips of 16, 18, 36, 38 and
 * their mirrors) have always rendered black there. A standalone document
 * would resolve them to the tooth colour, so they are pinned to that black
 * to keep the look.
 */
function pinUseStopColors(body: string): string {
  return body.replace(
    /stop-color="var\(--tooth-(?:color|outline)\)"/g,
    'stop-color="#000"',
  );
}

/** Split the sprite into its symbols (generated markup: symbols never nest). */
function parseSprite(markup: string): Map<number, ToothSymbol> {
  const out = new Map<number, ToothSymbol>();
  const open = /<symbol\b([^>]*)>/g;
  for (let tag = open.exec(markup); tag; tag = open.exec(markup)) {
    const end = markup.indexOf('</symbol>', open.lastIndex);
    if (end === -1) break;
    const id = /\bid="tooth-(\d+)"/.exec(tag[1]);
    const viewBox = /\bviewBox="([^"]+)"/.exec(tag[1]);
    if (id && viewBox) {
      out.set(Number(id[1]), {
        viewBox: viewBox[1],
        body: pinUseStopColors(markup.slice(open.lastIndex, end)),
      });
    }
    open.lastIndex = end;
  }
  return out;
}

/**
 * Fetch + parse the sprite once per session; every odontogram on the page
 * shares the download (and its progress). Resolves false on failure — the
 * next mount retries.
 */
function loadToothSprite(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (symbols) return Promise.resolve(true);
  if (spritePromise) return spritePromise;

  spritePromise = fetch(SPRITE_URL, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load tooth sprite (${response.status})`);
      }
      // Stream so the skeleton can show real download progress — on a
      // slow clinic connection the 2 MB sprite is the visible wait.
      const buffer = await readBodyWithProgress(
        response,
        SPRITE_EXPECTED_BYTES,
        (percent) =>
          // Hold at 99 until the markup is parsed; the final 100 is
          // published below.
          publishSpriteProgress(percent === 100 ? 99 : percent),
      );
      const parsed = parseSprite(new TextDecoder().decode(buffer));
      if (parsed.size === 0) throw new Error('Tooth sprite has no symbols');
      symbols = parsed;
      publishSpriteProgress(100);
      return true;
    })
    .catch(() => {
      spritePromise = null;
      publishSpriteProgress(null);
      return false;
    });

  return spritePromise;
}

/** Cache key of one tooth image. */
export function toothArtKey(
  symbol: number,
  color: string,
  outline: string,
): string {
  return `${symbol}|${color}|${outline}`;
}

/**
 * The tooth as a document: what `<use>` instantiated (a nested `<svg>` with
 * the symbol's viewBox, clipped to it like a symbol instance) under a root
 * of the same `0 0 w h` box. `preserveAspectRatio="none"` makes the mapping
 * linear, so however the browser rounds the image's own size it cancels
 * out exactly.
 */
function toothDocument(
  { viewBox, body }: ToothSymbol,
  color: string,
  outline: string,
): string {
  const [, , width, height] = viewBox.split(/\s+/);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"` +
    ` style="--tooth-color:${color};--tooth-outline:${outline}">` +
    `<svg viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none">` +
    `${body}</svg></svg>`
  );
}

function scheduleRelease(key: string, entry: ToothArt) {
  window.clearTimeout(entry.releaseTimer);
  entry.releaseTimer = window.setTimeout(() => {
    if (entry.refs > 0) return;
    if (art.get(key) === entry) art.delete(key);
    URL.revokeObjectURL(entry.url);
    entry.image = null;
  }, RELEASE_AFTER_MS);
}

/** The image for a key, created (and decoding) on first use; null until the
 *  sprite is parsed. */
function getArt(key: string): ToothArt | null {
  const cached = art.get(key);
  if (cached) return cached;
  if (!symbols) return null;
  const [symbol, color, outline] = key.split('|');
  const source = symbols.get(Number(symbol));
  if (!source) return null;

  const url = URL.createObjectURL(
    new Blob([toothDocument(source, color, outline)], {
      type: 'image/svg+xml',
    }),
  );
  const image = new Image();
  const entry: ToothArt = {
    url,
    loaded: false,
    image,
    refs: 0,
    releaseTimer: undefined,
  };
  const settle = () => {
    if (entry.loaded) return;
    entry.loaded = true;
    notify();
  };
  image.onload = () => {
    if (typeof image.decode === 'function') image.decode().then(settle, settle);
    else settle();
  };
  image.onerror = settle;
  image.src = url;
  art.set(key, entry);
  // Released unless a glyph takes it (prefetched and never used).
  scheduleRelease(key, entry);
  return entry;
}

function isLoaded(id: string): boolean {
  const parsed = symbols;
  if (!parsed) return false;
  return id.split(' ').every((key) => {
    const entry = art.get(key);
    if (entry) return entry.loaded;
    // A symbol the sprite doesn't have draws nothing: don't wait for it.
    return !parsed.has(Number(key.split('|')[0]));
  });
}

function urlsOf(id: string): string[] {
  return id.split(' ').map((key) => art.get(key)?.url ?? '');
}

/** Take a reference on each image (creating it if needed); returns the
 *  matching release. */
function retain(keys: readonly string[]): () => void {
  const held: [string, ToothArt][] = [];
  for (const key of keys) {
    const entry = getArt(key);
    if (!entry) continue;
    entry.refs += 1;
    window.clearTimeout(entry.releaseTimer);
    held.push([key, entry]);
  }
  return () => {
    for (const [key, entry] of held) {
      entry.refs -= 1;
      if (entry.refs === 0) scheduleRelease(key, entry);
    }
  };
}

const serverFalse = () => false;
const serverProgress = () => 0;
const readProgress = () => spriteProgress;

/** Live download progress of the shared tooth sprite (see above). */
export function useToothSpriteProgress(): number | null {
  return useSyncExternalStore(subscribe, readProgress, serverProgress);
}

/**
 * True once the sprite is parsed and every image in `keys` has decoded.
 * The odontogram keeps its skeleton until then, so the teeth appear
 * together, not one by one.
 */
export function useToothArtReady(keys: readonly string[]): boolean {
  const id = keys.join(' ');
  const ready = useSyncExternalStore(
    subscribe,
    () => isLoaded(id),
    serverFalse,
  );
  useEffect(() => {
    let live = true;
    loadToothSprite().then((ok) => {
      if (!ok || !live) return;
      for (const key of id.split(' ')) getArt(key);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return ready;
}

/**
 * Image URLs for one glyph (one per colour band), held while it is mounted.
 * When the colours change to an image that hasn't decoded yet, this keeps
 * returning the previous URLs until it has: the tooth switches in one frame
 * and never shows blank. Null before anything was ever drawable.
 */
export function useToothArtUrls(
  keys: readonly string[],
): readonly string[] | null {
  const id = keys.join(' ');
  const loaded = useSyncExternalStore(
    subscribe,
    () => isLoaded(id),
    serverFalse,
  );
  const [shown, setShown] = useState<{
    id: string;
    urls: readonly string[];
  } | null>(null);
  if (loaded && shown?.id !== id) setShown({ id, urls: urlsOf(id) });
  useEffect(() => retain(id.split(' ')), [id]);
  return loaded ? urlsOf(id) : (shown?.urls ?? null);
}

/**
 * Start decoding images likely needed next (the colours a just-opened
 * tooth popover offers) while the browser is idle, so picking one swaps
 * the tooth at once.
 */
export function prefetchToothArt(keys: readonly string[]) {
  if (typeof window === 'undefined' || !symbols) return;
  const run = () => {
    for (const key of keys) getArt(key);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 500 });
  } else {
    window.setTimeout(run, 50);
  }
}
