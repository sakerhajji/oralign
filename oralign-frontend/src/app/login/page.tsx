'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';
import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@/lib/i18n/lang-context';

// LoginForm itself uses no searchParams, but wrap in Suspense for
// any future hook additions and to satisfy Next.js prerender requirements.
function LoginContent() {
  const { t } = useT();
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <Image
              src="/ORALIGN BLACK.png"
              alt={t('authPages.common.logoAlt')}
              width={100}
              height={100}
              className="object-contain"
            />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src="/loginPicture.webp"
          alt={t('authPages.common.clinicImageAlt')}
          fill
          sizes="50vw"
          unoptimized
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
