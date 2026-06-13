import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogDetail } from "@/lib/types";
import { dict, DEFAULT_LANG } from "../../../_lib/i18n/dict";
import { Reveal } from "../../../_components/shared/reveal";
import { getPostBySlug } from "../_lib/fetch";
import { BlockRenderer } from "../_components/block-renderer";
import { ArticleByline } from "../_components/article-byline";
import { ShareButtons } from "../_components/share-buttons";
import { RelatedPosts } from "../_components/related-posts";

// Mirrors the SITE_URL constant in the (showcase) layout. Kept in sync by
// hand because the layout doesn't export it; the canonical / OG / JSON-LD
// absolute URLs all derive from this.
const SITE_URL = "https://oralign.com.tn";

export const revalidate = 60;

type Params = { slug: string };

/** Absolute URL for the post's best-available cover (lg variant first). */
function coverAbsoluteUrl(post: BlogDetail): string | null {
  const rel =
    post.cover?.lgUrl ?? post.cover?.mdUrl ?? post.cover?.url ?? null;
  const resolved = resolveBlogMediaUrl(rel);
  if (!resolved) return null;
  // resolveBlogMediaUrl prefixes the API origin (e.g. http://localhost:3000)
  // for relative paths and passes absolute http(s) URLs through. Either way
  // it's a fully-qualified URL suitable for OG/JSON-LD.
  return resolved;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) {
    return { title: "Article introuvable | ORALIGN®", robots: { index: false } };
  }

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || undefined;
  const canonical = `/practitioner/blog/${post.slug}`;
  const cover = coverAbsoluteUrl(post);

  return {
    title,
    description,
    keywords: post.seoKeywords?.length ? post.seoKeywords : undefined,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      images: cover ? [{ url: cover }] : undefined,
      publishedTime: post.publishedAt ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function PractitionerBlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const lang = DEFAULT_LANG;
  const canonicalPath = `/practitioner/blog/${post.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const cover = coverAbsoluteUrl(post);

  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: cover ? [cover] : undefined,
    datePublished: post.publishedAt ?? undefined,
    articleSection: post.category || undefined,
    author: post.authorName
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: "ORALIGN by Aura Aligners" },
    publisher: {
      "@type": "Organization",
      name: "ORALIGN by Aura Aligners",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/mainlogo.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
  };

  return (
    <article className="bg-[var(--sc-white)] text-[var(--sc-black)]">
      <Script
        id={`ld-article-${post.slug}`}
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {JSON.stringify(ldArticle)}
      </Script>

      {/* ── Header ── */}
      <div style={{ padding: "72px 24px 0" }}>
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <Link
              href="/practitioner/blog"
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
              {post.title}
            </h1>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <ArticleByline
                authorName={post.authorName}
                publishedAt={post.publishedAt}
                readingTime={post.readingTime}
              />
              <ShareButtons url={canonicalUrl} title={post.title} />
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
                  alt={post.coverImageAlt || post.title}
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
            <BlockRenderer blocks={post.content} />
          </Reveal>

          <div className="mt-12 flex flex-col gap-5 border-t border-[var(--sc-grey)] pt-8 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/practitioner/blog"
              className="inline-flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.18em] text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {dict.blog.backToBlog[lang]}
            </Link>
            <ShareButtons url={canonicalUrl} title={post.title} />
          </div>
        </div>
      </div>

      {/* ── Related ── */}
      <RelatedPosts posts={post.related ?? []} />
    </article>
  );
}
