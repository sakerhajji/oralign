"use client";

import Link from "next/link";
import Image from "next/image";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogSummary, Localized } from "@/lib/types";
import { dict, type Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { Reveal } from "../../_components/shared/reveal";

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
 * "Keep reading" rail under an article. Client component so dates + the
 * section heading follow the live language selection. Renders nothing when
 * the backend returned no siblings.
 */
export function RelatedPosts({
  posts,
}: {
  posts: BlogSummary[];
}) {
  const { lang } = useShowcaseLang();
  if (!posts || posts.length === 0) return null;

  return (
    <section
      aria-labelledby="related-h2"
      className="border-t border-[var(--sc-grey)]"
      style={{ padding: "72px 24px" }}
    >
      <div className="mx-auto max-w-[1100px]">
        <Reveal>
          <h2
            id="related-h2"
            className="sc-serif leading-[1.1]"
            style={{ fontSize: "clamp(1.5rem, 2.4vw, 2.2rem)", fontWeight: 300 }}
          >
            {dict.blog.relatedTitle[lang]}
          </h2>
        </Reveal>

        <ul className="mt-9 grid list-none grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <li key={post.id}>
              <Reveal delay={i % 3 === 2}>
                <RelatedCard post={post} lang={lang} />
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RelatedCard({
  post,
  lang,
}: {
  post: BlogSummary;
  lang: Lang;
}) {
  const cover =
    resolveBlogMediaUrl(post.cover?.thumbUrl ?? post.cover?.mdUrl ?? null) ??
    resolveBlogMediaUrl(post.cover?.url ?? null);
  const date = formatDate(post.publishedAt, lang);
  const title = pick(post.title, lang);
  const coverAlt = pick(post.coverImageAlt, lang) || title;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]"
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-[var(--sc-grey)]">
          {cover ? (
            <Image
              src={cover}
              alt={coverAlt}
              fill
              unoptimized
              loading="lazy"
              sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="sc-serif text-[1.6rem] text-[var(--sc-mid-grey)]">
                ORALIGN
              </span>
            </div>
          )}
        </div>
        {post.category ? (
          <span className="mt-4 text-[0.58rem] uppercase tracking-[0.2em] text-[var(--sc-sun-deep)]">
            {post.category}
          </span>
        ) : null}
        <h3 className="sc-serif mt-2 text-[1.1rem] leading-[1.3] text-[var(--sc-black)] transition-colors group-hover:text-[var(--sc-sun-deep)]">
          {title}
        </h3>
        {date ? (
          <span className="mt-2 text-[0.76rem] text-[var(--sc-mid-grey)]">
            {date}
          </span>
        ) : null}
      </article>
    </Link>
  );
}

const LOCALE: Record<Lang, string> = {
  fr: "fr-FR",
  en: "en-US",
  ar: "ar-TN",
};

function formatDate(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
