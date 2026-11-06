"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookUser, MapPin, Play, Stethoscope } from "lucide-react";
import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { LANGS, type Lang } from "../../_lib/i18n/dict";
import { useLocalizedHref, useShowcaseLang } from "../../_lib/i18n/lang-context";
import { WEAR_GUIDE } from "../patient/decouvrir/wear-guide-manifest";
import { ContactPanel } from "./contact-panel";
import { FilmPanel } from "./film-panel";
import { QrDialog } from "./qr-dialog";
import { QR_COPY } from "./qr-copy";
import { useHashDialog } from "./use-hash-dialog";

/**
 * The page a printed QR code opens (/qr, and /qr2): ORALIGN's welcome,
 * then the four things a visitor comes for, patients first, practitioners
 * apart — no "who are you?" screen in between.
 *
 *  1. the wear guide, the reason the code is on the kit: the official film,
 *     opened full screen over the page (#guide);
 *  2. the official contact, in a sheet with the file a phone saves (#contact);
 *  3. the practitioner finder, the site's own /trouver-un-praticien;
 *  4. the practitioner space, the site's own /praticiens.
 *
 * Both panels live in the URL hash, and their actions are links to it: a
 * code or a shared link can open one directly, a tap before the page is
 * interactive still opens it once it is, and a phone's Back button closes
 * it. Contact details come from the company settings (never hardcoded);
 * nothing of the film loads until it is opened.
 */

/** The film's length from its manifest: "1:05" on the badge, {m}/{s} for speech. */
function filmLength(seconds: number): { m: number; s: string } {
  const whole = Math.round(seconds);
  return { m: Math.floor(whole / 60), s: String(whole % 60).padStart(2, "0") };
}
const FILM = filmLength(WEAR_GUIDE.desktop.duration);

/** The welcome settles in a beat at a time (CSS only, off for reduced motion). */
const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}ms` });

/** Mid-tone ink on the porcelain ground and the cards: 5:1 and more. */
const MID = "text-[rgba(25,25,25,0.72)]";

/**
 * A card surface: porcelain-white on the porcelain ground, a hairline and a
 * soft shadow that deepens as the card lifts under a pointer. Tailwind 4
 * writes the lift and the press to `translate` and `scale`, hence the
 * transition list.
 */
const CARD = [
  "group relative h-full border border-[rgba(25,25,25,0.09)] bg-[#fbfbf8]",
  "shadow-[0_1px_2px_rgba(25,25,25,0.04),0_14px_34px_-24px_rgba(25,25,25,0.32)]",
  "transition-[translate,scale,box-shadow,border-color] duration-300 ease-out",
  "hover:-translate-y-0.5 hover:border-[rgba(25,25,25,0.16)]",
  "hover:shadow-[0_2px_4px_rgba(25,25,25,0.05),0_22px_44px_-26px_rgba(25,25,25,0.42)]",
  "active:translate-y-0 active:scale-[0.99]",
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
].join(" ");

/**
 * A card's call to action. Its ::after covers the whole card, so the card
 * is one target while the action keeps its visible name. The focus ring is
 * that ::after's outline, drawn just inside the card (two cards clip their
 * overflow) — the site's amber ring on the element itself is removed with
 * ! because that rule is unlayered.
 */
const ACTION = [
  "inline-flex min-h-11 cursor-pointer items-center gap-2 text-[0.7rem] font-semibold uppercase no-underline",
  "tracking-[0.16em] rtl:tracking-normal",
  "after:absolute after:inset-0",
  "focus-visible:outline-none! focus-visible:after:outline-2 focus-visible:after:-outline-offset-4",
].join(" ");

const ARROW =
  "size-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 motion-reduce:transition-none";

/** Phones: a sheet from the bottom edge. Wider: a card in the middle. */
const SHEET_DIALOG = [
  "sc-qr-sheet m-0 mt-auto w-full max-w-none max-h-[92dvh] overflow-y-auto overscroll-contain",
  "rounded-t-[20px] border-0 bg-[var(--sc-black)] p-0 text-[var(--sc-white)]",
  "backdrop:bg-[rgba(10,10,10,0.55)] backdrop:backdrop-blur-[2px]",
  "sm:m-auto sm:max-w-[27rem] sm:rounded-none",
].join(" ");

/**
 * The film takes the whole screen. Its scroll padding keeps a focused step
 * clear of the sticky header (WCAG 2.4.11).
 */
const FILM_DIALOG = [
  "sc-qr-film m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain scroll-pt-24",
  "border-0 bg-[var(--sc-black)] p-0 text-[var(--sc-white)] backdrop:bg-[var(--sc-black)]",
].join(" ");

/** Each language named in itself, as the site's language rail does. */
const LANG_NAMES: Record<Lang, string> = { fr: "Français", en: "English", ar: "العربية" };

/** A panel link: after hydration it opens the panel (with its own history entry). */
const opens = (show: () => void) => (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  show();
};

export function QrWelcome({
  phone,
  email,
  company,
}: {
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}) {
  const { lang, setLang } = useShowcaseLang();
  const localize = useLocalizedHref();
  const c = QR_COPY[lang];
  const contact = useHashDialog("contact");
  const film = useHashDialog("guide");
  const filmAction = useRef<HTMLAnchorElement>(null);
  const contactAction = useRef<HTMLAnchorElement>(null);
  const filmLengthSpoken = c.guide.length.replace("{m}", String(FILM.m)).replace("{s}", FILM.s);

  return (
    <>
      <div className="relative isolate overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)]">
        {/* The logo's sun as light: a soft amber glow behind the welcome. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[-180px] left-1/2 -z-10 size-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(254,202,22,0.2)_0%,rgba(254,202,22,0.06)_42%,transparent_68%)]"
        />

        <div className="mx-auto w-full max-w-[68rem] px-5 pt-2 pb-16 sm:px-8 sm:pb-24 lg:px-12">
          {/* The page is its own entrance (no site header): its language
              switch sits at the top, in place (no sibling URL to visit). */}
          <div role="group" aria-label={c.langGroup} className="flex justify-end">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-label={LANG_NAMES[code]}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className="min-h-11 min-w-11 cursor-pointer px-2 text-[0.68rem] font-medium tracking-[0.16em] text-[rgba(25,25,25,0.66)] uppercase transition-colors hover:text-[var(--sc-black)] focus-visible:outline-[var(--sc-black)]! aria-pressed:text-[var(--sc-black)] aria-pressed:underline aria-pressed:decoration-[var(--sc-black)] aria-pressed:decoration-2 aria-pressed:underline-offset-[7px]"
              >
                {code}
              </button>
            ))}
          </div>

          <header className="mx-auto mt-1 max-w-2xl text-center sm:mt-4">
            <Link
              href={localize("/")}
              aria-label={c.homeAria}
              className="sc-qr-in inline-block focus-visible:outline-[var(--sc-black)]!"
            >
              <Image
                src="/mainlogo.svg"
                alt=""
                width={1240}
                height={880}
                loading="eager"
                className="mx-auto h-14 w-auto sm:h-20"
              />
            </Link>
            <h1
              className="sc-qr-in mt-5 text-balance text-[clamp(1.85rem,7.4vw,3.1rem)] leading-[1.08] sm:mt-7"
              style={rise(90)}
            >
              {c.title}
            </h1>
            <p
              className={`sc-qr-in mx-auto mt-3 max-w-[32ch] text-balance text-[1rem] leading-[1.6] sm:text-[1.08rem] ${MID}`}
              style={rise(170)}
            >
              {c.intro}
            </p>
          </header>

          <section aria-labelledby="qr-patients" className="mt-9 sm:mt-14">
            <GroupTitle id="qr-patients" style={rise(230)}>
              {c.patients}
            </GroupTitle>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12">
              <li className="sc-qr-in sm:col-span-2 lg:col-span-7 lg:row-span-2" style={rise(280)}>
                <div className={`${CARD} flex flex-col overflow-hidden`}>
                  <div className="relative aspect-[16/9] overflow-hidden bg-[#f3eadf] lg:aspect-auto lg:min-h-[17rem] lg:flex-1">
                    {/* The film's own title card: the ORALIGN case and its
                        clear aligners, "le guide en 10 gestes simples". */}
                    <Image
                      src={WEAR_GUIDE.desktop.poster}
                      alt=""
                      fill
                      preload
                      sizes="(min-width: 1088px) 38rem, (min-width: 1024px) 58vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute start-3 bottom-3 flex size-12 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)] shadow-[0_6px_18px_rgba(0,0,0,0.18)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none sm:start-4 sm:bottom-4 sm:size-14"
                    >
                      <Play className="size-5 translate-x-px fill-current" strokeWidth={1.5} />
                    </span>
                    {/* No dir here: "1:05" reads the same in Arabic, and a dir
                        attribute would flip this badge onto the play button. */}
                    <span
                      aria-hidden="true"
                      className="absolute end-3 bottom-3 bg-[rgba(25,25,25,0.78)] px-2 py-1 text-[0.72rem] font-medium text-[var(--sc-white)] tabular-nums sm:end-4 sm:bottom-4"
                    >
                      {FILM.m}:{FILM.s}
                    </span>
                  </div>
                  <div className="flex flex-col p-5 sm:p-6">
                    <p className="text-[0.64rem] tracking-[0.18em] text-[rgba(25,25,25,0.64)] uppercase rtl:tracking-normal">
                      {c.guide.meta}
                      {/* The badge's "1:05" could be read as a time of day. */}
                      <span className="sr-only"> · {filmLengthSpoken}</span>
                    </p>
                    <h3 className="mt-2 text-[1.35rem] leading-tight sm:text-[1.55rem]">{c.guide.title}</h3>
                    <p className={`mt-2 max-w-[46ch] text-pretty text-[0.93rem] leading-[1.6] ${MID}`}>
                      {c.guide.body}
                    </p>
                    <a
                      ref={filmAction}
                      href="#guide"
                      onClick={opens(film.show)}
                      className={`${ACTION} mt-3 self-start text-[var(--sc-black)] focus-visible:after:outline-[var(--sc-black)]`}
                    >
                      {c.guide.cta}
                      <ArrowRight className={ARROW} strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </li>

              <li className="sc-qr-in lg:col-span-5" style={rise(340)}>
                <ActionCard
                  icon={<BookUser className="size-5" strokeWidth={1.5} />}
                  title={c.contact.title}
                  body={c.contact.body}
                >
                  <a
                    ref={contactAction}
                    href="#contact"
                    onClick={opens(contact.show)}
                    className={`${ACTION} text-[var(--sc-black)] focus-visible:after:outline-[var(--sc-black)]`}
                  >
                    {c.contact.cta}
                    <ArrowRight className={ARROW} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </ActionCard>
              </li>

              <li className="sc-qr-in lg:col-span-5" style={rise(400)}>
                <ActionCard
                  icon={<MapPin className="size-5" strokeWidth={1.5} />}
                  title={c.finder.title}
                  body={c.finder.body}
                >
                  <Link
                    href={localize("/trouver-un-praticien")}
                    className={`${ACTION} text-[var(--sc-black)] focus-visible:after:outline-[var(--sc-black)]`}
                  >
                    {c.finder.cta}
                    <ArrowRight className={ARROW} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </ActionCard>
              </li>
            </ul>
          </section>

          <section aria-labelledby="qr-professionals" className="mt-10 sm:mt-14">
            <GroupTitle id="qr-professionals" style={rise(460)}>
              {c.professionals}
            </GroupTitle>
            <div className="sc-qr-in mt-4" style={rise(500)}>
              <div
                className={[
                  "group relative overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)]",
                  "transition-[translate,scale,box-shadow] duration-300 ease-out hover:-translate-y-0.5",
                  "hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.55)] active:translate-y-0 active:scale-[0.99]",
                  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
                ].join(" ")}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -end-28 -top-28 size-80 rounded-full bg-[radial-gradient(circle,rgba(254,202,22,0.16)_0%,transparent_65%)]"
                />
                <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8">
                  {/* Phones: the icon over the words, so the title, the
                      sentence and the action share one left edge. */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[rgba(242,245,239,0.18)] text-[var(--sc-sun)] transition-colors duration-300 group-hover:border-[var(--sc-sun)]"
                    >
                      <Stethoscope className="size-5" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[1.25rem] leading-tight sm:text-[1.45rem]">{c.pro.title}</h3>
                      <p className="mt-1.5 max-w-[48ch] text-pretty text-[0.92rem] leading-[1.6] text-[var(--sc-text-mid-on-dark)]">
                        {c.pro.body}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={localize("/praticiens")}
                    className={`${ACTION} self-start text-[var(--sc-sun)] focus-visible:after:outline-[var(--sc-sun)] sm:shrink-0 sm:self-center`}
                  >
                    {c.pro.cta}
                    <ArrowRight className={ARROW} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <QrDialog
        open={contact.open}
        onClose={contact.hide}
        labelledBy="qr-contact-title"
        className={SHEET_DIALOG}
        returnFocusRef={contactAction}
      >
        <ContactPanel
          phone={phone}
          email={email}
          company={company}
          titleId="qr-contact-title"
          onClose={contact.hide}
        />
      </QrDialog>
      <QrDialog
        open={film.open}
        onClose={film.hide}
        labelledBy="qr-film-title"
        className={FILM_DIALOG}
        returnFocusRef={filmAction}
      >
        <FilmPanel titleId="qr-film-title" onClose={film.hide} />
      </QrDialog>
    </>
  );
}

/**
 * A group's title, set as the site's eyebrow: an amber rule, small tracked
 * capitals. The tracking sits on the inner span: the site's h1-h3 rule
 * (unlayered) resets letter-spacing on the heading itself.
 */
function GroupTitle({ id, style, children }: { id: string; style: CSSProperties; children: ReactNode }) {
  return (
    <h2 id={id} className="sc-qr-in flex items-center gap-3" style={style}>
      <span aria-hidden="true" className="h-px w-[18px] shrink-0 bg-[var(--sc-sun-deep)]" />
      <span className="text-[0.68rem] tracking-[0.2em] text-[rgba(25,25,25,0.7)] uppercase rtl:tracking-normal">
        {children}
      </span>
    </h2>
  );
}

/** A patient action beside the film: its icon, title, one sentence and action. */
function ActionCard({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className={`${CARD} flex gap-4 p-5 sm:p-6`}>
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[rgba(25,25,25,0.12)] text-[var(--sc-black)] transition-colors duration-300 group-hover:border-[var(--sc-sun)] group-hover:bg-[var(--sc-sun)] motion-reduce:transition-none"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[1.2rem] leading-tight">{title}</h3>
        <p className={`mt-1.5 text-pretty text-[0.9rem] leading-[1.55] ${MID}`}>{body}</p>
        <div className="mt-auto pt-2">{children}</div>
      </div>
    </div>
  );
}
