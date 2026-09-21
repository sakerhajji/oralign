'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { paymentsService } from '@/lib/api/payments.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentRecordStatus, type HostedPaymentSession } from '@/lib/types';

export function ClicToPayResult() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const { lang } = useT();
  const fr = lang !== 'en';
  const [session, setSession] = useState<HostedPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const automaticChecks = useRef(0);

  const verify = useCallback(async () => {
    if (!paymentId) {
      setError(fr ? 'Référence de paiement manquante.' : 'Missing payment reference.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await paymentsService.verifyClicToPayPayment(paymentId);
      setSession(result);
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [fr, paymentId]);

  useEffect(() => {
    void verify();
  }, [verify]);

  useEffect(() => {
    if (
      !session ||
      (session.status !== PaymentRecordStatus.PENDING &&
        session.status !== PaymentRecordStatus.UNKNOWN) ||
      automaticChecks.current >= 4
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      automaticChecks.current += 1;
      void verify();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [session, verify]);

  const presentation = getPresentation(session?.status, fr);
  const Icon = presentation.icon;

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-4 py-10">
      <section
        aria-live="polite"
        className="w-full max-w-xl rounded-lg border bg-background p-6 shadow-sm sm:p-8"
      >
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span>Oralign · ClicToPay</span>
        </div>

        {loading && !session ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-5 text-xl font-semibold">
              {fr ? 'Vérification du paiement' : 'Verifying payment'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {fr
                ? 'Nous vérifions directement le statut auprès de ClicToPay.'
                : 'We are checking the status directly with ClicToPay.'}
            </p>
          </div>
        ) : error ? (
          <ResultBody
            icon={AlertCircle}
            tone="danger"
            title={fr ? 'Vérification impossible' : 'Unable to verify payment'}
            description={error}
          />
        ) : (
          <ResultBody
            icon={Icon}
            tone={presentation.tone}
            title={presentation.title}
            description={presentation.description}
          />
        )}

        {session ? (
          <dl className="mt-6 grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {fr ? 'Montant' : 'Amount'}
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {session.amount} {session.currency}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {fr ? 'Référence' : 'Reference'}
              </dt>
              <dd className="mt-1 truncate font-mono text-xs" title={session.paymentId}>
                {session.paymentId}
              </dd>
            </div>
          </dl>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {session?.orderId ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/orders/${session.orderId}`}>
                {fr ? 'Voir la commande' : 'View order'}
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/dashboard">{fr ? 'Tableau de bord' : 'Dashboard'}</Link>
            </Button>
          )}
          {(error ||
            session?.status === PaymentRecordStatus.PENDING ||
            session?.status === PaymentRecordStatus.UNKNOWN) && (
            <Button onClick={() => void verify()} disabled={loading} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {fr ? 'Vérifier à nouveau' : 'Check again'}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function ResultBody({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: typeof CheckCircle2;
  tone: 'success' | 'pending' | 'danger';
  title: string;
  description: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'danger'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700';
  return (
    <div className="py-5 text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${toneClass}`}>
        <Icon className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function getPresentation(status: PaymentRecordStatus | undefined, fr: boolean) {
  switch (status) {
    case PaymentRecordStatus.SUCCESS:
      return {
        icon: CheckCircle2,
        tone: 'success' as const,
        title: fr ? 'Paiement confirmé' : 'Payment confirmed',
        description: fr
          ? 'Le paiement a été vérifié et enregistré avec succès.'
          : 'The payment was verified and recorded successfully.',
      };
    case PaymentRecordStatus.FAILED:
    case PaymentRecordStatus.REJECTED:
    case PaymentRecordStatus.CANCELLED:
      return {
        icon: AlertCircle,
        tone: 'danger' as const,
        title: fr ? 'Paiement non abouti' : 'Payment not completed',
        description: fr
          ? 'Aucun paiement confirmé n’a été enregistré. Vous pouvez réessayer depuis la commande.'
          : 'No confirmed payment was recorded. You can try again from the order.',
      };
    default:
      return {
        icon: Clock3,
        tone: 'pending' as const,
        title: fr ? 'Paiement en cours de vérification' : 'Payment verification pending',
        description: fr
          ? 'Le statut n’est pas encore définitif. Aucun succès ne sera enregistré avant confirmation de ClicToPay.'
          : 'The status is not final yet. No success will be recorded until ClicToPay confirms it.',
      };
  }
}
