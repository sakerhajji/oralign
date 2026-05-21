"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "../_lib/nav";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

export function MobileNav() {
  const { lang } = useShowcaseLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Same trick as the desktop Header: when we're not on the homepage,
  // anchor links need a "/" prefix so clicking actually navigates home
  // instead of just appending the hash to the current URL.
  const onHome = pathname === "/";
  const resolveAnchor = (hashHref: string): string =>
    hashHref.startsWith("#") && !onHome ? `/${hashHref}` : hashHref;

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
        className="w-[88vw] max-w-[360px] border-l border-[#e8e4de] bg-[#f8f6f2] p-0 text-[#0a0a0a]"
      >
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b border-[#e8e4de] px-5 py-4">
          <SheetTitle asChild>
            <Image
              src="/ORALIGN BLACK.png"
              alt="Oralign"
              width={1240}
              height={880}
              className="h-9 w-auto"
            />
          </SheetTitle>
          <SheetClose
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center text-[#0a0a0a] transition-colors hover:text-[#f5c842]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 3 L15 15 M15 3 L3 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
            </svg>
          </SheetClose>
        </SheetHeader>

        <nav aria-label="Mobile" className="flex flex-col px-5 pt-4 pb-8">
          <ul className="flex list-none flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <SheetClose asChild>
                  <Link
                    href={resolveAnchor(item.href)}
                    className="group flex items-center justify-between border-b border-[#e8e4de] py-4 no-underline text-[#0a0a0a]/70 transition-colors hover:text-[#0a0a0a]"
                  >
                    <span className="text-[0.72rem] uppercase tracking-[0.28em]">
                      {dict.nav[item.labelKey][lang]}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-[#f5c842] -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                    >
                      →
                    </span>
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-3">
            <SheetClose asChild>
              <Link
                href={resolveAnchor("#cta")}
                className="block bg-[#f5c842] px-6 py-3.5 text-center text-[0.62rem] font-medium uppercase tracking-[0.3em] text-[#0a0a0a] no-underline transition-colors hover:bg-[#f9d96a]"
              >
                {dict.nav.bookDemo[lang]}
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href="/login"
                className="block border border-[#0a0a0a] px-6 py-3 text-center text-[0.62rem] uppercase tracking-[0.3em] text-[#0a0a0a] no-underline transition-colors hover:bg-[#0a0a0a] hover:text-[#f8f6f2]"
              >
                {dict.nav.login[lang]}
              </Link>
            </SheetClose>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
