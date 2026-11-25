'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogOut, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/providers';
import { useT } from '@/lib/i18n/lang-context';
import type { ReactNode } from 'react';

export type OnboardingStepKey = 'verify' | 'profile' | 'clinic' | 'approval';

// Labels are resolved at render time via `t` (keyed on the step's i18n
// key); module scope can't call the translator hook.
const STEPS: Array<{ key: OnboardingStepKey; labelKey: string }> = [
  { key: 'verify', labelKey: 'onboardingPages.shell.stepVerify' },
  { key: 'profile', labelKey: 'onboardingPages.shell.stepProfile' },
  { key: 'clinic', labelKey: 'onboardingPages.shell.stepClinic' },
  { key: 'approval', labelKey: 'onboardingPages.shell.stepApproval' },
];

/**
 * Visual shell for the onboarding routes — fully outside the dashboard
 * sidebar layout. Logo top-left, step indicator, centered content card,
 * sign-out top-right.
 */
export function OnboardingShell({
  current,
  title,
  description,
  children,
  hideStepper,
  narrow,
  icon,
}: {
  /** The dentist step to light; omit it with `hideStepper`. */
  current?: OnboardingStepKey;
  title: string;
  description?: string;
  children: ReactNode;
  /** Skip the stepper UI (e.g. on the pending-approval screen). */
  hideStepper?: boolean;
  /** A short form (the password step): a phone-width card. */
  narrow?: boolean;
  /** A mark above the title, for a step outside the dentist stepper. */
  icon?: ReactNode;
}) {
  const router = useRouter();
  const { t } = useT();
  const { logout, user } = useAuth();

  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Header — logo on the left, sign-out on the right */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          // 48 px for a finger (the logo alone is 28 px tall); a mouse keeps
          // the logo-sized box.
          className="flex min-h-12 min-w-12 items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md pointer-fine:sm:min-h-0 pointer-fine:sm:min-w-0"
          aria-label={t('onboardingPages.shell.homeAria')}
        >
          <Image
            src="/mainlogo.svg"
            alt={t('onboardingPages.shell.logoAlt')}
            width={120}
            height={36}
            priority
            className="h-7 w-auto sm:h-8"
          />
        </button>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
          )}
          {/* Icon-only on a phone: the label names it there, and the
              target keeps 48 px (the only way out of this flow) on any
              touch screen; only a mouse gets the compact size. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            aria-label={t('onboardingPages.shell.signOut')}
            className="h-12 min-w-12 gap-2 pointer-fine:sm:h-8 pointer-fine:sm:min-w-0"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('onboardingPages.shell.signOut')}</span>
          </Button>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full px-4 py-8 sm:px-6 sm:py-12',
          narrow ? 'max-w-lg' : 'max-w-3xl',
        )}
      >
        {!hideStepper && (
          <ol
            className="mb-8 grid grid-cols-4 gap-2 sm:gap-3"
            aria-label={t('onboardingPages.shell.stepsAria')}
          >
            {STEPS.map((step, idx) => {
              const isDone = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <li key={step.key} className="flex flex-col items-center gap-2 text-center">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                      isDone &&
                        'border-primary bg-primary text-primary-foreground',
                      isCurrent &&
                        'border-primary bg-primary/10 text-primary',
                      !isDone && !isCurrent &&
                        'border-muted-foreground/30 bg-background text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-tight sm:text-xs',
                      isCurrent
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {t(step.labelKey)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <header className="mb-6">
            {icon && (
              <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                {icon}
              </div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {description}
              </p>
            )}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
