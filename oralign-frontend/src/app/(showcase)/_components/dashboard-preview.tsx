"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";
import { ImagePlaceholder } from "./shared/image-placeholder";

/**
 * "Smile Preview" — before/after comparison gallery for the three most common
 * patient concerns (Crowding, Spacing, Bite). Tab keys remain `dentist /
 * admin / designer` so the dict stays back-compatible; the visible labels are
 * swapped to clinical concerns. Drop real before/after photos in the
 * placeholders when ready.
 */
export function DashboardPreview() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="dashboard-preview"
      data-section-tone="light"
      aria-labelledby="preview-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <SectionHeading eyebrow={dict.preview.eyebrow[lang]} tone="light" align="center" id="preview-h2">
              {dict.preview.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.preview.h2Em[lang]}</em>
            </SectionHeading>
          </div>
        </Reveal>

        <Reveal delay>
          <Tabs defaultValue="dentist" className="mt-12">
            <TabsList className="mx-auto bg-transparent gap-2">
              <TabsTrigger
                value="dentist"
                className="data-[state=active]:bg-[var(--sc-black)] data-[state=active]:text-[var(--sc-white)]"
              >
                {dict.preview.tabs.dentist[lang]}
              </TabsTrigger>
              <TabsTrigger
                value="admin"
                className="data-[state=active]:bg-[var(--sc-black)] data-[state=active]:text-[var(--sc-white)]"
              >
                {dict.preview.tabs.admin[lang]}
              </TabsTrigger>
              <TabsTrigger
                value="designer"
                className="data-[state=active]:bg-[var(--sc-black)] data-[state=active]:text-[var(--sc-white)]"
              >
                {dict.preview.tabs.designer[lang]}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dentist" className="mt-10">
              <BeforeAfter lang={lang} />
            </TabsContent>
            <TabsContent value="admin" className="mt-10">
              <BeforeAfter lang={lang} />
            </TabsContent>
            <TabsContent value="designer" className="mt-10">
              <BeforeAfter lang={lang} />
            </TabsContent>
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}

function BeforeAfter({ lang }: { lang: "fr" | "en" | "ar" }) {
  return (
    <div className="relative bg-[var(--sc-white)] border border-[var(--sc-grey)]" style={{ padding: 28 }}>
      <span aria-hidden="true" className="absolute -top-px -left-px w-14 h-14 border-l-2 border-t-2 border-[var(--sc-sun)]" />
      <span aria-hidden="true" className="absolute -bottom-px -right-px w-14 h-14 border-r-2 border-b-2 border-[var(--sc-sun)]" />

      <div className="grid gap-6 md:grid-cols-2">
        <figure className="flex flex-col gap-3">
          <ImagePlaceholder
            label={dict.preview.placeholderBefore[lang]}
            aspect="landscape"
            tone="light"
          />
          <figcaption
            className="self-center"
            style={{ fontSize: "0.55rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "var(--sc-text-mid)" }}
          >
            {dict.preview.before[lang]}
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-3">
          <ImagePlaceholder
            label={dict.preview.placeholderAfter[lang]}
            aspect="landscape"
            tone="gold"
          />
          <figcaption
            className="self-center"
            style={{ fontSize: "0.55rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "var(--sc-sun)" }}
          >
            {dict.preview.after[lang]}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
