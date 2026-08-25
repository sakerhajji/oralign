'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  ERROR_ACTIONS,
  ERROR_COPY,
  ERROR_THEME as T,
  HOME_HREF,
  LANG_SOURCES,
  errorLangFor,
  type ErrorKind,
  type ErrorLang,
  type LangSource,
} from '@/lib/error-pages/copy';

/**
 * The one branded error screen behind every failure surface — 404, 500,
 * 403, 401 and the global crash boundary.
 *
 * Two constraints shape it:
 *  - EVERY style is inline. `global-error.tsx` replaces the root layout,
 *    so globals.css may never have loaded; a stylesheet-dependent error
 *    page would render as naked HTML exactly when things are worst.
 *  - No providers, no context, no data fetching. It must render when the
 *    app around it is broken.
 *
 * Language resolves AFTER mount (localStorage + URL), so the server and
 * the first client render agree — a 404 is server-rendered, and a
 * hydration mismatch on the error page would be its own bug.
 */

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant: 'primary' | 'ghost';
};

export function ErrorScreen({
  kind,
  digest,
  onRetry,
  homeHref,
  homeLabel = 'home',
  langSource = 'showcase',
  extraAction,
  fill = 'viewport',
}: {
  kind: ErrorKind;
  /** Next's error digest — the only safe handle to give support. */
  digest?: string;
  /** Present on recoverable boundaries (error.tsx `reset`). */
  onRetry?: () => void;
  /** Overrides the per-language homepage (app surfaces pass their own). */
  homeHref?: string;
  /** Which wording the "go back" action uses. */
  homeLabel?: 'home' | 'dashboard' | 'login';
  extraAction?: { labels: Record<ErrorLang, string>; href: string };
  /**
   * How much room the screen takes:
   *  - `viewport` — owns the page (root 404/500, global crash);
   *  - `section` — sits between the showcase header and footer, which
   *    a segment-level boundary keeps on screen;
   *  - `panel` — a card inside the dashboard shell, sidebar intact.
   */
  fill?: 'viewport' | 'section' | 'panel';
  /** Which language store to read — see LANG_SOURCES. */
  langSource?: LangSource;
}) {
  const [lang, setLang] = useState<ErrorLang>(LANG_SOURCES[langSource].fallback);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANG_SOURCES[langSource].storageKey);
    } catch {
      /* private mode — fall back to the URL */
    }
    setLang(errorLangFor(window.location.pathname, stored, langSource));
  }, [langSource]);

  const copy = ERROR_COPY[kind];
  const rtl = lang === 'ar';

  // Without an explicit override, follow the language on screen: an
  // English error page must not send the visitor to a French page.
  const backHref = homeHref ?? HOME_HREF[lang];
  const backLabel = ERROR_ACTIONS[homeLabel][lang];
  const actions: Action[] = [];
  if (onRetry) {
    actions.push({
      label: ERROR_ACTIONS[kind === 'criticalError' ? 'reload' : 'retry'][lang],
      onClick: onRetry,
      variant: 'primary',
    });
    actions.push({ label: backLabel, href: backHref, variant: 'ghost' });
  } else {
    actions.push({ label: backLabel, href: backHref, variant: 'primary' });
  }
  if (extraAction) {
    actions.push({ label: extraAction.labels[lang], href: extraAction.href, variant: 'ghost' });
  }

  const primaryStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    padding: '0 28px',
    background: T.sun,
    color: T.black,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: T.body,
  };

  const ghostStyle: CSSProperties = {
    ...primaryStyle,
    background: 'transparent',
    color: T.white,
    fontWeight: 500,
    border: `1px solid ${T.hairline}`,
  };

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      lang={lang}
      // An error boundary swaps this in WITHOUT a navigation, so nothing
      // else tells a screen-reader user the page just changed. On the
      // routed screens (404/401/403) the page title announcement already
      // covers it, and role="alert" would only be noise.
      role={onRetry ? 'alert' : undefined}
      style={{
        minHeight: fill === 'viewport' ? '100svh' : 'min(70svh, 560px)',
        borderRadius: fill === 'panel' ? 14 : 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: '48px 24px',
        background: T.black,
        color: T.white,
        fontFamily: T.body,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {/* `100svh` is the SMALLEST viewport height, so while a mobile
          browser's URL bar is expanded the dark panel falls short of the
          screen and globals.css' white body shows through underneath.
          Painting the document itself is the only fix that survives
          every bar state — and only the full-page variant may do it. */}
      {fill === 'viewport' ? (
        <style dangerouslySetInnerHTML={{ __html: `html,body{background:${T.black};}` }} />
      ) : null}

      {/* Wordmark — inline SVG so it renders with no asset pipeline. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 44 }}>
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke={T.sun}
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="14" r="4" fill={T.sun} stroke="none" />
          <path d="M12 6V3" />
          <path d="M6.3 8.3 4.2 6.2" />
          <path d="M17.7 8.3l2.1-2.1" />
          <path d="M4 14H1" />
          <path d="M23 14h-3" />
        </svg>
        <span
          style={{
            fontFamily: T.display,
            fontSize: '1.1rem',
            letterSpacing: '0.22em',
          }}
        >
          ORALIGN
        </span>
      </div>

      <div
        style={{
          fontSize: '0.58rem',
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: T.sun,
        }}
      >
        {copy.eyebrow[lang]}
      </div>

      <div
        aria-hidden="true"
        style={{
          fontFamily: T.display,
          fontSize: 'clamp(4.5rem, 15vw, 9rem)',
          fontWeight: 300,
          lineHeight: 1,
          color: T.sun,
          marginTop: 12,
          // Arabic-Indic digits would read as decoration here; the numeral
          // is a status code, so it stays Latin in every language.
          direction: 'ltr',
        }}
      >
        {copy.code}
      </div>

      <h1
        style={{
          fontFamily: T.display,
          fontSize: 'clamp(1.5rem, 3.4vw, 2.2rem)',
          fontWeight: 300,
          lineHeight: 1.2,
          margin: '20px 0 0',
          maxWidth: 620,
        }}
      >
        {copy.title[lang]}
      </h1>

      <p
        style={{
          margin: '16px 0 0',
          maxWidth: 480,
          fontSize: '0.95rem',
          lineHeight: 1.8,
          color: T.onDarkMuted,
        }}
      >
        {copy.body[lang]}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 12,
          marginTop: 40,
        }}
      >
        {actions.map((action) =>
          action.href ? (
            <a
              key={action.label}
              href={action.href}
              style={action.variant === 'primary' ? primaryStyle : ghostStyle}
            >
              {action.label}
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              style={action.variant === 'primary' ? primaryStyle : ghostStyle}
            >
              {action.label}
            </button>
          ),
        )}
      </div>

      {digest ? (
        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: `1px solid ${T.hairline}`,
            fontSize: '0.68rem',
            letterSpacing: '0.08em',
            color: T.onDarkMuted,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            direction: 'ltr',
          }}
        >
          {ERROR_ACTIONS.reference[lang]} : {digest}
        </div>
      ) : null}
    </div>
  );
}
