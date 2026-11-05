'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import { pageWindow } from './users-filters';

/**
 * Range + windowed page numbers (1 … 4 5 6 … 20). Phones get
 * previous / "page / total" / next only.
 */
export function UsersPagination({
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
      aria-label={t('usersDesk.pagination.aria')}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {t('usersAdmin.pagShowing', { from, to, total })}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('usersAdmin.previous')}
          >
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">{t('usersAdmin.previous')}</span>
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
                    aria-label={t('usersDesk.pagination.goTo', { page: item })}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                </li>
              ),
            )}
          </ul>
          <span className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden">
            {t('usersDesk.pagination.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={t('usersAdmin.next')}
          >
            <span className="hidden sm:inline">{t('usersAdmin.next')}</span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
