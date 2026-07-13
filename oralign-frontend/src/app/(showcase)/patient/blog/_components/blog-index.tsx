"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { resolveBlogMediaUrl } from "@/lib/api/blog.service";
import type { BlogAudience, BlogSummary, Localized } from "@/lib/types";
import { dict, type Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";
import { Reveal } from "../../../_components/shared/reveal";

const PAGE_SIZE = 9;

/**
 * Resolve a `Localized<T>` bag (or a bare/legacy value) for the active
 * showcase language. AR has no blog copy, so it resolves through the FR
 * fallback — matching the showcase default. Mirrors `pickLocalized` in
 * blog.service.ts but kept local so this client component carries no
 * server import.
 */
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

type Props = {
  audience: BlogAudience;
  initialPosts: BlogSummary[];
  categories: string[];
};

/**
 * Client-side blog index: search + category filter applied to the
 * server-provided first page, plus a simple "load more" that grows the
 * visible window. Pure client filtering keeps the marketing page snappy
 * (no extra round-trips) and degrades gracefully — the server already
 * rendered the cards, this just narrows / paginates them.
 */
export function BlogIndex({ audience, initialPosts, categories }: Props) {
  const { lang } = useShowcaseLang();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeCat = category.trim().toLowerCase();
    return initialPosts.filter((post) => {
      // Case/space-tolerant category match so a chip picked from the
      // server's category list always lines up with the post value even
      // if one side carries stray casing or whitespace.
      if (activeCat && (post.category ?? "").trim().toLowerCase() !== activeCat)
        return false;
      if (!q) return true;
      // Search the ACTIVE language's resolved title/excerpt (plus the
      // language-agnostic category + author).
      const title = pick(post.title, lang).toLowerCase();
      const excerpt = pick(post.excerpt, lang).toLowerCase();
      return (
        title.includes(q) ||
        excerpt.includes(q) ||
        (post.category ?? "").toLowerCase().includes(q) ||
        (post.authorName ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialPosts, query, category, lang]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  const onSearch = (value: string) => {
    setQuery(value);
    setVisible(PAGE_SIZE);
  };
  const onCategory = (value: string) => {
    setCategory(value);
    setVisible(PAGE_SIZE);
  };

  return (
    <div>
      {/* ── Filter bar ── */}
      <Reveal>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex w-full max-w-md items-center">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 text-[var(--sc-mid-grey)]"
            />
            <span className="sr-only">{dict.blog.searchPlaceholder[lang]}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={dict.blog.searchPlaceholder[lang]}
              className="h-12 w-full border border-[var(--sc-grey)] bg-[var(--sc-white)] pl-11 pr-4 text-[0.92rem] text-[var(--sc-black)] outline-none transition-colors placeholder:text-[var(--sc-mid-grey)] focus:border-[var(--sc-sun)]"
            />
          </label>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <CategoryChip
                label={dict.blog.allCategories[lang]}
                active={category === ""}
                onClick={() => onCategory("")}
              />
              {categories.map((cat) => (
                <CategoryChip
                  key={cat}
                  label={cat}
                  active={category === cat}
                  onClick={() => onCategory(cat)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Reveal>

      {/* ── Grid / empty state ── */}
      {shown.length === 0 ? (
        <Reveal>
          <div className="mt-16 border border-dashed border-[var(--sc-grey)] px-6 py-20 text-center">
            <p className="sc-serif text-[1.4rem] text-[var(--sc-black)]">
              {dict.blog.emptyTitle[lang]}
            </p>
            <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-7 text-[var(--sc-text-mid)]">
              {dict.blog.emptyBody[lang]}
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          <ul className="mt-10 grid list-none grid-cols-1 gap-x-7 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((post, i) => (
              <li key={post.id}>
                <Reveal delay={i % 3 === 2}>
                  <BlogCard post={post} lang={lang} audience={audience} />
                </Reveal>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <div className="mt-14 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="sc-serif inline-flex min-h-12 items-center justify-center border border-[var(--sc-black)] bg-transparent px-7 py-3 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
              >
                {dict.blog.loadMore[lang]}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex h-9 items-center px-4 text-[0.7rem] font-medium uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-[var(--sc-black)] text-[var(--sc-white)]"
          : "border border-[var(--sc-grey)] text-[var(--sc-text-mid)] hover:border-[var(--sc-black)] hover:text-[var(--sc-black)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function BlogCard({
  post,
  lang,
  audience,
}: {
  post: BlogSummary;
  lang: Lang;
  audience: BlogAudience;
}) {
  const cover =
    resolveBlogMediaUrl(post.cover?.mdUrl ?? post.cover?.thumbUrl ?? null) ??
    resolveBlogMediaUrl(post.cover?.url ?? null);
  const date = formatDate(post.publishedAt, lang);
  const title = pick(post.title, lang);
  const excerpt = pick(post.excerpt, lang);
  const coverAlt = pick(post.coverImageAlt, lang) || title;
  const reading = dict.blog.minRead[lang].replace(
    "{n}",
    String(pick(post.readingTime, lang)),
  );

  return (
    <Link
      href={`/${audience}/blog/${post.slug}`}
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
              sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="sc-serif text-[2rem] text-[var(--sc-mid-grey)]">
                ORALIGN
              </span>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-1 flex-col">
          <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.2em] text-[var(--sc-sun-deep)]">
            {/* Always render a type badge — fall back to a generic
                "Article" label when the post has no category, so the card
                never shows a bare reading-time with no type. */}
            <span>{(post.category ?? "").trim() || dict.blog.defaultCategory[lang]}</span>
            <span aria-hidden="true" className="text-[var(--sc-mid-grey)]">
              ·
            </span>
            <span className="text-[var(--sc-mid-grey)]">{reading}</span>
          </div>

          <h2 className="sc-serif mt-3 text-[1.3rem] leading-[1.25] text-[var(--sc-black)] transition-colors group-hover:text-[var(--sc-sun-deep)]">
            {title}
          </h2>

          {excerpt ? (
            <p className="mt-3 line-clamp-3 text-[0.92rem] leading-7 text-[var(--sc-text-mid)]">
              {excerpt}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3 text-[0.78rem] text-[var(--sc-mid-grey)]">
            {post.authorName ? <span>{post.authorName}</span> : null}
            {post.authorName && date ? (
              <span aria-hidden="true">·</span>
            ) : null}
            {date ? <span>{date}</span> : null}
          </div>

          <span className="sc-serif mt-5 inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-black)]">
            {dict.blog.readMore[lang]}
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </div>
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
