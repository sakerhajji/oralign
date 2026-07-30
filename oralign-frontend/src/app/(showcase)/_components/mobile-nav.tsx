"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "../_lib/nav";
import { dict, LANGS, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

const FINDER_HREF = "/trouver-un-praticien";
const PRACTITIONER_SPACE_HREF = "/login";

export function MobileNav() {
  const { lang, setLang } = useShowcaseLang();
  const [open, setOpen] = useState(false);
  const navItems = NAV_ITEMS;
  const [openId, setOpenId] = useState<string | null>(null);
  const navLabel = (key: string): string =>
    dict.nav[key as keyof typeof dict.nav]?.[lang] ?? key;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="inline-flex h-11 w-11 items-center justify-center text-[var(--sc-black)] lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
        >
          <span aria-hidden="true" className="relative block h-3 w-5">
            <span
              className={[
                "absolute inset-x-0 h-px bg-current transition-all duration-300",
                open ? "top-1.5 rotate-45" : "top-0",
              ].join(" ")}
            />
            <span
              className={[
                "absolute inset-x-0 top-1.5 h-px bg-current transition-opacity duration-200",
                open ? "opacity-0" : "opacity-100",
              ].join(" ")}
            />
            <span
              className={[
                "absolute inset-x-0 h-px bg-current transition-all duration-300",
                open ? "top-1.5 -rotate-45" : "top-3",
              ].join(" ")}
            />
          </span>
        </button>
      </SheetTrigger>

      {/* data-theme on the sheet content guarantees CSS variables resolve
          inside the Radix portal that mounts under <body>. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        data-theme="showcase"
        className="inset-0 z-[60] h-[100dvh] w-[100dvw] max-w-[100dvw] gap-0 overflow-x-hidden overflow-y-auto border-l-0 bg-[var(--sc-white)] p-0 text-[var(--sc-black)] sm:max-w-none"
      >
        <SheetHeader className="grid grid-cols-[44px_1fr_44px] items-center gap-3 border-b border-[var(--sc-grey)] px-5 py-4">
          <span aria-hidden="true" />
          <SheetTitle className="sr-only">ORALIGN menu</SheetTitle>
          <Link href="/decouvrir" aria-label="Oralign home" className="col-start-2 mx-auto flex items-center justify-center no-underline">
            <Image
              src="/mainlogo.svg"
              alt="Oralign"
              width={1240}
              height={880}
              priority
              className="h-11 w-auto"
            />
          </Link>
          <SheetClose
            aria-label="Close menu"
            className="col-start-3 inline-flex h-11 w-11 items-center justify-center justify-self-end text-[var(--sc-black)] transition-colors hover:text-[var(--sc-sun-deep)]"
          >
            <X size={26} strokeWidth={1.45} aria-hidden="true" />
          </SheetClose>
        </SheetHeader>

        <nav aria-label="Mobile" className="flex min-h-[calc(100dvh-76px)] flex-col px-5 pb-8 pt-6">
          <ul className="flex list-none flex-col border-t border-[var(--sc-grey)]">
            {navItems.map((item) => {
              const hasChildren = !!item.children?.length;

              if (!hasChildren) {
                return (
                  <li key={item.id}>
                    <SheetClose asChild>
                      <Link
                        href={item.href}
                        className="group flex min-h-16 items-center justify-between gap-4 border-b border-[var(--sc-grey)] py-4 no-underline text-[var(--sc-text-dark)]/70 transition-colors hover:text-[var(--sc-black)]"
                      >
                        <span className="text-[0.98rem] font-medium leading-snug">
                          {navLabel(item.labelKey)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[var(--sc-sun-deep)] opacity-70 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                        >
                          →
                        </span>
                      </Link>
                    </SheetClose>
                  </li>
                );
              }

              const isOpen = openId === item.id;
              return (
                <li key={item.id} className="border-b border-[var(--sc-grey)]">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left text-[var(--sc-text-dark)]/70 transition-colors hover:text-[var(--sc-black)]"
                  >
                    <span className="text-[0.98rem] font-medium leading-snug">
                      {navLabel(item.labelKey)}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={[
                        "h-4 w-4 shrink-0 text-[var(--sc-sun-deep)] transition-transform duration-200",
                        isOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </button>
                  {isOpen ? (
                    <ul className="list-none pb-2">
                      {(item.children ?? []).map((child) => (
                        <li key={child.id}>
                          <SheetClose asChild>
                            <Link
                              href={child.href}
                              className="flex min-h-12 items-center gap-3 py-2.5 ps-3 text-[0.9rem] leading-snug text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)]"
                            >
                              <span
                                aria-hidden="true"
                                className="h-px w-4 shrink-0 bg-[var(--sc-sun-deep)]"
                              />
                              <span>{navLabel(child.labelKey)}</span>
                            </Link>
                          </SheetClose>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-7 grid grid-cols-3 border border-[var(--sc-grey)]">
            {LANGS.map((l: Lang) => {
              const active = l === lang;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={active}
                  className={[
                    "h-12 border-r border-[var(--sc-grey)] text-[0.74rem] uppercase tracking-[0.22em] transition-colors last:border-r-0",
                    active
                      ? "bg-[var(--sc-black)] text-[var(--sc-sun)]"
                      : "bg-transparent text-[var(--sc-text-mid)] hover:text-[var(--sc-black)]",
                  ].join(" ")}
                >
                  {l}
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            <SheetClose asChild>
              <Link
                href={FINDER_HREF}
                className="block w-full bg-[var(--sc-sun)] px-5 py-4 text-center text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)]"
              >
                {dict.nav.findPractitionerCta[lang]}
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href={PRACTITIONER_SPACE_HREF}
                className="block w-full border border-[var(--sc-black)] px-5 py-4 text-center text-[0.76rem] font-medium uppercase tracking-[0.14em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)]"
              >
                {dict.nav.practitionerSpace[lang]}
              </Link>
            </SheetClose>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
