'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Full-width card for the wizard's non-form states (start, read-only,
 * unavailable, load error), with a way back to the initial case.
 */
export function WizardStateCard({
  icon: Icon,
  title,
  description,
  backHref,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  backHref: string;
  /** Primary action(s), shown before the back link. */
  children?: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-md border bg-card p-6 text-center shadow-sm sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-balance text-xl font-bold tracking-tight">{title}</h1>
      {description ? (
        <div className="max-w-prose text-sm leading-6 text-muted-foreground">{description}</div>
      ) : null}
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-center">
        <Button asChild variant="outline" className="h-11">
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            {t('supplemental.parentCase')}
          </Link>
        </Button>
        {children}
      </div>
    </section>
  );
}

/** Placeholder while the case and the request load. */
export function WizardSkeleton() {
  const { t } = useT();
  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-7" aria-busy="true" aria-label={t('common.loading')}>
      <Skeleton className="h-16 w-full rounded-md" />
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}
