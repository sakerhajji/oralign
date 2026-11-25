'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Check, Copy, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * A generated temporary password, shown ONCE (create-user dialog, user
 * sheet). It lives only in the caller's component state: never in the
 * React Query cache, the URL or storage, so closing the surface forgets it.
 * The field is read-only and selectable, so it can be copied by hand when
 * the clipboard is refused (plain http, an old tablet browser).
 */
export function TemporaryPasswordPanel({
  password,
  name,
  autoFocus = false,
  inputRef: externalInputRef,
  className,
}: {
  password: string;
  /** Who receives it, for the hand-over note. */
  name: string;
  /**
   * Take the focus when shown: the button that produced it is gone, and
   * the selected password is what the admin needs next.
   */
  autoFocus?: boolean;
  /** The password field, for a caller that moves the focus itself. */
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const { t } = useT();
  const id = useId();
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? ownInputRef;
  const [copy, setCopy] = useState<CopyState>('idle');

  // "Copied" fades back to the button after a moment.
  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = window.setTimeout(() => setCopy('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopy('copied');
    } catch {
      setCopy('failed');
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20',
        className,
      )}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {t('usersDesk.tempPassword.label')}
      </label>
      <div className="flex items-stretch">
        <input
          id={id}
          ref={inputRef}
          readOnly
          value={password}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-l-lg border border-r-0 border-input bg-background px-3 font-mono text-base tracking-wider outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyPassword()}
          className="h-11 shrink-0 rounded-l-none px-3"
          aria-describedby={`${id}-status`}
        >
          {copy === 'copied' ? (
            <Check className="text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copy === 'copied' ? t('usersDesk.tempPassword.copied') : t('usersDesk.tempPassword.copy')}
        </Button>
      </div>
      <p id={`${id}-status`} aria-live="polite" className="text-sm">
        {copy === 'copied' ? (
          <span className="sr-only">{t('usersDesk.tempPassword.copiedAnnounce')}</span>
        ) : copy === 'failed' ? (
          <span className="text-destructive">{t('usersDesk.tempPassword.copyFailed')}</span>
        ) : null}
      </p>
      <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium">{t('usersDesk.tempPassword.onceTitle')}.</span>{' '}
          {t('usersDesk.tempPassword.onceNote', { name })}
        </p>
      </div>
    </div>
  );
}
