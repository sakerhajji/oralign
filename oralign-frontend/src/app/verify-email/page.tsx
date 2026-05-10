import { Suspense } from 'react';
import { VerifyEmailCard } from '@/components/auth/verify-email-card';
import { Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyEmailCard />
    </Suspense>
  );
}
