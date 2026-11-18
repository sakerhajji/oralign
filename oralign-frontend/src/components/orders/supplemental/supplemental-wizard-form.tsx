'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Save, Send, X } from 'lucide-react';
import {
  WizardFooter,
  WizardPanel,
  WizardStepHeader,
  WizardStepper,
} from '@/components/orders/wizard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useOrder, useOrderFiles } from '@/lib/hooks/use-orders';
import { useSubmitSupplementalOrder } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import type {
  OrderFile,
  SupplementalEligibility,
  SupplementalKind,
  SupplementalOrderView,
} from '@/lib/types';
import { businessDayOf, businessToday } from '@/lib/utils/business-day';
import { focusFirstInvalidQuestion } from './clinical-question';
import { SaveStatusLine } from './save-status';
import type { StepContext } from './steps/step-props';
import { normaliseDraft } from './supplemental-draft';
import { KIND_STEPS, stepCopyKey } from './supplemental-steps';
import {
  firstInvalidStep,
  hasErrors,
  validateStep,
  type FieldErrors,
  type StepKey,
  type ValidationContext,
} from './supplemental-validation';
import { useSupplementalDraft } from './use-supplemental-draft';
import { WizardContextBar } from './wizard-context-bar';

const NO_ERRORS: FieldErrors = {};
const NO_FILES: OrderFile[] = [];
const WIZARD_TOP_ID = 'supplemental-wizard-top';
const CONFIRM_ID = 'supplemental-confirm';

/** Runs after React has committed the state set in the same handler. */
function afterRender(callback: () => void): void {
  window.requestAnimationFrame(callback);
}

/**
 * The supplemental request wizard, laid out like the initial order wizard:
 * stepper, context bar, step header, panel, confirmation, footer.
 * Mounted once per request (keyed by its id) with a loaded draft view.
 */
export function SupplementalWizardForm({
  view,
  kind,
  eligibility,
}: {
  view: SupplementalOrderView;
  kind: SupplementalKind;
  eligibility: SupplementalEligibility;
}) {
  const { t } = useT();
  const router = useRouter();
  const steps = KIND_STEPS[kind];
  const stepKeys = steps.map((step) => step.key);
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState<ReadonlySet<StepKey>>(() => new Set());
  const [confirmed, setConfirmed] = useState(false);
  // Covers the save flush AND the submit call, so a second click while
  // the last save still runs cannot send the request twice.
  const [submitting, setSubmitting] = useState(false);
  const [today] = useState(businessToday);
  const { draft, set, setTeeth, setContact, flush, dirty, status, savedAt, saveError } =
    useSupplementalDraft(view, kind);
  const files = useOrderFiles(view.order.id).data ?? NO_FILES;
  const parentOrder = useOrder(view.parentOrder.id).data;
  const submit = useSubmitSupplementalOrder();

  const caseOpenedOn = parentOrder ? businessDayOf(new Date(parentOrder.createdAt)) : null;
  const validation: ValidationContext = {
    // Approved plan, else the pack the case was sold with, else the case total.
    planTotals: {
      upper: eligibility.alignerLimits.upper,
      lower: eligibility.alignerLimits.lower,
    },
    deliveredUpTo: eligibility.deliveredUpTo,
    today,
    caseOpenedOn,
    files,
  };
  const context: StepContext = { kind, view, eligibility, files, today, caseOpenedOn };
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  // Rules read what would be sent (hidden answers, teeth of an untreated
  // arch… left out), not the editing state.
  const answers = normaliseDraft(draft, kind);
  // Messages appear once a step was attempted, then follow the answers live.
  const errors = attempted.has(step.key) ? validateStep(step.key, answers, validation) : NO_ERRORS;

  const goTo = (index: number) => {
    setStepIndex(index);
    void flush();
    afterRender(() =>
      document.getElementById(WIZARD_TOP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const showErrors = (index: number, stepErrors: FieldErrors, keys: readonly StepKey[]) => {
    setAttempted((current) => new Set([...current, ...keys]));
    setStepIndex(index);
    afterRender(() => focusFirstInvalidQuestion(Object.keys(stepErrors)));
  };

  const handleContinue = () => {
    const stepErrors = validateStep(step.key, answers, validation);
    if (hasErrors(stepErrors)) {
      showErrors(stepIndex, stepErrors, [step.key]);
      return;
    }
    goTo(stepIndex + 1);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const invalid = firstInvalidStep(stepKeys, answers, validation);
    if (invalid) {
      showErrors(invalid.index, invalid.errors, stepKeys);
      return;
    }
    setSubmitting(true);
    if (!(await flush())) {
      setSubmitting(false);
      return;
    }
    submit.mutate(
      {
        requestId: view.order.id,
        parentOrderId: view.parentOrder.id,
        patientId: view.order.patientId,
      },
      {
        // Stays locked on success: the page is being left.
        onSuccess: () => router.push(`/dashboard/orders/${view.order.id}`),
        onError: () => setSubmitting(false),
      },
    );
  };

  return (
    <div id={WIZARD_TOP_ID} className="mx-auto w-full max-w-[1220px] scroll-mt-24 space-y-7">
      <WizardStepper
        steps={steps.map(({ key }) => ({ key, title: t(stepCopyKey(key, 'title')) }))}
        currentStep={stepIndex}
        onStepChange={goTo}
        ariaLabel={t('supplemental.wizard.stepsAria')}
        stepLabel={t('orderForm.step')}
        ofLabel={t('orderForm.of')}
      />

      <WizardContextBar kind={kind} view={view} eligibility={eligibility} onLeave={() => void flush()} />

      <WizardStepHeader
        icon={step.icon}
        title={t(stepCopyKey(step.key, 'heading'))}
        description={t(stepCopyKey(step.key, 'description'))}
      />

      <WizardPanel>
        <step.Component
          draft={draft}
          set={set}
          setTeeth={setTeeth}
          setContact={setContact}
          errors={errors}
          context={context}
        />
      </WizardPanel>

      {isLast && view.permissions.canSubmit && (
        <label
          htmlFor={CONFIRM_ID}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm shadow-sm"
        >
          <Checkbox
            id={CONFIRM_ID}
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            {t('supplemental.wizard.confirm')}
            <span aria-hidden className="ml-0.5 text-red-600">*</span>
          </span>
        </label>
      )}

      <SaveStatusLine
        status={status}
        dirty={dirty}
        savedAt={savedAt}
        error={saveError}
        onRetry={() => void flush()}
      />

      <WizardFooter>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={stepIndex === 0}
            onClick={() => goTo(stepIndex - 1)}
          >
            <ChevronLeft className="mr-2 h-4 w-4" aria-hidden />
            {t('common.back')}
          </Button>
          {/* Leaving keeps the draft: useSupplementalDraft saves on unmount. */}
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            disabled={submitting}
            onClick={() => router.push(`/dashboard/orders/${view.parentOrder.id}`)}
          >
            <X className="mr-2 h-4 w-4" aria-hidden />
            {t('common.cancel')}
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={status === 'saving'}
            onClick={() => void flush()}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden />
            {t('supplemental.actions.saveDraft')}
          </Button>
          {isLast ? (
            view.permissions.canSubmit && (
              <Button
                type="button"
                className="h-11"
                disabled={!confirmed || submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                {t('supplemental.actions.submit')}
              </Button>
            )
          ) : (
            <Button type="button" className="h-11" onClick={handleContinue}>
              {t('common.continue')}
              <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </WizardFooter>
    </div>
  );
}
