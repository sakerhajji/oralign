"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogAudience, BlogBlock, BlogDetail, Localized } from "@/lib/types";
import { dict, type Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";
import { Reveal } from "../../../_components/shared/reveal";
import { BlockRenderer } from "./block-renderer";
import { ArticleByline } from "./article-byline";
import { ShareButtons } from "./share-buttons";
import { RelatedPosts } from "./related-posts";
import { recordView } from "../_lib/fetch";

/** Resolve a Localized<T> bag for the active showcase lang (ar → fr). */
function pick<T>(
  value: Localized<T> | Partial<Localized<T>> | T | null | undefined,
  lang: Lang,
): T {
  if (value == null) return "" as unknown as T;
  if (typeof value !== "object" || Array.isArray(value)) return value as T;
  const bag = value as Partial<Localized<T>>;
  const key = lang === "en" ? "en" : "fr";
  return (bag[key] ?? bag.fr ?? bag.en ?? ("" as unknown as T)) as T;
}

/**
 * Pick the active language's content blocks: the chosen language, falling
 * back to FR (showcase default) then EN. AR has no blog copy so it resolves
 * through the FR branch.
 */
function pickBlocks(
  content: { en: BlogBlock[]; fr: BlogBlock[] } | undefined,
  lang: Lang,
): BlogBlock[] {
  if (!content) return [];
  const key = lang === "en" ? "en" : "fr";
  return content[key] ?? content.fr ?? content.en ?? [];
}

/**
 * Client article body that REACTS to the showcase language toggle. The
 * server page renders one H1 (FR default) for SEO + JSON-LD; this
 * component renders the visible, language-aware article: localized title,
 * byline, cover, the block renderer for the active language, share row +
 * related rail. It also fires a single best-effort view-count increment on
 * mount (guarded against React 18 StrictMode double-invoke + slug changes).
 *
 * `canonicalUrl` is the absolute URL passed down from the server page
 * (used for the share targets); the language toggle never changes the URL.
 */
export function BlogArticle({
  post,
  audience,
  canonicalUrl,
}: {
  post: BlogDetail;
  audience: BlogAudience;
  canonicalUrl: string;
}) {
  const { lang } = useShowcaseLang();
  const viewedSlug = useRef<string | null>(null);

  useEffect(() => {
    // Fire ONCE per slug. The ref guards against StrictMode's double mount
    // in dev and a language toggle re-running the effect.
    if (viewedSlug.current === post.slug) return;
    viewedSlug.current = post.slug;
    void recordView(post.slug);
  }, [post.slug]);

  const title = pick(post.title, lang);
  const coverAlt = pick(post.coverImageAlt, lang) || title;
  const blocks = pickBlocks(post.content, lang);

  const backHref = `/${audience}/blog`;
  const cover =
    resolveBlogMediaUrl(
      post.cover?.lgUrl ?? post.cover?.mdUrl ?? post.cover?.url ?? null,
    ) ?? null;

  return (
    <>
      {/* ── Header ── */}
      <div style={{ padding: "72px 24px 0" }}>
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.18em] text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {dict.blog.backToBlog[lang]}
            </Link>

            {post.category ? (
              <div className="mt-7 flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.22em] text-[var(--sc-sun-deep)]">
                <span
                  className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun-deep)]"
                  aria-hidden="true"
                />
                <span>{post.category}</span>
              </div>
            ) : null}

            <h1
              className="sc-serif mt-4 leading-[1.1]"
              style={{
                fontSize: "clamp(2rem, 4.2vw, 3.2rem)",
                fontWeight: 300,
              }}
            >
              {title}
            </h1>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <ArticleByline
                authorName={post.authorName}
                publishedAt={post.publishedAt}
                readingTime={pick(post.readingTime, lang)}
              />
              <ShareButtons url={canonicalUrl} title={title} />
            </div>
          </Reveal>
        </div>
      </div>

      {/* ── Cover hero ── */}
      {cover ? (
        <div style={{ padding: "40px 24px 0" }}>
          <div className="mx-auto max-w-[1000px]">
            <Reveal delay>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[var(--sc-grey)]">
                <Image
                  src={cover}
                  alt={coverAlt}
                  fill
                  priority
                  unoptimized
                  sizes="(min-width: 1024px) 1000px, 100vw"
                  className="object-cover"
                />
              </div>
            </Reveal>
          </div>
        </div>
      ) : null}

      {/* ── Reading column ── */}
      <div style={{ padding: "48px 24px 24px" }}>
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <BlockRenderer blocks={blocks} />
          </Reveal>

          <div className="mt-12 flex flex-col gap-5 border-t border-[var(--sc-grey)] pt-8 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.18em] text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {dict.blog.backToBlog[lang]}
            </Link>
            <ShareButtons url={canonicalUrl} title={title} />
          </div>
        </div>
      </div>

      {/* ── Related ── */}
      <RelatedPosts posts={post.related ?? []} audience={audience} />
    </>
  );
}
