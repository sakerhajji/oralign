"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";

/**
 * Social share row for a blog article. No third-party SDKs — every target
 * is a plain share-intent URL built from the absolute canonical, opened in
 * a new tab. The "copy link" button uses the Clipboard API with a
 * legacy fallback so it works without HTTPS in local dev.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const { lang } = useShowcaseLang();
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    {
      key: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: <XIcon />,
    },
    {
      key: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <FacebookIcon />,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <LinkedInIcon />,
    },
  ];

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — silently no-op; the link is still selectable.
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--sc-mid-grey)]">
        {dict.blog.shareLabel[lang]}
      </span>
      <div className="flex items-center gap-2">
        {targets.map((t) => (
          <a
            key={t.key}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.label}
            className="grid size-9 place-items-center rounded-full border border-[var(--sc-grey)] text-[var(--sc-text-mid)] transition-colors hover:border-[var(--sc-black)] hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
          >
            {t.icon}
          </a>
        ))}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? dict.blog.shareCopied[lang] : dict.blog.shareLabel[lang]}
          className="grid size-9 place-items-center rounded-full border border-[var(--sc-grey)] text-[var(--sc-text-mid)] transition-colors hover:border-[var(--sc-black)] hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
        >
          {copied ? (
            <Check size={16} aria-hidden="true" className="text-[var(--sc-sun-deep)]" />
          ) : (
            <Link2 size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

/** Inline X (Twitter) glyph — lucide ships no current X mark. */
function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Inline Facebook glyph — lucide removed brand marks. */
function FacebookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/** Inline LinkedIn glyph — lucide removed brand marks. */
function LinkedInIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
