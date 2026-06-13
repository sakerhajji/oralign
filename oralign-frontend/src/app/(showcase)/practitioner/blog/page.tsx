import type { Metadata } from "next";
import { BlogAudience } from "@/lib/types";
import { dict, DEFAULT_LANG } from "../../_lib/i18n/dict";
import { Reveal } from "../../_components/shared/reveal";
import { getCategories, getPublishedPosts } from "./_lib/fetch";
import { BlogIndex } from "./_components/blog-index";

const AUDIENCE = BlogAudience.PRACTITIONER;

export const metadata: Metadata = {
  title: "Blog praticiens — Ressources cliniques aligneurs | ORALIGN®",
  description:
    "Guides cliniques, protocoles d'aligneurs transparents et actualités ORALIGN® pour les dentistes et orthodontistes. Faites grandir votre pratique avec ORALIGN®.",
  alternates: { canonical: "/practitioner/blog" },
  openGraph: {
    type: "website",
    title: "Blog praticiens ORALIGN® — Ressources cliniques",
    description:
      "Guides cliniques, protocoles d'aligneurs et actualités ORALIGN® pour les praticiens.",
    url: "/practitioner/blog",
  },
};

// The list of posts changes when an admin publishes/edits; ISR-revalidate
// the index every 60s so new posts surface without a redeploy.
export const revalidate = 60;

export default async function PractitionerBlogPage() {
  const [{ posts }, categories] = await Promise.all([
    getPublishedPosts({ audience: AUDIENCE, page: 1, limit: 24 }),
    getCategories(AUDIENCE),
  ]);

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
          <BlogIndex
            audience={AUDIENCE}
            initialPosts={posts}
            categories={categories}
          />
        </div>
      </div>
    </section>
  );
}
