'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Page numbers to show around `page`, with `'gap'` for an ellipsis:
 * 1 … 4 5 6 … 20. At most 7 slots, so the row never overflows.
 */
export function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((p) => pages.add(p));
  if (page >= totalPages - 3) {
    [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) =>
      pages.add(p),
    );
  }
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Range + windowed page numbers (1 … 4 5 6 … 20) under a list. Phones get
 * previous / "page / total" / next only. Renders nothing for an empty list.
 */
export function ListPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useT();
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={t('listUi.pagination.aria')}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {t('listUi.pagination.showing', { from, to, total })}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('listUi.pagination.previous')}
          >
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">{t('listUi.pagination.previous')}</span>
          </Button>
          <ul className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, totalPages).map((item, index) =>
              item === 'gap' ? (
                <li
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="w-6 text-center text-sm text-muted-foreground"
                >
                  …
                </li>
              ) : (
                <li key={item}>
                  <Button
                    variant={item === page ? 'secondary' : 'ghost'}
                    size="sm"
                    className="min-w-7 px-2 tabular-nums"
                    aria-current={item === page ? 'page' : undefined}
                    aria-label={t('listUi.pagination.goTo', { page: item })}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                </li>
              ),
            )}
          </ul>
          <span className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden">
            {t('listUi.pagination.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={t('listUi.pagination.next')}
          >
            <span className="hidden sm:inline">{t('listUi.pagination.next')}</span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
