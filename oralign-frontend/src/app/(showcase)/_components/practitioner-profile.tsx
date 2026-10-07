import Link from "next/link";
import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import { dict, type Lang } from "../_lib/i18n/dict";
import { mediaUrl, type DayOfWeek, type PractitionerDetail, type PublicPractitioner } from "../_lib/finder";
import { cityLabel, FINDER_PATH, practitionerPath } from "../_lib/practitioner-url";
import { pathFor } from "../_lib/seo/routes";

/**
 * Public profile of one partner practitioner — /trouver-un-praticien/<slug>
 * and its /en, /ar twins.
 *
 * Server-rendered on purpose: this is the page a searcher lands on for
 * "aligneurs transparents Ariana" or a clinic's own name, so every fact a
 * search engine needs (name, clinic, address, hours, phone) is in the HTML.
 * Editorial rule: only what the practitioner published about themselves —
 * no rating, review, credential or claim is ever added here.
 */

const DAY_ORDER: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

type Copy = {
  eyebrow: string;
  intro: (name: string, city: string | null) => string;
  bookCta: string;
  call: string;
  hoursUnknown: string;
  before: string;
  beforeLinks: { key: "pricing" | "guide" | "comparison" | "teens"; label: string }[];
  sameCity: (city: string) => string;
  allPractitioners: string;
};

const copy: Record<Lang, Copy> = {
  fr: {
    eyebrow: "Praticien partenaire ORALIGN®",
    intro: (name, city) =>
      `${name} fait partie du réseau de praticiens partenaires ORALIGN®${
        city ? ` à ${city}` : " en Tunisie"
      }. Une consultation au cabinet permet de savoir si un traitement par aligneurs transparents convient à votre sourire, et d'établir un devis adapté à votre cas.`,
    bookCta: "Prendre rendez-vous en ligne",
    call: "Appeler le cabinet",
    hoursUnknown: "Horaires communiqués par le cabinet sur demande.",
    before: "À lire avant votre consultation",
    beforeLinks: [
      { key: "pricing", label: "Ce qui détermine le prix d'un traitement" },
      { key: "comparison", label: "ORALIGN ou Invisalign : comment comparer" },
      { key: "guide", label: "Porter et entretenir ses aligneurs" },
      { key: "teens", label: "Aligneurs pour adolescents" },
    ],
    sameCity: (city) => `Autres praticiens partenaires à ${city}`,
    allPractitioners: "Tous les praticiens partenaires en Tunisie",
  },
  en: {
    eyebrow: "ORALIGN® partner practitioner",
    intro: (name, city) =>
      `${name} is part of the ORALIGN® partner practitioner network${
        city ? ` in ${city}` : " in Tunisia"
      }. A consultation at the practice tells you whether clear aligner treatment suits your smile, and gives you a quote for your own case.`,
    bookCta: "Book an appointment online",
    call: "Call the practice",
    hoursUnknown: "Opening hours available from the practice on request.",
    before: "Worth reading before your consultation",
    beforeLinks: [
      { key: "pricing", label: "What determines the cost of treatment" },
      { key: "comparison", label: "ORALIGN vs Invisalign: how to compare" },
      { key: "guide", label: "Wearing and caring for your aligners" },
      { key: "teens", label: "Clear aligners for teenagers" },
    ],
    sameCity: (city) => `Other partner practitioners in ${city}`,
    allPractitioners: "All partner practitioners in Tunisia",
  },
  ar: {
    eyebrow: "طبيب شريك لـ ORALIGN®",
    intro: (name, city) =>
      `${name} ضمن شبكة الأطباء الشركاء لـ ORALIGN®${
        city ? ` في ${city}` : " في تونس"
      }. تتيح لك الاستشارة في العيادة معرفة ما إذا كان التقويم الشفاف بدون حديد مناسباً لابتسامتك، والحصول على عرض سعر خاص بحالتك.`,
    bookCta: "احجز موعداً عبر الإنترنت",
    call: "اتصل بالعيادة",
    hoursUnknown: "ساعات العمل متوفرة لدى العيادة عند الطلب.",
    before: "اقرأ قبل الاستشارة",
    beforeLinks: [
      { key: "pricing", label: "ما الذي يحدد سعر العلاج" },
      { key: "comparison", label: "ORALIGN أم Invisalign: كيف تقارن" },
      { key: "guide", label: "ارتداء المصففات والعناية بها" },
      { key: "teens", label: "التقويم الشفاف للمراهقين" },
    ],
    sameCity: (city) => `أطباء شركاء آخرون في ${city}`,
    allPractitioners: "جميع الأطباء الشركاء في تونس",
  },
};

const eyebrowClass =
  "mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]";
const labelClass =
  "text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]";

export function PractitionerProfile({
  practitioner: p,
  sameCity,
  lang,
}: {
  practitioner: PractitionerDetail;
  sameCity: PublicPractitioner[];
  lang: Lang;
}) {
  const c = copy[lang];
  const f = dict.finder;
  const city = cityLabel(p.city, lang);
  const avatar = mediaUrl(p.avatarUrl) ?? mediaUrl(p.logoUrl);
  const address = [p.clinicAddress, city].filter(Boolean).join(", ");
  const hours = DAY_ORDER.map((day) => ({
    day,
    entry: p.workingHours?.find((w) => w.dayOfWeek === day),
  }));
  const hasHours = hours.some((h) => h.entry);

  return (
    <>
      <section
        data-section-tone="light"
        aria-labelledby="practitioner-title"
        className="px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <nav aria-label="breadcrumb" className="mb-8 text-[0.8rem] text-[var(--sc-text-mid)]">
            <Link href={FINDER_PATH[lang]} className="underline decoration-[var(--sc-sun)] underline-offset-4">
              {f.title[lang]}
            </Link>
            {city && <span aria-hidden="true"> · </span>}
            {city && <span>{city}</span>}
          </nav>

          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className={eyebrowClass}>
                <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{c.eyebrow}</span>
              </div>
              <div className="flex items-center gap-5">
                {avatar && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={p.practitionerName}
                    width={72}
                    height={72}
                    className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h1
                    id="practitioner-title"
                    className="sc-serif text-[clamp(1.9rem,3.6vw,3rem)] font-normal leading-[1.08]"
                  >
                    {p.practitionerName}
                  </h1>
                  <p className="mt-2 text-[1rem] text-[var(--sc-text-mid)]">
                    {[p.clinicName, city].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <p className="mt-8 max-w-[680px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
                {c.intro(p.practitionerName, city)}
              </p>

              {p.description?.trim() && (
                <div className="mt-8 max-w-[680px]">
                  <h2 className={labelClass}>{f.about[lang]}</h2>
                  <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-7 text-[var(--sc-black)]">
                    {p.description.trim()}
                  </p>
                </div>
              )}

              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href={`${FINDER_PATH[lang]}?p=${encodeURIComponent(p.id)}`}
                  className="inline-flex items-center gap-2 bg-[var(--sc-black)] px-6 py-3.5 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-white)] transition-opacity hover:opacity-85"
                >
                  {c.bookCta}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {p.clinicPhone && (
                  <a
                    href={`tel:${p.clinicPhone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-2 border border-[var(--sc-black)] px-6 py-3.5 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-sun-3)]"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {c.call}
                  </a>
                )}
              </div>
            </div>

            <aside className="space-y-8 border border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] p-6 sm:p-8">
              {address && (
                <div>
                  <h2 className={labelClass}>{f.address[lang]}</h2>
                  <p className="mt-3 flex gap-2 text-[0.95rem] leading-7">
                    <MapPin className="mt-1.5 h-4 w-4 shrink-0 text-[var(--sc-sun-deep)]" aria-hidden="true" />
                    <span>{address}</span>
                  </p>
                </div>
              )}
              <div>
                <h2 className={labelClass}>{f.phone[lang]}</h2>
                <p className="mt-3 text-[0.95rem]">
                  {p.clinicPhone ? (
                    <a href={`tel:${p.clinicPhone.replace(/\s/g, "")}`} className="underline decoration-[var(--sc-sun)] underline-offset-4">
                      <bdi>{p.clinicPhone}</bdi>
                    </a>
                  ) : (
                    <span className="text-[var(--sc-text-mid)]">{f.noPhone[lang]}</span>
                  )}
                </p>
              </div>
              <div>
                <h2 className={labelClass}>{f.workingHours[lang]}</h2>
                {hasHours ? (
                  <dl className="mt-3 divide-y divide-[rgba(25,25,25,0.08)] text-[0.9rem]">
                    {hours.map(({ day, entry }) => (
                      <div key={day} className="flex justify-between gap-4 py-2">
                        <dt>{f.days[day][lang]}</dt>
                        <dd className="tabular-nums text-[var(--sc-text-mid)]">
                          {!entry || entry.isClosed ? (
                            f.closed[lang]
                          ) : (
                            <bdi>
                              {entry.openTime.slice(0, 5)} – {entry.closeTime.slice(0, 5)}
                            </bdi>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-[0.9rem] text-[var(--sc-text-mid)]">{c.hoursUnknown}</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section
        data-section-tone="light"
        className="bg-[rgba(25,25,25,0.025)] px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 md:grid-cols-2">
          <div>
            <h2 className="sc-serif text-[1.5rem] font-normal leading-tight">{c.before}</h2>
            <ul className="mt-6 space-y-3">
              {c.beforeLinks.map((link) => (
                <li key={link.key}>
                  <Link
                    href={pathFor(link.key, lang)}
                    className="inline-flex items-center gap-2 text-[0.95rem] underline decoration-[var(--sc-sun)] decoration-2 underline-offset-4 hover:decoration-[var(--sc-black)]"
                  >
                    {link.label}
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            {city && sameCity.length > 0 && (
              <>
                <h2 className="sc-serif text-[1.5rem] font-normal leading-tight">{c.sameCity(city)}</h2>
                <ul className="mt-6 space-y-3">
                  {sameCity.map((other) => (
                    <li key={other.id}>
                      <Link
                        href={practitionerPath(other, lang)}
                        className="text-[0.95rem] underline decoration-[var(--sc-sun)] decoration-2 underline-offset-4 hover:decoration-[var(--sc-black)]"
                      >
                        {other.practitionerName}
                      </Link>
                      {other.clinicName && (
                        <span className="text-[0.85rem] text-[var(--sc-text-mid)]"> — {other.clinicName}</span>
                      )}
                    </li>
                  ))}
                </ul>
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
        </div>
      </section>
    </>
  );
}
