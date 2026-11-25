'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import { UserRole } from '@/lib/types';
import { TECHNICIAN_HOME } from '@/lib/hooks/use-onboarding';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { DoctorDashboard } from '@/components/dashboard/doctor-dashboard';

/**
 * Dashboard landing — role-aware dispatcher.
 *
 * Admin / super_admin → platform-wide KPIs + analytics blocks.
 * Dentist            → personal KPIs + slider + available packs.
 * Technician         → the production queue (she has no dashboard; the
 *                      dashboard guard sends her there too).
 * Designer / unknown → fallback panel; designers live in /orders
 *                      and don't have a dedicated dashboard yet.
 *
 * Page itself is a thin Suspense shell; the real components own
 * their data fetching + WS subscriptions.
 */
export default function DashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const { user, isAdmin, isTechnician } = useAuth();

  useEffect(() => {
    if (isTechnician) router.replace(TECHNICIAN_HOME);
  }, [isTechnician, router]);

  return (
    <div className="@container/main flex flex-1 flex-col">
      <Suspense
        fallback={
          <div className="p-6 text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        }
      >
        {!user || isTechnician ? (
          <div className="p-6 text-sm text-muted-foreground">
            {t('adminDashboard.pageLoading')}
          </div>
        ) : isAdmin ? (
          <AdminDashboard />
        ) : user.role === UserRole.DENTIST ? (
          <DoctorDashboard />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            {t('adminDashboard.noRoleView')}
          </div>
        )}
      </Suspense>
    </div>
  );
}
