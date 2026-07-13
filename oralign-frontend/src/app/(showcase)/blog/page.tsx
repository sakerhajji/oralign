import type { Metadata } from "next";
import { dict, DEFAULT_LANG } from "../_lib/i18n/dict";
import { Reveal } from "../_components/shared/reveal";
import { getPublishedPosts } from "./_lib/fetch";
import { BlogIndex } from "./_components/blog-index";

// Single public blog: the feed is fetched WITHOUT an audience filter so both
// patient- and practitioner-authored articles surface here, then the client
// index splits them with an audience tab strip.

export const metadata: Metadata = {
  title: "Blog — Conseils, guides & actualités | ORALIGN®",
  description:
    "Des conseils pour les patients et des ressources cliniques pour les praticiens sur les aligneurs invisibles et le sourire, par ORALIGN®.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "Blog ORALIGN® — Conseils, guides & actualités",
    description:
      "Des conseils pour les patients et des ressources cliniques pour les praticiens, par ORALIGN®.",
    url: "/blog",
  },
};

// The list of posts changes when an admin publishes/edits; ISR-revalidate
// the index every 60s so new posts surface without a redeploy.
export const revalidate = 60;

export default async function PublicBlogPage() {
  const { posts } = await getPublishedPosts({ page: 1, limit: 24 });

  // The H1 + intro are server-rendered for SEO. They use the default
  // language (FR); the interactive client list reacts to the live
  // language selection. One H1 per page lives here.
  const lang = DEFAULT_LANG;

  return (
    <section
      data-section-tone="light"
      aria-labelledby="blog-index-h1"
      className="bg-[var(--sc-white)] text-[var(--sc-black)]"
      style={{ padding: "96px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <header className="max-w-3xl">
            <div
              className="flex items-center gap-3 text-[var(--sc-sun-deep)]"
              style={{
                fontSize: "0.55rem",
                letterSpacing: "0.42em",
                textTransform: "uppercase",
              }}
            >
              <span
                className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun-deep)]"
                aria-hidden="true"
              />
              <span>{dict.blog.eyebrow[lang]}</span>
            </div>
            <h1
              id="blog-index-h1"
              className="sc-serif mt-3.5 leading-[1.08]"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300 }}
            >
              {dict.blog.indexTitle[lang]}
            </h1>
            <p className="mt-5 max-w-2xl text-[1.05rem] leading-8 text-[var(--sc-text-mid)]">
              {dict.blog.indexSubtitle[lang]}
            </p>
          </header>
        </Reveal>

        <div className="mt-12">
          <BlogIndex initialPosts={posts} />
        </div>
      </div>
    </section>
  );
}
