import type { Metadata } from "next";
import { BlogAudience } from "@/lib/types";
import { dict, DEFAULT_LANG } from "../../_lib/i18n/dict";
import { Reveal } from "../../_components/shared/reveal";
import { getCategories, getPublishedPosts } from "./_lib/fetch";
import { BlogIndex } from "./_components/blog-index";

// Single public blog: the feed is fetched WITHOUT an audience filter so both
// patient- and practitioner-authored articles surface here. AUDIENCE is only
// the link base for the shared components (every post routes under /patient/blog).
const AUDIENCE = BlogAudience.PATIENT;

export const metadata: Metadata = {
  title: "Blog patients — Conseils sourire & orthodontie | ORALIGN®",
  description:
    "Conseils, actualités et guides sur les aligneurs invisibles et le sourire, par ORALIGN®. Comprenez votre traitement et prenez soin de votre sourire.",
  alternates: { canonical: "/patient/blog" },
  openGraph: {
    type: "website",
    title: "Blog patients ORALIGN® — Conseils sourire & orthodontie",
    description:
      "Conseils, actualités et guides sur les aligneurs invisibles et le sourire, par ORALIGN®.",
    url: "/patient/blog",
  },
};

// The list of posts changes when an admin publishes/edits; ISR-revalidate
// the index every 60s so new posts surface without a redeploy.
export const revalidate = 60;

export default async function PatientBlogPage() {
  const [{ posts }, categories] = await Promise.all([
    getPublishedPosts({ page: 1, limit: 24 }),
    getCategories(),
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
              <span>{dict.blog.eyebrowPatient[lang]}</span>
            </div>
            <h1
              id="blog-index-h1"
              className="sc-serif mt-3.5 leading-[1.08]"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300 }}
            >
              {dict.blog.indexTitlePatient[lang]}
            </h1>
            <p className="mt-5 max-w-2xl text-[1.05rem] leading-8 text-[var(--sc-text-mid)]">
              {dict.blog.indexSubtitlePatient[lang]}
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
