'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DEFAULT_URL =
  'https://www.hirschdynamics.com/onyxwebview/Hirsch.html?mlink=https://www.hirschdynamics.com/onyxwebview/Client3406/AOMNVP/298E758F4355477A8B95DC23E25CFAEA.iiwgl&p=OTEAUB';

const LOGO_PATH = '/ORALIGN BLACK.png';

export default function TestWebViewPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerHtml, setViewerHtml] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [injectionStatus, setInjectionStatus] = useState(
    'Hirsch shell URLs are opened inside a smart Oralign-branded iframe shell.',
  );

  const openViewer = () => {
    const normalized = normalizeUrl(url);

    if (!normalized) {
      setError('Please enter a valid http or https URL.');
      return;
    }

    setError('');
    const preparedViewer = prepareViewer(normalized, getAbsoluteLogoUrl());

    setInjectionStatus(
      preparedViewer.srcDoc
        ? 'Smart iframe shell prepared. It finds the logo by image signals and replaces it with your Oralign logo.'
        : 'Opening URL in the web view container. Injection will run only if same-origin access is allowed.',
    );
    setViewerUrl('');
    setViewerHtml('');
    setSourceUrl(normalized);
    setIsPreparing(true);
    setIsLoading(true);

    window.setTimeout(() => {
      setViewerUrl(preparedViewer.viewerUrl);
      setViewerHtml(preparedViewer.srcDoc);
      setIsPreparing(false);
    }, 750);
  };

  const reloadViewer = () => {
    const normalized = normalizeUrl(sourceUrl || url);
    if (!normalized) return;

    const preparedViewer = prepareViewer(normalized, getAbsoluteLogoUrl());
    setViewerUrl('');
    setViewerHtml('');
    setIsLoading(true);
    window.setTimeout(() => {
      setViewerUrl(preparedViewer.viewerUrl);
      setViewerHtml(preparedViewer.srcDoc);
    }, 100);
  };

  const injectLogo = () => {
    const iframe = iframeRef.current;

    try {
      const iframeDocument =
        iframe?.contentDocument ?? iframe?.contentWindow?.document;

      if (!iframeDocument) {
        throw new Error('The frame document is not available.');
      }

      const logoUrl = `${window.location.origin}${LOGO_PATH}`;
      const images = findLogoImagesSmart(iframeDocument);

      images.forEach((image) => {
        image.dataset.oralignLogoApplied = 'true';
        image.src = logoUrl;
        image.srcset = '';
        image.sizes = '';
        image.alt = 'Oralign';
        image.style.objectFit = 'contain';
        image.style.height = 'auto';
        image.style.minWidth = '92px';
        image.style.maxWidth = '160px';
      });

      setInjectionStatus(
        images.length > 0
          ? `Smart logo injection applied to ${images.length} logo image${images.length === 1 ? '' : 's'}.`
          : 'Page loaded, but no likely logo image was found.',
      );
    } catch {
      setInjectionStatus(
        'Browser blocked JavaScript injection because this URL is cross-origin. Use a native WebView injectedJavaScript hook for this external page.',
      );
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 p-4 lg:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="rounded-lg border bg-background p-4 shadow-sm lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Image
                  src={LOGO_PATH}
                  alt="Oralign"
                  width={112}
                  height={44}
                  priority
                  className="h-10 w-auto"
                />
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    Web View Test
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Load a URL inside a branded viewer container.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={openViewer}>
                <Play className="mr-2 h-4 w-4" />
                Open URL
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!viewerUrl}
                onClick={reloadViewer}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload
              </Button>
              <Button asChild type="button" variant="outline" disabled={!viewerUrl}>
                <a href={sourceUrl || viewerUrl || DEFAULT_URL} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  External
                </a>
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <label className="text-sm font-medium" htmlFor="webview-url">
              URL
            </label>
            <Input
              id="webview-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className={cn(error && 'border-red-500 focus-visible:ring-red-500')}
            />
            {error && (
              <p className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex min-h-12 flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">Viewer container</p>
              <p className="break-all text-xs text-muted-foreground">
                {sourceUrl || viewerUrl || 'No URL opened yet'}
              </p>
            </div>
            <p className="max-w-xl text-xs text-muted-foreground">
              {injectionStatus}
            </p>
          </div>

          <div className="relative h-[calc(100vh-260px)] min-h-[520px] bg-muted/40">
            {viewerUrl && !viewerHtml && (
              <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-md bg-white/90 p-3 shadow-lg ring-1 ring-black/10 backdrop-blur-sm">
                <Image
                  src={LOGO_PATH}
                  alt="Oralign"
                  width={150}
                  height={58}
                  priority
                  className="h-12 w-auto"
                />
              </div>
            )}

            {viewerUrl ? (
              <iframe
                ref={iframeRef}
                key={`${viewerHtml ? 'smart-shell' : 'direct'}-${viewerUrl}`}
                src={viewerHtml ? undefined : viewerUrl}
                srcDoc={viewerHtml || undefined}
                title="Web view test container"
                className={cn(
                  'h-full w-full border-0 bg-background transition-opacity duration-300',
                  (isPreparing || isLoading) && 'opacity-0',
                )}
                allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                onLoad={() => {
                  setIsLoading(false);
                  if (viewerHtml) {
                    setInjectionStatus(
                      'Smart iframe logo script is active inside the viewer shell.',
                    );
                    return;
                  }

                  if (viewerUrl === sourceUrl) {
                    injectLogo();
                  }
                }}
              />
            ) : null}

            {(!viewerUrl || isPreparing || isLoading) && (
              <div className="absolute inset-0 grid place-items-center bg-background">
                <div className="grid justify-items-center gap-4 text-center">
                  <Image
                    src={LOGO_PATH}
                    alt="Oralign"
                    width={180}
                    height={70}
                    priority
                    className="h-16 w-auto"
                  />
                  <div>
                    <p className="text-base font-semibold">
                      {viewerUrl ? 'Opening viewer...' : 'Ready to open URL'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {viewerUrl
                        ? 'Your branded loading screen is shown before the page appears.'
                        : 'Paste a URL and click Open URL.'}
                    </p>
                  </div>
                  {viewerUrl && (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function getAbsoluteLogoUrl() {
  return `${window.location.origin}${LOGO_PATH}`;
}

function prepareViewer(value: string, logoUrl: string) {
  const embeddedViewer = resolveEmbeddedViewer(value);

  if (embeddedViewer.kind === 'hirsch-shell') {
    return {
      viewerUrl: embeddedViewer.viewerUrl,
      srcDoc: buildSmartLogoShell(embeddedViewer.viewerUrl, logoUrl),
    };
  }

  return {
    viewerUrl: value,
    srcDoc: '',
  };
}

function resolveEmbeddedViewer(value: string) {
  const parsed = new URL(value);
  const isHirschShell =
    parsed.hostname === 'www.hirschdynamics.com' &&
    parsed.pathname.toLowerCase().endsWith('/onyxwebview/hirsch.html');

  if (!isHirschShell) {
    return {
      kind: 'direct-url' as const,
      viewerUrl: value,
    };
  }

  return {
    kind: 'hirsch-shell' as const,
    viewerUrl: `${parsed.origin}/onyxwebview/Viewer/main.html${parsed.search}`,
  };
}

function buildSmartLogoShell(viewerUrl: string, logoUrl: string) {
  const safeViewerUrl = escapeHtmlAttribute(viewerUrl);
  const safeLogoUrl = escapeHtmlAttribute(logoUrl);
  const logoUrlScriptValue = JSON.stringify(logoUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #ffffff;
    }

    .oralign-smart-logo {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 2;
      box-sizing: border-box;
      width: 20vw;
      min-width: 92px;
      max-width: 180px;
      height: auto;
      padding: 10px 12px;
      object-fit: contain;
      background: rgba(255, 255, 255, 0.9);
      border-bottom-right-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
    }

    iframe {
      position: fixed;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 0;
    }
  </style>
</head>
<body>
  <img
    id="OralignSmartLogo"
    class="oralign-smart-logo"
    data-brand-logo="true"
    src="${safeLogoUrl}"
    alt="Oralign"
  />
  <iframe
    name="OnyxCephWebGL"
    src="${safeViewerUrl}"
    allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay"
  ></iframe>

  <script>
    (function () {
      'use strict';

      var LOGO_URL = ${logoUrlScriptValue};
      var MARKER = 'oralignLogoApplied';
      var scheduled = 0;

      function getText(image) {
        var parent = image.closest('[id], [class], [role], header');
        return [
          image.id,
          image.className,
          image.alt,
          image.title,
          image.currentSrc,
          image.src,
          parent && parent.id,
          parent && parent.className,
          parent && parent.getAttribute('role'),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
      }

      function isVisible(image) {
        var rect = image.getBoundingClientRect();
        var style = window.getComputedStyle(image);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) !== 0
        );
      }

      function scoreLogoCandidate(image) {
        if (!isVisible(image)) return -1;

        var rect = image.getBoundingClientRect();
        var style = window.getComputedStyle(image);
        var text = getText(image);
        var score = 0;

        if (text.indexOf('hirsch') >= 0) score += 130;
        if (/(logo|brand|company|header|watermark)/.test(text)) score += 95;
        if (image.hasAttribute('data-brand-logo')) score += 85;
        if (rect.left <= window.innerWidth * 0.35) score += 18;
        if (rect.top <= window.innerHeight * 0.25) score += 18;
        if (rect.width >= 30 && rect.width <= Math.max(260, window.innerWidth * 0.4)) {
          score += 20;
        }
        if (rect.height <= Math.max(150, window.innerHeight * 0.25)) score += 12;

        var zIndex = Number.parseInt(style.zIndex || '0', 10);
        if (!Number.isNaN(zIndex) && zIndex > 0) score += 8;
        if (rect.width > window.innerWidth * 0.65 || rect.height > window.innerHeight * 0.65) {
          score -= 120;
        }

        return score;
      }

      function applyLogo(image) {
        if (!image) return;
        if (image.dataset[MARKER] === 'true' && image.src === LOGO_URL) return;

        image.dataset[MARKER] = 'true';
        image.src = LOGO_URL;
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        image.alt = 'Oralign';
        image.style.objectFit = 'contain';
        image.style.width = '20vw';
        image.style.minWidth = '92px';
        image.style.maxWidth = '180px';
        image.style.height = 'auto';
        image.style.zIndex = '2';

        if (window.getComputedStyle(image).position === 'static') {
          image.style.position = 'absolute';
        }

        if (!image.style.top) image.style.top = '0px';
        if (!image.style.left) image.style.left = '0px';
      }

      function replaceLogoSmart() {
        var candidates = Array.prototype.slice
          .call(document.images)
          .map(function (image) {
            return { image: image, score: scoreLogoCandidate(image) };
          })
          .filter(function (candidate) {
            return candidate.score >= 30;
          })
          .sort(function (a, b) {
            return b.score - a.score;
          });

        var target = candidates[0] && candidates[0].image;
        if (!target) target = document.querySelector('[data-brand-logo="true"]');
        applyLogo(target);
      }

      function scheduleReplace() {
        window.clearTimeout(scheduled);
        scheduled = window.setTimeout(replaceLogoSmart, 50);
      }

      window.addEventListener('DOMContentLoaded', scheduleReplace);
      window.addEventListener('load', scheduleReplace);

      new MutationObserver(scheduleReplace).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'class', 'id', 'alt', 'style'],
      });

      scheduleReplace();
    })();
  </script>
</body>
</html>`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findLogoImagesSmart(documentRef: Document) {
  const selectorMatches = new Set<HTMLImageElement>();
  const selectors = [
    'img[src*="Hirsch.png" i]',
    'img[src*="Hirsch" i]',
    'img[src*="logo" i]',
    'img[alt*="logo" i]',
    'img[title*="logo" i]',
    '.logo img',
    '#logo img',
    '[class*="logo" i] img',
    '[id*="logo" i] img',
    '[class*="brand" i] img',
    '[id*="brand" i] img',
  ];

  documentRef
    .querySelectorAll<HTMLImageElement>(selectors.join(','))
    .forEach((image) => selectorMatches.add(image));

  const scoredImages = Array.from(documentRef.images)
    .map((image) => ({
      image,
      score: scoreLogoImage(image),
    }))
    .filter((candidate) => candidate.score >= 30)
    .sort((a, b) => b.score - a.score);

  const bestScoredImage = scoredImages[0]?.image;
  if (bestScoredImage) selectorMatches.add(bestScoredImage);

  return Array.from(selectorMatches);
}

function scoreLogoImage(image: HTMLImageElement) {
  const rect = image.getBoundingClientRect();
  const style = window.getComputedStyle(image);

  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity || 1) === 0
  ) {
    return -1;
  }

  const parent = image.closest('[id], [class], [role], header');
  const text = [
    image.id,
    image.className,
    image.alt,
    image.title,
    image.currentSrc,
    image.src,
    parent?.id,
    parent?.className,
    parent?.getAttribute('role'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;

  if (text.includes('hirsch')) score += 130;
  if (/(logo|brand|company|header|watermark)/.test(text)) score += 95;
  if (rect.left <= window.innerWidth * 0.35) score += 18;
  if (rect.top <= window.innerHeight * 0.25) score += 18;
  if (rect.width >= 30 && rect.width <= Math.max(260, window.innerWidth * 0.4)) {
    score += 20;
  }
  if (rect.height <= Math.max(150, window.innerHeight * 0.25)) score += 12;

  const zIndex = Number.parseInt(style.zIndex || '0', 10);
  if (!Number.isNaN(zIndex) && zIndex > 0) score += 8;
  if (rect.width > window.innerWidth * 0.65 || rect.height > window.innerHeight * 0.65) {
    score -= 120;
  }

  return score;
}
