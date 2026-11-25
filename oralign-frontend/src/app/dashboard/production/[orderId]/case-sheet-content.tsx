'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FolderOpen, History, Info, RefreshCw } from 'lucide-react';
import {
  ActButtons,
  CaseSheetHeader,
  CaseSheetSkeleton,
} from '@/components/production/case-sheet';
import { ProductionCancelDialog } from '@/components/production/cancel-dialog';
import { DeclarationList } from '@/components/production/declaration-list';
import { ProductionDeclareSheet } from '@/components/production/declare-form';
import {
  groupDeclarations,
  isProductionRole,
  productionErrorText,
  type DeclarationGroup,
} from '@/components/production/production-format';
import {
  BackLink,
  ProductionFrame,
  ProductionMessage,
  ProductionNoAccess,
  ProductionSection,
} from '@/components/production/production-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readProductionError } from '@/lib/api/production.service';
import { useProductionSheet } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import type { ProductionCaseSheet, ProductionEventType } from '@/lib/types/production';

export function CaseSheetContent({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  if (!user) {
    return (
      <ProductionFrame>
        <Skeleton className="h-12 w-40 pointer-fine:md:h-9" />
        <CaseSheetSkeleton />
      </ProductionFrame>
    );
  }
  if (!isProductionRole(user.role)) return <ProductionNoAccess />;
  return <CaseSheet orderId={orderId} />;
}

function CaseSheet({ orderId }: { orderId: string }) {
  const { t } = useT();
  const sheet = useProductionSheet(orderId);

  return (
    <ProductionFrame>
      <BackLink href="/dashboard/production">{t('production.nav.backToQueue')}</BackLink>
      {sheet.isPending ? (
        <CaseSheetSkeleton />
      ) : sheet.isError && !sheet.data ? (
        <SheetError error={sheet.error} onRetry={() => sheet.refetch()} />
      ) : (
        <CaseSheetBody sheet={sheet.data} />
      )}
    </ProductionFrame>
  );
}

function SheetError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT();
  const { status, errorCode } = readProductionError(error);
  if (status === 404) {
    return <ProductionMessage role="alert" title={t('production.sheet.loadError')} detail={t('production.sheet.notFound')} />;
  }
  if (status === 403) {
    return (
      <ProductionMessage
        role="alert"
        title={t('production.sheet.loadError')}
        detail={errorCode ? productionErrorText(t, error) : t('production.access.body')}
      />
    );
  }
  return (
    <ProductionMessage
      role="alert"
      title={t('production.sheet.loadError')}
      detail={productionErrorText(t, error)}
      action={
        <Button variant="outline" className="h-12 pointer-fine:md:h-8" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t('production.retry')}
        </Button>
      }
    />
  );
}

function CaseSheetBody({ sheet }: { sheet: ProductionCaseSheet }) {
  const { t } = useT();
  const [form, setForm] = useState<{ act: ProductionEventType; open: boolean }>({
    act: 'model_printed',
    open: false,
  });
  const [cancelling, setCancelling] = useState<DeclarationGroup | null>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const groups = useMemo(() => groupDeclarations(sheet.history), [sheet.history]);
  const dossierHref = `/dashboard/production/${encodeURIComponent(sheet.orderId)}/dossier`;

  return (
    <>
      <CaseSheetHeader
        sheet={sheet}
        actions={
          // From md up the dossier sits by the case's name; phones keep the
          // big card under the history, where the thumb already is.
          <Button asChild variant="outline" className="hidden h-12 md:inline-flex pointer-fine:md:h-9">
            <Link href={dossierHref}>
              <FolderOpen aria-hidden="true" />
              {t('production.sheet.dossierLink')}
            </Link>
          </Button>
        }
      />

      {sheet.cannotDeclareReason && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t(`production.sheet.cannotDeclare.${sheet.cannotDeclareReason}`)}
        </p>
      )}

      <section aria-labelledby="declare-title" className="flex flex-col gap-2">
        <h2 id="declare-title" className="sr-only">
          {t('production.sheet.declareTitle')}
        </h2>
        <ActButtons sheet={sheet} onDeclare={(act) => setForm({ act, open: true })} />
      </section>

      <ProductionSection
        id="history"
        title={t('production.sheet.historyTitle')}
        headingRef={historyHeadingRef}
        bodyClassName="p-0 sm:p-0"
        className="overflow-hidden"
      >
        {groups.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-5">
            <History className="size-4 shrink-0" aria-hidden="true" />
            {t('production.sheet.historyEmpty')}
          </p>
        ) : (
          <div className="[&>ul]:rounded-none [&>ul]:ring-0">
            <DeclarationList groups={groups} onCancel={setCancelling} />
          </div>
        )}
      </ProductionSection>

      <Link
        href={dossierHref}
        className="flex min-h-16 items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/60 sm:px-5 md:hidden"
      >
        <FolderOpen className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t('production.sheet.dossierLink')}</span>
          <span className="block text-sm text-muted-foreground">{t('production.sheet.dossierHint')}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      <ProductionDeclareSheet
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        context={sheet}
        act={form.act}
      />
      <ProductionCancelDialog
        group={cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        // A cancelled row loses its "Annuler": back to the history, not the page top.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          historyHeadingRef.current?.focus();
        }}
      />
    </>
  );
}
