'use client';

import { useCallback } from 'react';
import { formatRate } from '@/components/payments/withholding';
import {
  billingRuleKind,
  isBillingRuleField,
  readRuleValue,
  type BillingRuleField,
} from '@/lib/billing/billing-settings-rules';
import { useT } from '@/lib/i18n/lang-context';
import { formatPrice } from '@/lib/utils/currency';

/**
 * How a fiscal / rollout setting reads, in the history and in the save
 * confirmation: "Activée", "1 %", "1 000,000 TND", "6 mois". One place, so
 * the two lists never word a value differently.
 */
export function useBillingRuleFormat(currency: string) {
  const { t, lang } = useT();

  const fieldLabel = useCallback(
    (field: string): string =>
      isBillingRuleField(field) ? t(`withholdingRules.history.fields.${field}`) : field,
    [t],
  );

  const valueLabel = useCallback(
    (field: BillingRuleField | string, raw: unknown): string => {
      const value = readRuleValue(raw);
      if (value === null) return '—';
      if (!isBillingRuleField(field)) return String(value);
      switch (billingRuleKind(field)) {
        case 'switch':
          return t(value === true ? 'withholdingRules.history.on' : 'withholdingRules.history.off');
        case 'percent':
          return `${formatRate(Number(value), lang)} %`;
        case 'amount':
          return formatPrice(Number(value), currency);
        case 'months':
          return Number(value) === 1
            ? t('withholdingRules.history.oneMonth')
            : t('withholdingRules.history.months', { count: Number(value) });
      }
    },
    [currency, lang, t],
  );

  return { fieldLabel, valueLabel };
}
