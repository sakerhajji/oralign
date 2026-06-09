'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateInvoiceNumber } from '@/lib/hooks/use-payments';
import { cn } from '@/lib/utils';

/**
 * Inline, admin-editable invoice/receipt number.
 *
 * Read mode shows the persisted number (mono, `—` when unset). For an
 * admin a pencil swaps it for an input with save/cancel; Enter saves,
 * Escape cancels. Persistence + toasts live in `useUpdateInvoiceNumber`.
 * Used both in the payment-history row and on the invoice preview page,
 * so it takes a `size` to read well in a dense table or a page header.
 */
export function InvoiceNumberEditor({
  paymentId,
  value,
  canEdit,
  size = 'sm',
  className,
}: {
  paymentId: string;
  value?: string | null;
  canEdit: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const update = useUpdateInvoiceNumber();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const current = value?.trim() ?? '';
  const large = size === 'lg';

  const start = () => {
    setDraft(current);
    setEditing(true);
  };

  const save = () => {
    const next = draft.trim();
    if (!next || next === current) {
      setEditing(false);
      return;
    }
    update.mutate(
      { paymentId, invoiceNumber: next },
      { onSuccess: () => setEditing(false) },
    );
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
            if (e.key === 'Escape') setEditing(false);
          }}
          disabled={update.isPending}
          placeholder="FAC-000123"
          aria-label="Invoice number"
          className={cn(
            'font-mono',
            large ? 'h-9 w-48 text-sm' : 'h-7 w-32 text-xs',
          )}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={save}
          disabled={update.isPending}
          aria-label="Save invoice number"
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
          onClick={() => setEditing(false)}
          disabled={update.isPending}
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'font-mono tabular-nums',
          large ? 'text-base font-semibold' : 'text-xs',
          !current && 'text-muted-foreground',
        )}
      >
        {current || '—'}
      </span>
      {canEdit ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={start}
          aria-label="Edit invoice number"
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className={large ? 'h-4 w-4' : 'h-3 w-3'} />
        </Button>
      ) : null}
    </span>
  );
}
