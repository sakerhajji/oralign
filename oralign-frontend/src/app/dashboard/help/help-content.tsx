'use client';

import Link from 'next/link';
import { CircleHelpIcon, SettingsIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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

const TAB_KEYS: { value: LegalDocKey; labelKey: string }[] = [
  { value: 'about', labelKey: 'help.tabs.about' },
  { value: 'refunds', labelKey: 'help.tabs.refunds' },
  { value: 'legal', labelKey: 'help.tabs.legal' },
  { value: 'privacy', labelKey: 'help.tabs.privacy' },
  { value: 'termsOfUse', labelKey: 'help.tabs.termsOfUse' },
  { value: 'terms', labelKey: 'help.tabs.terms' },
];

/**
 * Help / compliance hub. Renders the four payment-validation documents as
 * tabs, in the doctor/admin's language. Company data comes from billing
 * settings via `useLegalInfo()` — nothing is hardcoded. Admins get a
 * shortcut to edit the underlying company details.
 */
export function HelpContent() {
  const { t, lang } = useT();
  const { isAdmin } = useAuth();
  const { data: legal } = useLegalInfo();

  const company: LegalCompany = legal ?? {};

  return (
    <div className="@container/main flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <CircleHelpIcon className="h-5 w-5 text-primary" />
            {t('help.title')}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
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

      <Tabs defaultValue="about" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
          {TAB_KEYS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_KEYS.map((tab) => {
          const doc = buildLegalDoc(tab.value, lang, company);
          return (
            <TabsContent key={tab.value} value={tab.value} className="mt-5">
              <LegalDocCard doc={doc} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function LegalDocCard({ doc }: { doc: LegalDoc }) {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">{doc.title}</h2>
          <p className="text-sm text-muted-foreground">{doc.description}</p>
        </div>

        <div className="space-y-6">
          {doc.sections.map((section, i) => (
            <section key={i} className="space-y-3">
              {section.heading && (
                <h3 className="text-sm font-semibold text-foreground">
                  {section.heading}
                </h3>
              )}
              {section.paragraphs?.map((p, j) => (
                <p key={j} className="text-sm leading-6 text-muted-foreground">
                  {p}
                </p>
              ))}
              {section.rows && section.rows.length > 0 && (
                <dl className="divide-y rounded-lg border bg-muted/20">
                  {section.rows.map((r, k) => (
                    <RowLine key={k} row={r} />
                  ))}
                </dl>
              )}
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RowLine({ row }: { row: LegalRow }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 px-3 py-2.5 sm:grid-cols-[minmax(150px,0.4fr)_1fr] sm:gap-4 sm:px-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
            className="text-primary underline underline-offset-2 hover:opacity-80"
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
