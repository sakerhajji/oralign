'use client';

import { MailWarning } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useT } from '@/lib/i18n/lang-context';

/**
 * "Can't find the email? Check your spam folder." — shown wherever someone
 * waits for one of our mails (verification code, password reset link):
 * they often land in Spam or Promotions (Gmail especially), and people
 * give up or ask for code after code instead of looking there.
 */
export function SpamHint({ className = '' }: { className?: string }) {
  const { t } = useT();
  return (
    <Alert
      className={`border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 ${className}`}
    >
      <MailWarning className="size-4 !text-amber-600 dark:!text-amber-400" aria-hidden="true" />
      <AlertTitle className="leading-snug">{t('authPages.common.spamTitle')}</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-100/80">
        <p>{t('authPages.common.spamBody')}</p>
      </AlertDescription>
    </Alert>
  );
}
