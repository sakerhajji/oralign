'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogOut, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/providers';
import type { ReactNode } from 'react';

export type OnboardingStepKey = 'verify' | 'profile' | 'clinic' | 'approval';

const STEPS: Array<{ key: OnboardingStepKey; label: string }> = [
  { key: 'verify', label: 'Verify email' },
  { key: 'profile', label: 'Profile' },
  { key: 'clinic', label: 'Clinic' },
  { key: 'approval', label: 'Approval' },
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
}: {
  current: OnboardingStepKey;
  title: string;
  description?: string;
  children: ReactNode;
  /** Skip the stepper UI (e.g. on the pending-approval screen). */
  hideStepper?: boolean;
}) {
  const router = useRouter();
  const { logout, user } = useAuth();

  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Header — logo on the left, sign-out on the right */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
          aria-label="Oralign home"
        >
          <Image
            src="/ORALIGN BLACK.png"
            alt="Oralign"
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {!hideStepper && (
          <ol
            className="mb-8 grid grid-cols-4 gap-2 sm:gap-3"
            aria-label="Onboarding steps"
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
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <header className="mb-6">
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
