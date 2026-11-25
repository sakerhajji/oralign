'use client';

import { ChevronDown, Download, FileSpreadsheet, Loader2, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExportProductionCsv } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionExportFormat, ProductionPeriodParams } from '@/lib/types/production';

/**
 * "Exporter": the two CSV files of the period on screen, for Excel (`;`,
 * UTF-8 BOM, French labels; built by the server): every entry, or the
 * totals per day with the consumption. The file keeps the server's name
 * (`production_<from>_<to>_<format>.csv`).
 */
export function ExportCsvMenu({
  period,
  rangeLabel,
}: {
  period: ProductionPeriodParams;
  /** The period in words, on top of the menu. */
  rangeLabel: string;
}) {
  const { t } = useT();
  const exportCsv = useExportProductionCsv();
  const pending = exportCsv.isPending;
  const run = (format: ProductionExportFormat) => exportCsv.mutate({ ...period, format });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 sm:h-8"
          aria-busy={pending || undefined}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {t('productionAdmin.exportCsv.button')}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('productionAdmin.exportCsv.menuLabel', { range: rangeLabel })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="items-start py-2" onSelect={() => run('detail')}>
          <FileSpreadsheet className="mt-0.5" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="font-medium">{t('productionAdmin.exportCsv.detail')}</span>
            <span className="text-xs text-muted-foreground">
              {t('productionAdmin.exportCsv.detailHint')}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className="items-start py-2" onSelect={() => run('daily')}>
          <Rows3 className="mt-0.5" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="font-medium">{t('productionAdmin.exportCsv.daily')}</span>
            <span className="text-xs text-muted-foreground">
              {t('productionAdmin.exportCsv.dailyHint')}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? t('productionAdmin.exportCsv.working') : ''}
      </span>
    </DropdownMenu>
  );
}
