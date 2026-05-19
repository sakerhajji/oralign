import type { ReactNode } from 'react';

/**
 * Onboarding routes have their own layout — explicitly NO sidebar, NO
 * dashboard chrome. Children render full-bleed against the onboarding shell.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
