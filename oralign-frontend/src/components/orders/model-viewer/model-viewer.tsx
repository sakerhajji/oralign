'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IndeterminateBar, Progress } from '@/components/ui/progress';
import { authedFetch } from '@/lib/api/authed-fetch';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { readBodyWithProgress } from '@/lib/utils/read-body-with-progress';
import { parseModelSource, parseModelVariant, type LoadedModel } from './mesh-loader';
import type { ModelFormat } from './model-format';
import { mountModelStage, type ModelStage } from './model-stage';

/**
 * Interactive 3D viewer for a scan (STL, PLY or OBJ), with the scanner's
 * colours when the file has them. Prefers the pipeline's optimized GLB and
 * falls back to the raw upload; point clouds render as points.
 */
export function ModelViewer({
  format,
  url,
  sizeBytes,
  glbUrl,
  glbBytes,
  large,
  onDownload,
}: {
  format: ModelFormat;
  /** Authenticated download URL of the original upload. */
  url: string;
  /** Stored size of the original — the progress total when the response has none. */
  sizeBytes: number;
  /** The pipeline's `model` variant, when it exists. */
  glbUrl?: string;
  glbBytes?: number;
  large?: boolean;
  onDownload: () => void;
}) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0); // bump to force retry
  // Download progress for the loading overlay. `percent` is null while
  // the byte total is unknown (no Content-Length and no size hint) and
  // during the parse/render phase — the bar then shows an indeterminate
  // sweep instead of a misleading frozen fill.
  const [loadPhase, setLoadPhase] = useState<'download' | 'render'>('download');
  const [loadPercent, setLoadPercent] = useState<number | null>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let abortController: AbortController | undefined;
    let model: LoadedModel | undefined;
    let stage: ModelStage | undefined;

    const clearCanvas = () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };

    /**
     * Self-diagnosing fetch — surfaces the actual HTTP status and a
     * trimmed response snippet instead of a generic "Unable to load"
     * message. Common real-world causes we want visible:
     *   - 401 → auth token expired between page load and model render
     *   - 404 → file row exists in DB but the bytes on disk are gone
     *   - 413 → nginx body-size limit hit (large scan)
     *   - network error → CORS / DNS / dropped connection
     */
    const fetchModelBuffer = async (
      signal: AbortSignal,
      sourceUrl: string,
      // Best-known byte total for the progress bar when the response
      // carries no usable Content-Length (e.g. transparently gzip'd).
      expectedBytes?: number,
    ) => {
      let response: Response;
      try {
        response = await authedFetch(sourceUrl, { signal });
      } catch (err) {
        // Network-level failures (DNS, CORS, offline, mixed-content)
        // arrive as TypeError("Failed to fetch") with no status code.
        throw new Error(
          `Network error contacting ${sourceUrl}: ${(err as Error).message}`,
        );
      }

      if (!response.ok) {
        // Try to surface the backend's reason without trusting it to
        // be JSON — exception filters sometimes return text/plain.
        let detail = '';
        try {
          const text = await response.text();
          detail = text.slice(0, 200);
        } catch {
          /* ignore */
        }
        throw new Error(
          `3D model download failed (HTTP ${response.status} ${response.statusText})` +
            (detail ? `: ${detail}` : ''),
        );
      }

      // Stream the body so the overlay can show real download progress
      // (a full-arch scan can be hundreds of MB on a clinic connection —
      // a frozen "Loading…" reads as a hang). Falls back to the plain
      // buffered read when streaming isn't available.
      const arrayBuffer = await readBodyWithProgress(
        response,
        expectedBytes,
        (percent) => {
          if (!disposed) setLoadPercent(percent);
        },
      );
      if (arrayBuffer.byteLength === 0) {
        throw new Error('3D model download returned 0 bytes.');
      }
      return arrayBuffer;
    };

    const init = async () => {
      try {
        setStatus('loading');
        setLoadPhase('download');
        setLoadPercent(0);
        setErrorMessage(undefined);
        clearCanvas();

        abortController = new AbortController();

        // Prefer the pipeline's optimized GLB (indexed + deduped —
        // typically 40-60% smaller than the raw file and parses faster).
        // Any GLB failure falls back to the original upload so the viewer
        // never regresses for legacy/unprocessed files.
        if (glbUrl) {
          try {
            const glbBuffer = await fetchModelBuffer(
              abortController.signal,
              glbUrl,
              glbBytes,
            );
            if (disposed) return;
            setLoadPhase('render');
            setLoadPercent(null);
            model = (await parseModelVariant(glbBuffer)) ?? undefined;
          } catch {
            model = undefined; // fall through to the raw upload
          }
          if (disposed) return;
          if (!model) {
            setLoadPhase('download');
            setLoadPercent(0);
          }
        }

        if (!model) {
          const arrayBuffer = await fetchModelBuffer(
            abortController.signal,
            url,
            sizeBytes,
          );
          if (disposed) return;
          setLoadPhase('render');
          setLoadPercent(null);
          // Yield one frame so the "rendering" overlay paints before the
          // synchronous parse (which can block the thread for a second or
          // two on a large scan).
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (disposed) return;
          model = await parseModelSource(arrayBuffer, format);
        }
        if (disposed) return;

        const mounted = await mountModelStage(container, model, Boolean(large));
        if (disposed) {
          mounted.dispose();
          return;
        }
        stage = mounted;
        setStatus('ready');
      } catch (error) {
        if (disposed) return;
        // Log full error to console — the UI message gets truncated and
        // we want stack + cause available in DevTools for diagnostics.
        console.error('[ModelViewer] load failed:', error);
        // undefined → the render falls back to the localized
        // t('media.unableToLoadStl') message.
        setErrorMessage(error instanceof Error ? error.message : undefined);
        setStatus('error');
      }
    };

    void init();

    return () => {
      disposed = true;
      abortController?.abort();
      stage?.dispose();
      model?.geometry.dispose();
      clearCanvas();
    };
    // `reloadKey` is part of the deps so clicking Retry replays the effect
    // without unmounting the component.
  }, [format, url, sizeBytes, glbUrl, glbBytes, large, reloadKey]);

  return (
    <div
      className={cn(
        // Default theme — soft light gradient. Matches the rest of the
        // dashboard's card surfaces; transparent canvas sits on top.
        'relative w-full overflow-hidden rounded-md bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_46%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.55))]',
        large ? 'h-full min-h-[420px]' : 'h-64 md:h-72',
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {status === 'loading' && (
        <div
          className="absolute inset-0 grid place-items-center bg-background/70 p-6"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-xs space-y-2.5 text-center">
            <p className="text-sm text-muted-foreground">
              {loadPhase === 'download'
                ? t('media.loading3d')
                : t('media.rendering3d')}
            </p>
            {loadPercent === null ? (
              <IndeterminateBar />
            ) : (
              <Progress value={loadPercent} className="h-1.5" />
            )}
            <p className="text-[11px] tabular-nums text-muted-foreground/80">
              {loadPercent === null
                ? loadPhase === 'download'
                  ? t('media.loadingSizeUnknown')
                  : t('media.rendering3dHint')
                : t('media.loadingPercent', { percent: Math.round(loadPercent) })}
            </p>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 p-4 text-center">
          <p className="max-w-md text-sm font-medium text-red-600">
            {errorMessage ?? t('media.unableToLoadStl')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('media.retry')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDownload}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              {t('media.downloadInstead')}
            </Button>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium shadow-sm">
          {t('media.dragHint')}
        </div>
      )}
    </div>
  );
}
