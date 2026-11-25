'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/lib/i18n/lang-context';
import type { ActTotals } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ACTS, formatCount } from './format';
import { Count } from './parts';

export interface ActsRow {
  key: string;
  label: ReactNode;
  acts: ActTotals;
  /** Extra right-hand column (the recap's cancelled count). */
  extra?: number;
  /** A row drawn quietly (a day without entries). */
  muted?: boolean;
}

/**
 * Who / which case / which day × the four acts, as quantities. Fixed
 * column widths (the label column takes the rest and truncates), figures
 * right-aligned in tabular digits. On a phone the act columns narrow to
 * their abbreviations ("Mod.", "Therm.") so the table fits without
 * scrolling sideways. `cap` shows the first rows only, with "Afficher les
 * N" under them.
 */
export function ActsTable({
  labelHeader,
  rows,
  totals,
  extraHeader,
  extraHeaderTiny,
  extraTotal,
  cap,
}: {
  labelHeader: string;
  rows: ActsRow[];
  /** A total line under the rows. */
  totals?: ActTotals;
  extraHeader?: string;
  /** The extra column's header on a phone. */
  extraHeaderTiny?: string;
  extraTotal?: number;
  cap?: number;
}) {
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);
  const capped = cap !== undefined && rows.length > cap && !expanded;
  const shown = capped ? rows.slice(0, cap) : rows;
  const withExtra = extraHeader !== undefined;

  return (
    <>
      <Table className={cn('table-fixed', withExtra ? 'sm:min-w-[35rem]' : 'sm:min-w-[30rem]')}>
        <colgroup>
          <col />
          {ACTS.map((act) => (
            <col key={act} className="w-12 sm:w-[5.5rem]" />
          ))}
          {withExtra ? <col className="w-12 sm:w-[5.5rem]" /> : null}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 text-xs font-normal text-muted-foreground">
              {labelHeader}
            </TableHead>
            {ACTS.map((act) => (
              <TableHead
                key={act}
                className="px-1 text-right text-xs font-normal text-muted-foreground last:pr-4 sm:px-2"
                title={t(`production.acts.${act}`)}
              >
                <span className="sm:hidden">{t(`production.actsAbbr.${act}`)}</span>
                <span className="hidden sm:inline">{t(`production.actsShort.${act}`)}</span>
              </TableHead>
            ))}
            {withExtra ? (
              <TableHead className="pr-4 pl-1 text-right text-xs font-normal text-muted-foreground sm:pl-2">
                <span className="sm:hidden">{extraHeaderTiny ?? extraHeader}</span>
                <span className="hidden sm:inline">{extraHeader}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.key} className={cn(row.muted && 'text-muted-foreground')}>
              <TableCell className="truncate pl-4">{row.label}</TableCell>
              {ACTS.map((act) => (
                <TableCell key={act} className="px-1 text-right last:pr-4 sm:px-2">
                  <Count value={row.acts[act].quantity} />
                </TableCell>
              ))}
              {withExtra ? (
                <TableCell className="pr-4 pl-1 text-right sm:pl-2">
                  <Count value={row.extra ?? 0} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        {totals ? (
          <TableFooter className="bg-transparent">
            <TableRow className="hover:bg-transparent">
              <TableCell className="pl-4 font-semibold">{t('productionAdmin.cols.total')}</TableCell>
              {ACTS.map((act) => (
                <TableCell key={act} className="px-1 text-right font-semibold tabular-nums last:pr-4 sm:px-2">
                  {formatCount(totals[act].quantity, lang)}
                </TableCell>
              ))}
              {withExtra ? (
                <TableCell className="pr-4 pl-1 text-right font-semibold tabular-nums sm:pl-2">
                  {formatCount(extraTotal ?? 0, lang)}
                </TableCell>
              ) : null}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      {cap !== undefined && rows.length > cap ? (
        <div className="border-t px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 w-full text-muted-foreground sm:h-8"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronUp aria-hidden="true" />
            ) : (
              <ChevronDown aria-hidden="true" />
            )}
            {expanded
              ? t('productionAdmin.rows.showLess')
              : t('productionAdmin.rows.showAll', { count: rows.length })}
          </Button>
        </div>
      ) : null}
    </>
  );
}
