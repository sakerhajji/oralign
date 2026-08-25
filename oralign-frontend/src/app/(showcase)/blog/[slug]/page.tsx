import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogDetail } from "@/lib/types";
import { getPostBySlug } from "../_lib/fetch";
import { BlogArticle } from "../_components/blog-article";
import { SITE_NAME, SITE_URL } from "../../_lib/seo/meta";
import { JsonLd } from "../../_lib/seo/jsonld";

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
  const canonical = `/blog/${post.slug}`;
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

  const canonicalPath = `/blog/${post.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const cover = coverAbsoluteUrl(post);

  // JSON-LD describes the FR version (matches the server metadata locale).
  // BlogPosting (the Article subtype crawlers expect for blog content),
  // rendered INLINE server-side so it ships in the initial HTML — the
  // previous next/script afterInteractive injection was invisible to
  // crawlers that don't execute JS.
  const ldArticle = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: pickFr(post.title),
    description: pickFr(post.seoDescription) || pickFr(post.excerpt) || undefined,
    image: cover ? [cover] : undefined,
    datePublished: post.publishedAt ?? undefined,
    inLanguage: "fr",
    articleSection: post.category || undefined,
    author: post.authorName
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
  };

  return (
    <article className="bg-[var(--sc-white)] text-[var(--sc-black)]">
      <JsonLd data={ldArticle} />
      <BlogArticle post={post} canonicalUrl={canonicalUrl} />
    </article>
  );
}
