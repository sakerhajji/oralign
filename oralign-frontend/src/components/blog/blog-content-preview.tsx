'use client';

import * as React from 'react';
import Image from 'next/image';

import { useT } from '@/lib/i18n/lang-context';
import { resolveBlogMediaUrl } from '@/lib/api/blog.service';
import type { BlogBlock } from '@/lib/types';

/**
 * Lightweight in-DASHBOARD preview of structured blog content. Mirrors
 * the STRUCTURE of the public showcase renderer (exhaustive switch over
 * `BlogBlock['type']`, same safety rules) but styles everything with
 * the dashboard's shadcn tokens — it deliberately does NOT import the
 * showcase renderer (different i18n + --sc-* token system).
 *
 * Safety contract (identical to the public renderer):
 *   • Text content is rendered as plain children — React escapes it.
 *   • `video` blocks only embed YouTube / Vimeo; anything else falls
 *     back to a disabled placeholder.
 *   • `cta` hrefs are only honoured when they start with '/' or
 *     'https://' (otherwise the button renders disabled).
 */
export function BlogContentPreview({ blocks }: { blocks: BlogBlock[] }) {
  const { t } = useT();

  if (!blocks || blocks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('blogAdmin.blocks.empty')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

/** Build a safe embed URL for the supported video hosts, or null. */
function videoEmbedUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube — youtu.be/<id> or youtube.com/watch?v=<id>
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parsed.searchParams.get('v');
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    // /embed/<id> already
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' && parts[1]) {
      return `https://www.youtube.com/embed/${encodeURIComponent(parts[1])}`;
    }
    return null;
  }

  // Vimeo — vimeo.com/<id> or player.vimeo.com/video/<id>
  if (host === 'vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id
      ? `https://player.vimeo.com/video/${encodeURIComponent(id)}`
      : null;
  }
  if (host === 'player.vimeo.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'video' && parts[1]) {
      return `https://player.vimeo.com/video/${encodeURIComponent(parts[1])}`;
    }
    return null;
  }

  return null;
}

/** A CTA / link href is only honoured for internal paths or https URLs. */
function isSafeHref(url: string): boolean {
  return url.startsWith('/') || url.startsWith('https://');
}

function BlockView({ block }: { block: BlogBlock }) {
  const { t } = useT();

  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h2 className="text-xl font-bold tracking-tight">{block.content}</h2>
      ) : (
        <h3 className="text-lg font-semibold tracking-tight">
          {block.content}
        </h3>
      );

    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {block.content}
        </p>
      );

    case 'image': {
      const src = resolveBlogMediaUrl(block.url || null);
      if (!src) return null;
      return (
        <figure className="space-y-1.5">
          <div className="overflow-hidden rounded-lg border">
            <Image
              src={src}
              alt={block.alt || ''}
              width={block.width ?? 1200}
              height={block.height ?? 800}
              unoptimized
              className="h-auto w-full object-cover"
            />
          </div>
          {block.caption ? (
            <figcaption className="text-center text-xs text-muted-foreground">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case 'gallery': {
      const images = block.images.filter((img) => !!img.url);
      if (images.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((img, idx) => {
            const src = resolveBlogMediaUrl(img.url || null);
            if (!src) return null;
            return (
              <div
                key={`${img.imageId ?? img.url}-${idx}`}
                className="overflow-hidden rounded-lg border"
              >
                <Image
                  src={src}
                  alt={img.alt || ''}
                  width={img.width ?? 600}
                  height={img.height ?? 600}
                  unoptimized
                  className="aspect-square size-full object-cover"
                />
              </div>
            );
          })}
        </div>
      );
    }

    case 'video': {
      const embed = videoEmbedUrl(block.url);
      if (!embed) {
        return (
          <div className="grid aspect-video place-items-center rounded-lg border border-dashed bg-muted/30 text-center text-xs text-muted-foreground">
            {t('blogAdmin.blocks.videoHelp')}
          </div>
        );
      }
      return (
        <div className="aspect-video overflow-hidden rounded-lg border">
          <iframe
            src={embed}
            title="video"
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    case 'quote':
      return (
        <blockquote className="border-l-2 border-primary/60 pl-4 text-sm italic text-foreground/90">
          <p className="whitespace-pre-wrap">{block.content}</p>
          {block.cite ? (
            <cite className="mt-1 block text-xs not-italic text-muted-foreground">
              — {block.cite}
            </cite>
          ) : null}
        </blockquote>
      );

    case 'cta': {
      const safe = isSafeHref(block.url);
      if (!safe) {
        return (
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center rounded-md bg-muted px-4 text-sm font-medium text-muted-foreground"
          >
            {block.label || t('blogAdmin.blocks.types.cta')}
          </button>
        );
      }
      return (
        <a
          href={block.url}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          // Preview only — keep external links from navigating away
          // from the dialog accidentally.
          onClick={(e) => e.preventDefault()}
        >
          {block.label || t('blogAdmin.blocks.types.cta')}
        </a>
      );
    }

    case 'divider':
      return <hr className="border-border" />;
  }
}
