"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { dict } from "../_lib/i18n/dict";
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
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1000px] lg:px-12">
        <Reveal>
          <SectionHeading eyebrow={dict.faq.eyebrow[lang]} tone="light" id="faq-h2">
            {dict.faq.h2Part1[lang]}{" "}
            <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.faq.h2Em[lang]}</em>
          </SectionHeading>
        </Reveal>
        <Reveal delay>
          <Accordion type="single" collapsible className="mt-12">
            {dict.faq.items.map((it, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-b border-[var(--sc-grey)]">
                <AccordionTrigger className="sc-serif text-left hover:no-underline" style={{ fontSize: "1.05rem", fontWeight: 400, color: "var(--sc-black)" }}>
                  {it.q[lang]}
                </AccordionTrigger>
                <AccordionContent style={{ fontSize: "0.88rem", color: "var(--sc-text-mid)", lineHeight: 1.7 }}>
                  {it.a[lang]}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
