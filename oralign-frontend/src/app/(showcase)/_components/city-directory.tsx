import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import { dict, partnerPractitionerCount, type Lang } from "../_lib/i18n/dict";
import { isUploadUrl, mediaUrl, type PublicPractitioner } from "../_lib/finder";
import { cityLabel, FINDER_PATH, frInCity, practitionerPath, type CityGroup } from "../_lib/practitioner-url";
import { pathFor } from "../_lib/seo/routes";
import { Reveal } from "./shared/reveal";
import { CityLinks } from "./city-links";

/**
 * City landing page of the directory — /trouver-un-praticien/ville/<city>
 * and its /en, /ar twins: the partner practices of one city, each a card
 * that links to its own profile.
 *
 * Server-rendered on purpose: it is the page a searcher lands on for
 * "orthodontiste aligneurs Sfax", so every practice (name, clinic,
 * address, phone) is in the HTML. Same editorial rule as the profiles:
 * only what the practitioners published — no rating, review, credential
 * or claim is added, and ORALIGN itself is never presented as a dentist.
 * Partners are "certifiés ORALIGN", the wording used across the site.
 */

type Copy = {
  home: string;
  eyebrow: string;
  title: (city: string) => string;
  intro: (city: string) => string;
  profile: string;
  book: string;
  allPractitioners: string;
};

const copy: Record<Lang, Copy> = {
  fr: {
    home: "Accueil",
    eyebrow: "Praticiens partenaires ORALIGN®",
    title: (city) => `Dentistes et orthodontistes partenaires ORALIGN ${frInCity(city)}`,
    intro: (city) =>
      `Les cabinets ci-dessous, ${frInCity(city)}, font partie du réseau de praticiens partenaires ORALIGN® : des dentistes et orthodontistes certifiés ORALIGN. ORALIGN conçoit et fabrique les aligneurs ; c'est le praticien qui vous examine, décide si un traitement convient à votre cas et établit votre devis.`,
    profile: "Voir la fiche du cabinet",
    book: "Prendre rendez-vous",
    allPractitioners: "Tous les praticiens partenaires en Tunisie",
  },
  en: {
    home: "Home",
    eyebrow: "ORALIGN® partner practitioners",
    title: (city) => `ORALIGN partner dentists and orthodontists in ${city}`,
    intro: (city) =>
      `The practices below, in ${city}, belong to the ORALIGN® partner practitioner network: ORALIGN-certified dentists and orthodontists. ORALIGN designs and manufactures the aligners; the practitioner examines you, decides whether treatment suits your case and prepares your quote.`,
    profile: "View the practice page",
    book: "Book an appointment",
    allPractitioners: "All partner practitioners in Tunisia",
  },
  ar: {
    home: "الرئيسية",
    eyebrow: "أطباء شركاء لـ ORALIGN®",
    title: (city) => `أطباء الأسنان وأخصائيو التقويم الشركاء لـ ORALIGN في ${city}`,
    intro: (city) =>
      `العيادات أدناه في ${city} ضمن شبكة الأطباء الشركاء لـ ORALIGN®: أطباء أسنان وأخصائيو تقويم معتمدون من ORALIGN. تصمّم ORALIGN المصففات وتصنّعها، أما الطبيب فهو من يفحصك ويقرّر ما إذا كان العلاج مناسباً لحالتك ويعدّ عرض السعر الخاص بك.`,
    profile: "عرض صفحة العيادة",
    book: "حجز موعد",
    allPractitioners: "جميع الأطباء الشركاء في تونس",
  },
};

/**
 * The page's H1, as rendered — also the name of its ItemList in JSON-LD,
 * so the structured data describes the page by the heading a visitor sees.
 */
export function cityPageTitle(group: CityGroup, lang: Lang): string {
  return copy[lang].title(cityLabel(group.label, lang) ?? group.label);
}

const eyebrowClass =
  "mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]";

export function CityDirectory({
  group,
  others,
  lang,
}: {
  group: CityGroup;
  others: CityGroup[];
  lang: Lang;
}) {
  const c = copy[lang];
  const f = dict.finder;
  const city = cityLabel(group.label, lang) ?? group.label;

  return (
    <>
      <section
        data-section-tone="light"
        aria-labelledby="city-title"
        className="px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <nav aria-label="breadcrumb" className="mb-8 text-[0.8rem] text-[var(--sc-text-mid)]">
            <Link href={pathFor("home", lang)} className="underline decoration-[var(--sc-sun)] underline-offset-4">
              {c.home}
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href={FINDER_PATH[lang]} className="underline decoration-[var(--sc-sun)] underline-offset-4">
              {f.title[lang]}
            </Link>
            <span aria-hidden="true"> · </span>
            <span aria-current="page">{city}</span>
          </nav>

          <Reveal>
            <div className={eyebrowClass}>
              <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
              <span>{c.eyebrow}</span>
            </div>
            <h1
              id="city-title"
              className="sc-serif max-w-[880px] text-[clamp(1.9rem,3.6vw,3rem)] font-normal leading-[1.08]"
            >
              {cityPageTitle(group, lang)}
            </h1>
            <p className="mt-6 max-w-[680px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
              {c.intro(city)}
            </p>
            <p className="mt-6 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]">
              {partnerPractitionerCount(group.practitioners.length, lang)}
            </p>
          </Reveal>

          <Reveal variant="group" delay>
            <ul className="sc-stagger mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.practitioners.map((p) => (
                <li key={p.id}>
                  <PracticeCard practitioner={p} city={city} lang={lang} copy={c} />
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section
        data-section-tone="light"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          {others.length > 0 && (
            <>
              <h2 className="sc-serif text-[1.5rem] font-normal leading-tight">{f.otherCities[lang]}</h2>
              <CityLinks groups={others} lang={lang} className="mt-6" />
            </>
          )}
          <Link
            href={FINDER_PATH[lang]}
            className="mt-8 inline-flex items-center gap-2 text-[0.78rem] font-bold uppercase tracking-[0.14em] underline decoration-[var(--sc-sun)] decoration-2 underline-offset-4"
          >
            {c.allPractitioners}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * The practice's photo, or its initials — server-rendered, like the
 * profile header (the finder's client Avatar needs state for its error
 * fallback, which a server component cannot hold). Decorative: the name
 * sits right next to it.
 */
function CardAvatar({ practitioner: p }: { practitioner: PublicPractitioner }) {
  const avatar = mediaUrl(p.avatarUrl) ?? mediaUrl(p.logoUrl);
  const initials = p.practitionerName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sc-sun)] text-[0.9rem] font-bold text-[var(--sc-black)]"
    >
      {avatar ? (
        // Resized by next/image: the uploads are full-size photos.
        <Image
          src={avatar}
          alt=""
          width={52}
          height={52}
          sizes="52px"
          unoptimized={!isUploadUrl(avatar)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials || "•"
      )}
    </span>
  );
}

function PracticeCard({
  practitioner: p,
  city,
  lang,
  copy: c,
}: {
  practitioner: PublicPractitioner;
  city: string;
  lang: Lang;
  copy: Copy;
}) {
  const address = [p.clinicAddress?.trim(), city].filter(Boolean).join(", ");
  const phone = p.clinicPhone?.trim();
  return (
    <article className="flex h-full flex-col border border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] p-6">
      <div className="flex items-center gap-4">
        <CardAvatar practitioner={p} />
        <div className="min-w-0">
          <h2 className="sc-serif text-[1.15rem] font-medium leading-tight">
            <Link
              href={practitionerPath(p, lang)}
              className="no-underline hover:underline hover:decoration-[var(--sc-sun)] hover:underline-offset-4"
            >
              {p.practitionerName}
            </Link>
          </h2>
          {p.clinicName && (
            <p className="mt-1 truncate text-[0.88rem] text-[var(--sc-text-mid)]">{p.clinicName}</p>
          )}
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-[0.9rem] leading-6">
        {address && (
          <div className="flex gap-2">
            <dt className="sr-only">{dict.finder.address[lang]}</dt>
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--sc-sun-deep)]" aria-hidden="true" />
            <dd>{address}</dd>
          </div>
        )}
        {phone && (
          <div className="flex gap-2">
            <dt className="sr-only">{dict.finder.phone[lang]}</dt>
            <Phone className="mt-1 h-4 w-4 shrink-0 text-[var(--sc-sun-deep)]" aria-hidden="true" />
            <dd>
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="underline decoration-[var(--sc-sun)] underline-offset-4">
                <bdi>{phone}</bdi>
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <Link
          href={`${FINDER_PATH[lang]}?p=${encodeURIComponent(p.id)}`}
          className="inline-flex items-center gap-2 bg-[var(--sc-black)] px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-white)] transition-opacity hover:opacity-85"
        >
          {c.book}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link
          href={practitionerPath(p, lang)}
          className="inline-flex items-center gap-2 border border-[var(--sc-black)] px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-sun-3)]"
        >
          {c.profile}
        </Link>
      </div>
    </article>
  );
}
