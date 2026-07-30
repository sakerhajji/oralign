"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "../_lib/nav";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { MobileNav } from "./mobile-nav";

// The public site is the patient website with one nav. Two clear actions
// live in the header: "Trouver un praticien" (the public finder) and
// "Espace praticien" (the secured platform sign-in / sign-up).
const FINDER_HREF = "/trouver-un-praticien";
const PRACTITIONER_SPACE_HREF = "/login";

export function Header() {
  const { lang } = useShowcaseLang();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const navItems = NAV_ITEMS;
  const navLabel = (key: string): string =>
    dict.nav[key as keyof typeof dict.nav]?.[lang] ?? key;

  // Anchor sections to observe on the CURRENT page = the `#hash` of any
  // dropdown child whose route is the active pathname (e.g. on
  // /decouvrir we watch #oralign, #oralign-prime, …).
  const sectionIds = (() => {
    const ids: string[] = [];
    for (const item of navItems) {
      const collect = (href: string) => {
        const i = href.indexOf("#");
        if (i < 0) return;
        const route = href.slice(0, i);
        if (route === "" || route === pathname) ids.push(href.slice(i + 1));
      };
      collect(item.href);
      for (const child of item.children ?? []) collect(child.href);
    }
    return Array.from(new Set(ids));
  })();

  // The in-view section id, ignoring any value left over from a previous
  // page (a stale id won't be among the current page's sectionIds).
  const activeSection = active && sectionIds.includes(active) ? active : null;

  // A top-level item is active when its page is current (or one of its
  // children lives on the current page); a dropdown child is active when
  // its section is the one in view (tracked by the observer below).
  const isItemActive = (item: NavItem): boolean =>
    pathname === item.href ||
    (item.children ?? []).some((c) => c.href.split("#")[0] === pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the dropdown child whose section is currently in view.
  useEffect(() => {
    if (sectionIds.length === 0) return;
    const els = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join(",")]);

  return (
    <header
      role="banner"
      className={[
        "sticky top-0 z-[300] w-full max-w-full bg-[var(--sc-white)] transition-shadow duration-300",
        scrolled
          ? "shadow-[0_1px_0_var(--sc-grey),0_8px_24px_-12px_rgba(10,10,10,0.10)]"
          : "border-b border-[var(--sc-grey)]",
      ].join(" ")}
    >
      <div className="relative mx-auto flex h-16 max-w-[1400px] items-center px-4 sm:h-[72px] sm:px-6 lg:h-20 lg:px-12">
        {/* Logo — absolute-centered on <lg, inline on lg+ */}
        <Link
          href="/decouvrir"
          aria-label="Oralign — home"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0 flex shrink-0 items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]"
        >
          <Image
            src="/mainlogo.svg"
            alt="Oralign"
            width={1240}
            height={880}
            priority
            sizes="(min-width: 1024px) 56px, (min-width: 640px) 48px, 40px"
            className="h-12 w-auto sm:h-12 lg:h-14"
          />
        </Link>

        {/* Desktop nav — only on lg+ */}
        <nav
          aria-label="Primary"
          className="mx-4 hidden min-w-0 flex-1 items-center justify-center lg:flex xl:mx-6"
        >
          <ul className="flex list-none items-center gap-0.5 xl:gap-1">
            {navItems.map((item) => {
              const isActive = isItemActive(item);
              const hasChildren = !!item.children?.length;

              const trigger = (
                <Link
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  aria-haspopup={hasChildren ? "true" : undefined}
                  className={[
                    "relative inline-flex items-center gap-1.5 rounded-md px-2 py-2.5 text-[0.8rem] font-medium leading-none no-underline transition-colors xl:px-2.5 xl:text-[0.86rem] 2xl:px-3 2xl:text-[0.9rem]",
                    isActive
                      ? "text-[var(--sc-black)]"
                      : "text-[var(--sc-text-mid)] hover:text-[var(--sc-black)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]",
                  ].join(" ")}
                >
                  <span>{navLabel(item.labelKey)}</span>
                  {hasChildren ? (
                    <ChevronDown
                      aria-hidden="true"
                      className="h-3.5 w-3.5 opacity-70 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={[
                      "absolute inset-x-2 -bottom-0.5 h-px origin-left bg-[var(--sc-sun)] transition-transform duration-300",
                      isActive ? "scale-x-100" : "scale-x-0",
                    ].join(" ")}
                  />
                </Link>
              );

              if (!hasChildren) {
                return <li key={item.id}>{trigger}</li>;
              }

              return (
                <li key={item.id} className="group relative">
                  {trigger}
                  {/* Dropdown — opens on hover + keyboard focus-within. */}
                  <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 translate-y-1 pt-3 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <ul className="min-w-[264px] list-none border border-[var(--sc-grey)] bg-[var(--sc-white)] p-2 shadow-[0_24px_60px_-28px_rgba(10,10,10,0.4)]">
                      {(item.children ?? []).map((child) => {
                        const [childRoute, childHash] = child.href.split("#");
                        const childActive =
                          (childRoute === "" || childRoute === pathname) &&
                          activeSection === childHash;
                        return (
                          <li key={child.id}>
                            <Link
                              href={child.href}
                              aria-current={childActive ? "true" : undefined}
                              className={[
                                "block rounded-md px-3 py-2.5 text-[0.88rem] font-medium leading-snug no-underline transition-colors",
                                childActive
                                  ? "bg-[var(--sc-sun-3)] text-[var(--sc-black)]"
                                  : "text-[var(--sc-text-mid)] hover:bg-[rgba(25,25,25,0.05)] hover:text-[var(--sc-black)]",
                              ].join(" ")}
                            >
                              {navLabel(child.labelKey)}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right cluster — the two public actions on lg+; hamburger on <lg */}
        <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href={PRACTITIONER_SPACE_HREF}
            className="hidden items-center px-2 py-2 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)] lg:inline-flex xl:px-3 xl:text-[0.72rem]"
          >
            {dict.nav.practitionerSpace[lang]}
          </Link>
          <Link
            href={FINDER_HREF}
            className="hidden min-h-11 items-center bg-[var(--sc-sun)] px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2,#f9d96a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-black)] lg:inline-flex xl:px-5 xl:text-[0.72rem]"
          >
            {dict.nav.findPractitionerCta[lang]}
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
