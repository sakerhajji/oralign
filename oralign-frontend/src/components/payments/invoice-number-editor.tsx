'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateInvoiceNumber } from '@/lib/hooks/use-payments';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

/**
 * A receipt's number as the link that opens the receipt ("FAC-000123"),
 * or `fallback` ("View receipt") while no number has been issued yet.
 */
export function ReceiptNumberLink({
  href,
  number,
  fallback,
  className,
}: {
  href: string;
  number?: string | null;
  fallback: string;
  className?: string;
}) {
  const { t } = useT();
  const current = number?.trim() ?? '';
  return (
    <Link
      href={href}
      aria-label={current ? t('paymentsDesk.list.receiptAria', { number: current }) : undefined}
      className={cn(
        'truncate rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        current ? 'font-mono text-xs tabular-nums' : 'text-xs font-medium',
        className,
      )}
    >
      {current || fallback}
    </Link>
  );
}

/** The API's limit for a receipt number (UpdateInvoiceNumberDto). */
const NUMBER_MAX_LENGTH = 40;

/**
 * Inline, admin-editable invoice/receipt number.
 *
 * Read mode shows the persisted number (mono, `—` when unset) — or, with
 * `href`, the number as the link to its receipt (`fallback` while none
 * is issued). For an admin a pencil swaps it for an input with
 * save/cancel; Enter saves, Escape cancels, and either way the focus
 * comes back to the pencil (the input it was in is gone). Persistence +
 * toasts live in `useUpdateInvoiceNumber`. Used both in the payments list
 * and on the invoice preview page, so it takes a `size` to read well in a
 * dense table or a page header.
 */
export function InvoiceNumberEditor({
  paymentId,
  value,
  canEdit,
  size = 'sm',
  className,
  href,
  fallback,
}: {
  paymentId: string;
  value?: string | null;
  canEdit: boolean;
  size?: 'sm' | 'lg';
  className?: string;
  /** Show the number as a link to this receipt. */
  href?: string;
  /** The link's text while no number is set (with `href`). */
  fallback?: string;
}) {
  const { t } = useT();
  const update = useUpdateInvoiceNumber();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const pencilRef = useRef<HTMLButtonElement>(null);
  // Set when the editor closes from inside it, so focus returns to the pencil.
  const refocus = useRef(false);

  const current = value?.trim() ?? '';
  const large = size === 'lg';

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    pencilRef.current?.focus();
  }, [editing]);

  const close = () => {
    refocus.current = true;
    setEditing(false);
  };

  const start = () => {
    setDraft(current);
    setEditing(true);
  };

  const save = () => {
    const next = draft.trim();
    if (!next || next === current) {
      close();
      return;
    }
    update.mutate({ paymentId, invoiceNumber: next }, { onSuccess: close });
  };

  if (editing) {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') close();
          }}
          disabled={update.isPending}
          maxLength={NUMBER_MAX_LENGTH}
          placeholder={t('paymentsCommon.invoiceNumberPh')}
          aria-label={t('paymentsCommon.invoiceNumberAria')}
          className={cn(
            'font-mono',
            // sm fits the payments table's receipt column with both buttons.
            large ? 'h-9 w-48 text-sm' : 'h-7 w-24 text-xs',
          )}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={save}
          disabled={update.isPending}
          aria-label={t('paymentsCommon.saveInvoiceAria')}
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4 text-emerald-600" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={close}
          disabled={update.isPending}
          aria-label={t('paymentsCommon.cancelAria')}
        >
          <X className="h-4 w-4" />
        </Button>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {href ? (
        <ReceiptNumberLink href={href} number={current} fallback={fallback ?? '—'} />
      ) : (
        <span
          className={cn(
            'font-mono tabular-nums',
            large ? 'text-base font-semibold' : 'text-xs',
            !current && 'text-muted-foreground',
          )}
        >
          {current || '—'}
        </span>
      )}
      {canEdit ? (
        <Button
          ref={pencilRef}
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={start}
          // Names its row: a list holds one pencil per receipt.
          aria-label={
            current
              ? t('paymentsCommon.editReceiptNumberAria', { number: current })
              : t('paymentsCommon.editReceiptNumberEmptyAria')
          }
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className={large ? 'h-4 w-4' : 'h-3 w-3'} />
        </Button>
      ) : null}
    </span>
  );
}
