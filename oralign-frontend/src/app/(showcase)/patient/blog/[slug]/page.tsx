import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import { BlogAudience } from "@/lib/types";
import type { BlogDetail } from "@/lib/types";
import { getPostBySlug } from "../_lib/fetch";
import { BlogArticle } from "../_components/blog-article";

// Mirrors the SITE_URL constant in the (showcase) layout. Kept in sync by
// hand because the layout doesn't export it; the canonical / OG / JSON-LD
// absolute URLs all derive from this.
const SITE_URL = "https://oralign.com.tn";

// This page belongs to the patient surface; every read + the notFound()
// audience guard pin to it.
const AUDIENCE = BlogAudience.PATIENT;

export const revalidate = 60;

type Params = { slug: string };

/**
 * Resolve a Localized bag to the FR value for server-rendered SEO, with
 * the same fr→en fallback as the client picker. Local (no client import).
 */
function pickFr<T>(
  value: { en?: T; fr?: T } | T | null | undefined,
): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return value as T;
  const bag = value as { en?: T; fr?: T };
  return (bag.fr ?? bag.en) as T | undefined;
}

/** Absolute URL for the post's best-available cover (lg variant first). */
function coverAbsoluteUrl(post: BlogDetail): string | null {
  const rel = post.cover?.lgUrl ?? post.cover?.mdUrl ?? post.cover?.url ?? null;
  return resolveBlogMediaUrl(rel);
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

  const title = pickFr(post.seoTitle) || pickFr(post.title) || "ORALIGN®";
  const description =
    pickFr(post.seoDescription) || pickFr(post.excerpt) || undefined;
  const keywords = pickFr<string[]>(post.seoKeywords);
  const canonical = `/patient/blog/${post.slug}`;
  const cover = coverAbsoluteUrl(post);

  return {
    title,
    description,
    keywords: keywords && keywords.length ? keywords : undefined,
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

export default async function PatientBlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const canonicalPath = `/patient/blog/${post.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const cover = coverAbsoluteUrl(post);

  // JSON-LD describes the FR version (matches the server metadata locale).
  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: pickFr(post.title),
    description: pickFr(post.seoDescription) || pickFr(post.excerpt) || undefined,
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

      <BlogArticle post={post} audience={AUDIENCE} canonicalUrl={canonicalUrl} />
    </article>
  );
}
