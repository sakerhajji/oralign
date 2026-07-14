'use client';

import Link from 'next/link';
import { Jost } from 'next/font/google';
import { SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { useLegalInfo } from '@/lib/hooks/use-company-billing';
import {
  buildLegalDoc,
  type LegalCompany,
  type LegalDoc,
  type LegalDocKey,
  type LegalRow,
} from '@/lib/legal/legal-content';

// Same display face the showcase legal pages use for their headings
// (`--font-sc-serif` in showcase.css maps to Jost). Loaded route-scoped
// here so the dashboard bundle only pays for it on the Help page.
const jost = Jost({ subsets: ['latin'], weight: ['300', '400', '500'] });

// Brand deep-amber accent — mirrors the showcase's `--sc-sun-deep`
// (#c99a0b) with a lighter variant for dark mode.
const ACCENT = 'text-[#c99a0b] dark:text-[#e3b64b]';

const TAB_KEYS: { value: LegalDocKey; labelKey: string }[] = [
  { value: 'about', labelKey: 'help.tabs.about' },
  { value: 'refunds', labelKey: 'help.tabs.refunds' },
  { value: 'legal', labelKey: 'help.tabs.legal' },
  { value: 'privacy', labelKey: 'help.tabs.privacy' },
  { value: 'termsOfUse', labelKey: 'help.tabs.termsOfUse' },
  { value: 'terms', labelKey: 'help.tabs.terms' },
];

/**
 * Help / compliance hub. Renders the legal documents (same shared
 * builders the public showcase pages use) in the doctor/admin's
 * language, presented in the showcase legal-page design: eyebrow with
 * the amber rule, light editorial headline, generous reading rhythm,
 * amber list markers and refined data tables. Company data comes from
 * billing settings via `useLegalInfo()` — nothing is hardcoded. Admins
 * get a shortcut to edit the underlying company details.
 */
export function HelpContent() {
  const { t, lang } = useT();
  const { isAdmin } = useAuth();
  const { data: legal } = useLegalInfo();

  const company: LegalCompany = legal ?? {};

  return (
    <div className="@container/main flex flex-1 flex-col p-4 lg:p-6">
      <div className="mx-auto w-full max-w-[900px]">
        {/* ── Page header ── */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1
              className={cn(
                jost.className,
                'text-2xl font-light tracking-tight sm:text-3xl',
              )}
            >
              {t('help.title')}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('help.subtitle')}
            </p>
          </div>
          {isAdmin && (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/account/billing-settings">
                <SettingsIcon className="h-4 w-4" />
                {t('help.editInSettings')}
              </Link>
            </Button>
          )}
        </header>

        <Tabs defaultValue="about" className="mt-8 w-full">
          {/* Underline tab strip — same navigation idiom as the public
              site, no pill chrome. Scrolls horizontally on phones. */}
          <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
            {TAB_KEYS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="-mb-px shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-[#c99a0b] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-[#e3b64b]"
              >
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_KEYS.map((tab) => {
            const doc = buildLegalDoc(tab.value, lang, company);
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-10">
                <LegalDocView doc={doc} />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

/** One legal document, presented like the showcase legal pages. */
function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <article>
      {/* Eyebrow — amber rule + spaced small caps. */}
      <div
        className={cn(
          'mb-5 flex items-center gap-3 text-[0.6rem] font-semibold uppercase tracking-[0.4em]',
          ACCENT,
        )}
      >
        <span className="h-px w-8 bg-current" aria-hidden="true" />
        <span>{doc.eyebrow}</span>
      </div>

      <h2
        className={cn(
          jost.className,
          'text-[1.9rem] font-light leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.4rem]',
        )}
      >
        {doc.title}
      </h2>

      <p className="mt-4 max-w-[640px] text-[0.95rem] leading-7 text-muted-foreground">
        {doc.description}
      </p>

      <div className="mt-10 space-y-9">
        {doc.sections.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h3
                className={cn(
                  jost.className,
                  'mb-3 text-[1.2rem] font-medium leading-snug tracking-[-0.01em] text-foreground',
                )}
              >
                {section.heading}
              </h3>
            )}

            {section.paragraphs?.map((p, j) => (
              <p
                key={j}
                className="mb-3.5 text-[0.93rem] leading-7 text-muted-foreground last:mb-0"
              >
                {p}
              </p>
            ))}

            {section.list && section.list.length > 0 && (
              <ul className="mb-3.5 ml-5 list-disc space-y-1.5 text-[0.93rem] leading-7 text-muted-foreground marker:text-[#c99a0b] last:mb-0 dark:marker:text-[#e3b64b]">
                {section.list.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )}

            {section.paragraphsAfter?.map((p, j) => (
              <p
                key={`after-${j}`}
                className="mb-3.5 text-[0.93rem] leading-7 text-muted-foreground last:mb-0"
              >
                {p}
              </p>
            ))}

            {section.rows && section.rows.length > 0 && (
              <dl className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-muted/30">
                {section.rows.map((r, k) => (
                  <RowLine key={k} row={r} />
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

/** One label/value line of a legal data table. */
function RowLine({ row }: { row: LegalRow }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-3.5 sm:grid-cols-[minmax(160px,0.4fr)_1fr] sm:gap-4 sm:px-5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {row.label}
      </dt>
      <dd
        className={
          row.missing
            ? 'text-sm italic text-muted-foreground/60'
            : 'text-sm font-medium text-foreground'
        }
      >
        {row.href && !row.missing ? (
          <a
            href={row.href}
            className={cn(
              'underline underline-offset-2 transition-opacity hover:opacity-80',
              ACCENT,
            )}
            {...(row.href.startsWith('http')
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            {row.value}
          </a>
        ) : (
          row.value
        )}
      </dd>
    </div>
  );
}
