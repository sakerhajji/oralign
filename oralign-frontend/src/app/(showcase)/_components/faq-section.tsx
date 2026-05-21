"use client";

import { Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dict, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

/**
 * FAQ section — refreshed visual treatment.
 *
 * The previous design used a hard rectangular tab strip with tiny
 * 10px uppercase tab labels and a flat black active state. That read
 * as "low-effort placeholder" against the rest of the showcase, which
 * leans premium / editorial. Reworked into:
 *
 *   • A rounded-full segmented control for Patient / Practitioner —
 *     bigger readable labels, soft pill highlight on the active tab,
 *     stays inside the brand palette (Midnight Ink + Porcelain Mist).
 *   • The accordion now lives inside a card with subtle border + soft
 *     shadow so the section reads as a unit instead of a stack of
 *     lines, and each question gets enough breathing room.
 *   • Custom rotating "+ → ×" icon swap on open, larger serif question
 *     text, and a subtle amber wash on the OPEN row so the eye lands
 *     on the question being answered instead of having to scan for it.
 */
export function FaqSection() {
  const { lang } = useShowcaseLang();

  return (
    <section
      id="faq"
      data-section-tone="light"
      aria-labelledby="faq-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "110px 24px" }}
    >
      <div className="mx-auto max-w-[1040px] lg:px-12">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeading eyebrow={dict.faq.eyebrow[lang]} tone="light" align="center" id="faq-h2">
              {dict.faq.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.faq.h2Em[lang]}</em>
            </SectionHeading>
          </div>
        </Reveal>

        <Reveal delay>
          <Tabs defaultValue="patient" className="mt-12 gap-10">
            {/* Pill-style segmented control — rounded-full outer track with
                rounded-full triggers inside. Active state uses a Midnight
                Ink pill that "snaps" into place. */}
            <TabsList
              className="mx-auto grid h-auto w-full max-w-[440px] grid-cols-2 gap-1 rounded-full border border-[var(--sc-grey)] bg-[var(--sc-white)] p-1.5 shadow-[0_1px_0_rgba(25,25,25,0.04)]"
              variant="line"
            >
              <TabsTrigger
                value="patient"
                className="h-11 rounded-full border-0 px-5 text-sm font-medium tracking-wide text-[var(--sc-text-mid)] transition-all duration-300 data-active:bg-[var(--sc-black)] data-active:text-[var(--sc-white)] data-active:shadow-sm data-active:after:opacity-0"
              >
                {dict.faq.tabPatient[lang]}
              </TabsTrigger>
              <TabsTrigger
                value="practitioner"
                className="h-11 rounded-full border-0 px-5 text-sm font-medium tracking-wide text-[var(--sc-text-mid)] transition-all duration-300 data-active:bg-[var(--sc-black)] data-active:text-[var(--sc-white)] data-active:shadow-sm data-active:after:opacity-0"
              >
                {dict.faq.tabPractitioner[lang]}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="patient" className="mt-0">
              <FaqAccordion items={dict.faq.items} lang={lang} namespace="patient" />
            </TabsContent>
            <TabsContent value="practitioner" className="mt-0">
              <FaqAccordion items={dict.faq.practitionerItems} lang={lang} namespace="practitioner" />
            </TabsContent>
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}

function FaqAccordion({
  items,
  lang,
  namespace,
}: {
  items: readonly { q: Record<Lang, string>; a: Record<Lang, string> }[];
  lang: Lang;
  namespace: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--sc-grey)] bg-white/40 shadow-[0_2px_24px_-12px_rgba(25,25,25,0.12)] backdrop-blur-sm">
      <Accordion type="single" collapsible className="divide-y divide-[var(--sc-grey)]">
        {items.map((it, i) => (
          <AccordionItem
            key={`${namespace}-${i}`}
            value={`${namespace}-${i}`}
            className="group/faq-item border-0 transition-colors duration-200 hover:bg-[var(--sc-sun-3)] data-[state=open]:bg-[var(--sc-sun-3)]"
          >
            <AccordionTrigger
              // The shared AccordionTrigger auto-renders a chevron via
              // [data-slot=accordion-trigger-icon] — we hide it here
              // because the custom "+ → ×" pill below replaces it
              // with something more on-brand.
              className="sc-serif gap-6 px-6 py-6 text-left text-[1.05rem] leading-snug text-[var(--sc-black)] transition-colors hover:no-underline sm:px-8 sm:text-[1.15rem] [&>[data-slot=accordion-trigger-icon]]:hidden"
              style={{ fontWeight: 500 }}
            >
              <span className="flex-1 pr-2">{it.q[lang]}</span>
              {/* Replace the default chevron with a "+ → ×" rotation —
                  reads as "expand" more clearly and matches editorial
                  FAQ patterns the design system already uses elsewhere. */}
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--sc-grey)] bg-[var(--sc-white)] text-[var(--sc-black)] transition-transform duration-300 group-data-[state=open]/faq-item:rotate-45 group-data-[state=open]/faq-item:border-[var(--sc-black)] group-data-[state=open]/faq-item:bg-[var(--sc-black)] group-data-[state=open]/faq-item:text-[var(--sc-white)]"
                aria-hidden
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-7 pt-0 text-[0.95rem] leading-relaxed text-[var(--sc-text-mid)] sm:px-8 sm:text-base">
              {it.a[lang]}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
