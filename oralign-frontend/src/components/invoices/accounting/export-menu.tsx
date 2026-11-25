'use client';

import {
  ChevronDownIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Loader2Icon,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDownloadAccountingPdf,
  useExportInvoicesCsv,
  useExportPeriodZip,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import type { InvoicePeriodParams } from '@/lib/types';
import { plural } from './recap-parts';

/** The server refuses a bigger period ZIP. */
export const PERIOD_ZIP_MAX = 1000;

const P = 'invoiceDesk.accounting.export';

/**
 * "Exporter": the three files an accountant asks for, all for the
 * period on screen — the sales journal (CSV for Excel), the
 * récapitulatif (PDF) and every invoice PDF of the period (ZIP).
 */
export function ExportMenu({
  period,
  rangeLabel,
  zipCount,
}: {
  period: InvoicePeriodParams;
  /** The period in words, shown on top of the menu. */
  rangeLabel: string;
  /**
   * Issued + paid + cancelled invoices of the period (what the ZIP
   * holds); undefined while the summary loads.
   */
  zipCount: number | undefined;
}) {
  const { t, lang } = useT();
  const csv = useExportInvoicesCsv();
  const pdf = useDownloadAccountingPdf();
  const zip = useExportPeriodZip();
  const pending = csv.isPending || pdf.isPending || zip.isPending;

  const zipEmpty = zipCount === 0;
  const zipTooBig = zipCount !== undefined && zipCount > PERIOD_ZIP_MAX;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 min-w-11 sm:h-8 sm:min-w-0"
          aria-busy={pending || undefined}
        >
          {pending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <DownloadIcon className="size-4" aria-hidden="true" />
          )}
          {/* Icon only under 380 px: the header row must hold on a 320 px phone. */}
          <span className="max-[379px]:sr-only">{t(`${P}.button`)}</span>
          <ChevronDownIcon
            className="size-3.5 text-muted-foreground max-[379px]:hidden"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="font-normal">
          <span className="block font-medium text-foreground">{t(`${P}.forPeriod`)}</span>
          {rangeLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ExportItem
          icon={FileSpreadsheetIcon}
          title={t(`${P}.csv`)}
          description={t(`${P}.csvHint`)}
          disabled={csv.isPending}
          onSelect={() => csv.mutate({ ...period })}
        />
        <ExportItem
          icon={FileTextIcon}
          title={t(`${P}.pdf`)}
          description={t(`${P}.pdfHint`)}
          disabled={pdf.isPending}
          onSelect={() => pdf.mutate({ period, language: lang })}
        />
        <ExportItem
          icon={FileArchiveIcon}
          title={t(`${P}.zip`)}
          description={
            zipTooBig
              ? t(`${P}.zipTooBig`, { max: PERIOD_ZIP_MAX })
              : zipEmpty
                ? t(`${P}.zipEmpty`)
                : zipCount !== undefined
                  ? t(`${P}.zipHint`, {
                      invoices: plural(t, lang, 'invoiceDesk.accounting.pdfFiles', zipCount),
                    })
                  : t(`${P}.zipHintLoading`)
          }
          disabled={zip.isPending || zipEmpty || zipTooBig}
          onSelect={() => zip.mutate(period)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExportItem({
  icon: Icon,
  title,
  description,
  disabled,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: ReactNode;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect} className="items-start gap-2.5 py-2">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs whitespace-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
