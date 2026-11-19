'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGeneratePublicLink } from '@/lib/hooks/use-treatment-plans';
import { useT } from '@/lib/i18n/lang-context';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const COPY = 'treatmentReview.header';
const LINK_VALID_DAYS = 30;
const COPIED_FEEDBACK_MS = 2000;
/** Thumb-sized on phones, aligned with the field on larger screens. */
const CONTROL_HEIGHT = 'h-11 sm:h-10';

/** The date-fns locale of the dashboard language (English is its default). */
export function dateLocaleOf(lang: string) {
  return lang === 'fr' ? fr : undefined;
}

/**
 * The link a patient opens without an account: its state, the link itself
 * and what can be done with it. Replacing an active link cuts off whoever
 * already has it, so that one action asks first.
 */
export function PatientLinkPanel({
  planId,
  token,
  expiresAt,
}: {
  planId: string;
  token: string | null | undefined;
  expiresAt: string | null | undefined;
}) {
  const { t, lang } = useT();
  const generate = useGeneratePublicLink();
  const [renderedAt] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const createLink = () => generate.mutate({ id: planId, validDays: LINK_VALID_DAYS });
  const pendingIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;

  if (!token) {
    return (
      <section
        aria-label={t(`${COPY}.patientLinkField`)}
        className="mx-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="font-medium">{t(`${COPY}.patientLinkField`)}</p>
          <p className="text-xs text-muted-foreground">
            {t(`${COPY}.patientLinkHint`, { days: LINK_VALID_DAYS })}
          </p>
        </div>
        <Button
          type="button"
          className={cn(CONTROL_HEIGHT, 'shrink-0 gap-2 px-4')}
          onClick={createLink}
          disabled={generate.isPending}
        >
          {generate.isPending ? pendingIcon : <Link2 className="h-4 w-4" aria-hidden />}
          {t(`${COPY}.generatePatientLink`)}
        </Button>
      </section>
    );
  }

  const url = `${window.location.origin}/created_for_you/${token}`;
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const expired = !!expiry && expiry.getTime() < renderedAt;
  const expiryDate = expiry ? format(expiry, 'PP', { locale: dateLocaleOf(lang) }) : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      toast.success(t(`${COPY}.patientLinkCopied`));
    } catch {
      fieldRef.current?.select();
      toast.error(t(`${COPY}.patientLinkCopyFailed`));
    }
  };

  return (
    <section aria-label={t(`${COPY}.patientLinkField`)} className="mx-4 space-y-3 border-t pt-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', expired ? 'bg-red-500' : 'bg-emerald-500')}
        />
        <span className="font-medium">
          {t(`${COPY}.${expired ? 'patientLinkExpired' : 'patientLinkActive'}`)}
        </span>
        {expiryDate && (
          <span className="text-xs text-muted-foreground">
            {t(`${COPY}.${expired ? 'expiredOn' : 'expiresOn'}`, { date: expiryDate })}
          </span>
        )}
      </p>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          ref={fieldRef}
          readOnly
          value={url}
          aria-label={t(`${COPY}.patientLinkField`)}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            CONTROL_HEIGHT,
            'min-w-0 truncate bg-muted/40 font-mono text-xs lg:flex-1',
            expired && 'text-muted-foreground line-through',
          )}
        />

        {expired ? (
          <Button
            type="button"
            className={cn(CONTROL_HEIGHT, 'shrink-0 gap-2 px-4')}
            onClick={createLink}
            disabled={generate.isPending}
          >
            {generate.isPending ? pendingIcon : <RefreshCw className="h-4 w-4" aria-hidden />}
            {t(`${COPY}.rotatePatientLink`)}
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              className={cn(CONTROL_HEIGHT, 'flex-1 gap-2 px-1 sm:min-w-36 sm:px-4 lg:flex-none')}
              onClick={() => void copyLink()}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              <span aria-live="polite">{t(`${COPY}.${copied ? 'linkCopied' : 'copyLink'}`)}</span>
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-11 shrink-0 sm:size-10"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t(`${COPY}.openPatientLink`)}
                title={t(`${COPY}.openPatientLink`)}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(CONTROL_HEIGHT, 'shrink-0 gap-2 px-2 aria-disabled:opacity-50 sm:px-3')}
                  // Stays focusable during the request: the closing dialog
                  // hands keyboard focus back to this button.
                  aria-disabled={generate.isPending}
                  onClick={(event) => {
                    if (generate.isPending) event.preventDefault();
                  }}
                >
                  {generate.isPending ? pendingIcon : <RefreshCw className="h-4 w-4" aria-hidden />}
                  {t(`${COPY}.renewLink`)}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t(`${COPY}.renewConfirmTitle`)}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(`${COPY}.renewConfirmBody`, { days: LINK_VALID_DAYS })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={createLink}>{t(`${COPY}.renewLink`)}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </section>
  );
}
