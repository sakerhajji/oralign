"use client";

import { Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dict, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

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
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>
                {dict.faq.h2Em[lang]}
              </em>
            </SectionHeading>
          </div>
        </Reveal>

        <Reveal delay>
          <Tabs defaultValue="patient" className="mt-12 gap-10">
            <TabsList
              className="
                mx-auto grid h-9 w-full max-w-[480px] grid-cols-2 gap-0
                overflow-hidden !rounded-none
                !border-0
                bg-transparent p-0
                shadow-none
              "
            >
              <TabsTrigger
                value="patient"
                className="
                  !flex h-9 w-full !items-center !justify-center
                  !rounded-none border-0 px-6 !py-0
                  text-center text-sm font-semibold leading-none tracking-wide
                  text-[var(--sc-text-mid)]
                  shadow-none transition-all duration-300
                  after:!hidden
                  data-[state=active]:!bg-[var(--sc-black)]
                  data-[state=active]:!text-[var(--sc-white)]
                  data-[state=active]:shadow-none
                "
              >
                <span className="block leading-none">
                  {dict.faq.tabPatient[lang]}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="practitioner"
                className="
                  !flex h-9 w-full !items-center !justify-center
                  !rounded-none border-0 px-6 !py-0
                  text-center text-sm font-semibold leading-none tracking-wide
                  text-[var(--sc-text-mid)]
                  shadow-none transition-all duration-300
                  after:!hidden
                  data-[state=active]:!bg-[var(--sc-black)]
                  data-[state=active]:!text-[var(--sc-white)]
                  data-[state=active]:shadow-none
                "
              >
                <span className="block leading-none">
                  {dict.faq.tabPractitioner[lang]}
                </span>
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
              className="sc-serif gap-6 px-6 py-6 text-left text-[1.05rem] leading-snug text-[var(--sc-black)] transition-colors hover:no-underline sm:px-8 sm:text-[1.15rem] [&>[data-slot=accordion-trigger-icon]]:hidden"
              style={{ fontWeight: 500 }}
            >
              <span className="flex-1 pr-2">{it.q[lang]}</span>

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