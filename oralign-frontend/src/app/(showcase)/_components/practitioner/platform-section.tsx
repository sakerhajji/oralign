"use client";

import { MessageCircle, Truck, UsersRound, type LucideIcon } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy, type PlatformItem } from "./copy";
import { Reveal } from "../shared/reveal";
import { SectionIntro } from "./section-intro";

const platformIcons = [MessageCircle, Truck, UsersRound] as const;

/** All-in-one platform — three feature cards. */
export function PlatformSection() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].platform;
  return (
    <section
      id="platform-b2b"
      data-section-tone="light"
      aria-labelledby="platform-b2b-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            subtitle={copy.subtitle}
            id="platform-b2b-title"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {copy.cards.map((card, index) => (
            <PlatformCard
              key={card.title}
              card={card}
              icon={platformIcons[index] ?? MessageCircle}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformCard({
  card,
  icon: Icon,
}: {
  card: PlatformItem;
  icon: LucideIcon;
}) {
  return (
    <Reveal delay>
      <article className="h-full border border-[rgba(25,25,25,0.10)] bg-white/55 p-7 transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_60px_-48px_rgba(25,25,25,0.65)] sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center border border-[rgba(201,154,11,0.22)] bg-[var(--sc-sun-3)] text-[var(--sc-sun-deep)]">
          <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
        </span>
        <h3 className="sc-serif mt-7 text-2xl">{card.title}</h3>
        <p className="mt-4 text-[0.96rem] leading-7 text-[var(--sc-text-mid)]">
          {card.body}
        </p>
      </article>
    </Reveal>
  );
}
