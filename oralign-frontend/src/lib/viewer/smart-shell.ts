/**
 * Smart-shell viewer utilities.
 *
 * Used by every place that embeds a third-party 3D treatment viewer
 * (planner-side review, public patient viewer, /test QA page). The shell
 * is a tiny same-origin HTML document that:
 *
 *   1. Loads the actual viewer in an iframe at z-index 1
 *   2. Paints a solid white Oralign-branded panel at z-index 10 to
 *      occlude the third-party logo
 *   3. Holds the iframe at opacity 0 until its `load` event fires, so
 *      the third-party logo never even flashes during the load
 *
 * The most important trick is `resolveEmbeddedViewer` — when the URL
 * points at Hirsch's `Hirsch.html` WRAPPER (which contains the Hirsch
 * logo + an inner iframe to the WebGL viewer), we REWRITE it directly
 * to `Viewer/main.html`. That's the unbranded WebGL viewer underneath
 * Hirsch's wrapper. Loading it directly means the Hirsch logo never
 * loads in the first place — no CSS occlusion needed, the logo is
 * simply absent from the network.
 *
 * For URLs we don't recognise we fall through to the generic shell:
 * iframe + overlay panel. Cross-origin DOM access is impossible, so
 * visual occlusion is the browser-supported maximum for non-Hirsch
 * viewers.
 */

export type ViewerMode = 'internal' | 'external';

/** Hostnames that we know are HTML "shell" pages wrapping a deeper
 *  unbranded viewer. Each entry has a `match(parsed)` predicate and a
 *  `rewrite(parsed)` that returns the inner viewer URL. */
const KNOWN_SHELLS: Array<{
  name: string;
  match: (u: URL) => boolean;
  rewrite: (u: URL) => string;
}> = [
  {
    name: 'hirsch-onyxwebview',
    match: (u) =>
      u.hostname === 'www.hirschdynamics.com' &&
      u.pathname.toLowerCase().endsWith('/onyxwebview/hirsch.html'),
    // Skip the Hirsch.html wrapper (which paints the Hirsch logo) and
    // load Viewer/main.html directly. Query string is preserved so the
    // viewer still knows which case to render.
    rewrite: (u) =>
      `${u.origin}/onyxwebview/Viewer/main.html${u.search}`,
  },
];

const LOGO_PATH = '/ORALIGN BLACK.png';

/**
 * Parse the `#external` / `#internal` mode hash from a stored URL. New
 * plans default to `'external'` so the Oralign-branded shell is on by
 * default; the planner can opt out to `'internal'` for self-hosted
 * trusted viewers that don't need branding.
 */
export function parseViewerMode(url: string | null | undefined): ViewerMode {
  if (!url) return 'external';
  try {
    const u = new URL(url);
    const hash = u.hash.toLowerCase();
    if (hash.includes('internal')) return 'internal';
    if (hash.includes('external')) return 'external';
    return 'external';
  } catch {
    return 'external';
  }
}

export function stripViewerHash(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function withViewerHash(url: string, mode: ViewerMode): string {
  try {
    const u = new URL(url);
    u.hash = mode;
    return u.toString();
  } catch {
    return url;
  }
}

export function getAbsoluteLogoUrl(): string {
  if (typeof window === 'undefined') return LOGO_PATH;
  return `${window.location.origin}${LOGO_PATH}`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Result of resolving the user-supplied URL into something we can
 * actually embed. `kind` tells the caller whether we rewrote a known
 * shell to its inner viewer (and therefore can drop the wrapper logo
 * cleanly) or whether we're loading an unknown URL directly (in which
 * case we have to fall back to CSS occlusion).
 */
export type ResolvedViewer =
  | { kind: 'shell-rewritten'; viewerUrl: string; rewrittenFrom: string }
  | { kind: 'direct-url'; viewerUrl: string };

export function resolveEmbeddedViewer(rawUrl: string): ResolvedViewer {
  const clean = stripViewerHash(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return { kind: 'direct-url', viewerUrl: clean };
  }
  for (const shell of KNOWN_SHELLS) {
    if (shell.match(parsed)) {
      return {
        kind: 'shell-rewritten',
        viewerUrl: shell.rewrite(parsed),
        rewrittenFrom: clean,
      };
    }
  }
  return { kind: 'direct-url', viewerUrl: clean };
}

/**
 * Build a self-contained HTML page (intended for `<iframe srcDoc>`) that
 * embeds `viewerUrl` and brands it with the Oralign logo. The page is
 * carefully constructed so the Hirsch / third-party logo cannot leak
 * through during load — solid white panel at z-index 10, iframe held
 * at opacity 0 until its `load` event fires.
 */
export function buildSmartLogoShell(
  viewerUrl: string,
  logoUrl: string,
): string {
  const safeViewerUrl = escapeHtmlAttribute(viewerUrl);
  const safeLogoUrl = escapeHtmlAttribute(logoUrl);
  const logoUrlScriptValue = JSON.stringify(logoUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#fff; }

    /* Logo overlay pinned at top-left. No background / no pill chrome —
       the logo image stands on its own. A subtle drop-shadow stays on
       the IMAGE so it's still legible against light + dark viewer
       backgrounds. Sized roughly 2× the previous pill so the brand
       reads from across the room. */
    .oralign-smart-logo-panel {
      position: fixed; top: 16px; left: 16px; z-index: 10;
      box-sizing: border-box;
      display: flex; align-items: center; justify-content: flex-start;
      width: clamp(160px, 22vw, 240px);
      height: clamp(56px, 8vh, 84px);
      padding: 0;
      background: transparent;
      pointer-events: none;
    }
    .oralign-smart-logo-panel img {
      display: block;
      width: 100%; height: 100%;
      object-fit: contain;
      object-position: left center;
      /* Drop shadow on the logo itself so it's still readable against
         any background the third-party viewer paints behind it. */
     
    }

    iframe {
      position: fixed; inset: 0; z-index: 1;
      width: 100%; height: 100%; margin: 0; padding: 0;
      overflow: hidden; border: 0;
      opacity: 0;
      transition: opacity 140ms ease;
    }
    iframe.ready { opacity: 1; }
  </style>
</head>
<body>
  <div class="oralign-smart-logo-panel" aria-hidden="true">
    <img id="OralignSmartLogo" data-brand-logo="true" src="${safeLogoUrl}" alt="Oralign" />
  </div>
  <iframe id="ViewerFrame" name="OnyxCephWebGL" src="${safeViewerUrl}"
          allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"></iframe>
  <script>
    (function () {
      'use strict';
      var LOGO_URL = ${logoUrlScriptValue};
      var MARKER = 'oralignLogoApplied';
      var scheduled = 0;

      // Reveal the iframe only once it has actually loaded. The panel
      // is already painted on top, so the user sees Oralign branding
      // first and the viewer fades in behind it.
      var iframe = document.getElementById('ViewerFrame');
      if (iframe) {
        var reveal = function () { iframe.classList.add('ready'); };
        if (iframe.addEventListener) iframe.addEventListener('load', reveal);
        // Hard-cap: if the third-party page never fires \`load\` (some
        // long-running WebGL apps don't), reveal after 1.5 s so the
        // user isn't stuck on a blank panel.
        window.setTimeout(reveal, 1500);
      }

      function applyLogo(image) {
        if (!image) return;
        if (image.dataset[MARKER] === 'true' && image.src === LOGO_URL) return;
        image.dataset[MARKER] = 'true';
        image.src = LOGO_URL;
        image.removeAttribute('srcset'); image.removeAttribute('sizes');
        image.alt = 'Oralign';
      }
      function replaceLogoSmart() {
        // Keep our own panel logo on the Oralign asset (defends against
        // transient src tampering / lazy-load placeholders).
        var ours = document.querySelector('[data-brand-logo="true"]');
        if (ours) applyLogo(ours);
      }
      function scheduleReplace() {
        window.clearTimeout(scheduled);
        scheduled = window.setTimeout(replaceLogoSmart, 50);
      }
      window.addEventListener('DOMContentLoaded', scheduleReplace);
      window.addEventListener('load', scheduleReplace);
      new MutationObserver(scheduleReplace).observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['src', 'srcset', 'class', 'id', 'alt', 'style'],
      });
      scheduleReplace();
    })();
  </script>
</body>
</html>`;
}

/**
 * One-call helper: take a raw user-supplied URL + the desired mode and
 * return the iframe's `src` + `srcDoc`. The caller passes both to its
 * `<iframe>` and the right thing happens:
 *
 *   • If the URL points at a known shell (e.g. Hirsch.html), we rewrite
 *     it to the unbranded inner viewer and load that via srcDoc shell.
 *     The wrapper logo never even hits the network.
 *   • If mode === 'external' (default), we wrap the URL in the smart
 *     shell so the Oralign panel covers any logo in the top-left.
 *   • If mode === 'internal', we render the URL directly in a plain
 *     iframe — no shell, no injection.
 */
export function prepareViewer(
  rawUrl: string,
  mode: ViewerMode,
): { src?: string; srcDoc?: string } {
  if (!rawUrl) return {};
  const resolved = resolveEmbeddedViewer(rawUrl);
  if (mode === 'internal' && resolved.kind === 'direct-url') {
    return { src: resolved.viewerUrl };
  }
  // External (default) OR a known shell that we rewrote — wrap in our
  // branded srcDoc shell regardless of explicit mode, because a known
  // shell rewrite is itself the most effective de-branding action.
  return {
    srcDoc: buildSmartLogoShell(resolved.viewerUrl, getAbsoluteLogoUrl()),
  };
}
