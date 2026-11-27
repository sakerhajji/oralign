import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Retenue à la source rules (spec §4): the settings switch and threshold,
 * the eligibility hints of WithholdingChoice (below the threshold), the
 * WITHHOLDING_DISABLED / WITHHOLDING_BELOW_THRESHOLD copy, and the journal
 * of the fiscal and rollout settings with its confirmation dialog.
 * Owned by P-D1 (withholding-settings-rules). The existing widget strings
 * stay in `withholdingUi` (dict.payments-desk-domain.ts).
 *
 * A unique top-level namespace (`withholdingRules`), spread into dict
 * (`...withholdingDomainDict`) by the main dictionary, which shallow-spreads
 * its domains, so no other file may use this key. Same leaf shape as
 * dict.ts: every leaf is `{ en, fr } as T`.
 */
export const withholdingDomainDict = {
  withholdingRules: {
    // components/billing/withholding-settings-card.tsx
    settings: {
      title: { en: 'Withholding tax', fr: 'Retenue à la source' } as T,
      statusOn: { en: 'On', fr: 'Activée' } as T,
      statusOff: { en: 'Off', fr: 'Désactivée' } as T,
      description: {
        en: 'The practitioner may keep a percentage of what they pay and pass it on to the tax office themselves. The invoice shows the amount withheld and the net paid.',
        fr: 'Le praticien peut retenir un pourcentage du montant qu’il paie et le reverser lui-même aux impôts. La facture indique la retenue et le net payé.',
      } as T,
      accountantTitle: {
        en: 'To be confirmed by your accountant',
        fr: 'À faire valider par l’expert-comptable',
      } as T,
      accountantBody: {
        en: 'Your accountant must confirm the rate, the threshold and how the rule applies before you turn the withholding tax on. While it is off, no practitioner can apply it.',
        fr: 'Le taux, le seuil et la règle d’application doivent être confirmés par votre expert-comptable avant d’activer la retenue. Tant qu’elle est désactivée, aucun praticien ne peut l’appliquer.',
      } as T,
      switchLabel: {
        en: 'Offer the withholding tax to practitioners',
        fr: 'Proposer la retenue aux praticiens',
      } as T,
      switchHelp: {
        en: 'When on, the practitioner chooses at each payment whether to apply it, from the threshold below.',
        fr: 'Activée, le praticien choisit à chaque paiement s’il l’applique, à partir du seuil ci-dessous.',
      } as T,
      rateLabel: { en: 'Rate (%)', fr: 'Taux (%)' } as T,
      rateHelp: {
        en: 'Taken on the payment’s amount incl. tax, stamp duty excluded. Up to 2 decimals.',
        fr: 'Calculée sur le montant TTC du paiement, hors droit de timbre. 2 décimales au plus.',
      } as T,
      thresholdLabel: {
        en: 'Threshold ({currency})',
        fr: 'Seuil d’application ({currency})',
      } as T,
      thresholdHelp: {
        en: 'Smallest payment (an installment or the treatment fee, incl. tax, stamp duty excluded) the withholding tax is offered on. Below it, the payment is made in full. 0 = every payment.',
        fr: 'Montant minimum d’un paiement (une échéance ou les honoraires, TTC hors timbre) pour proposer la retenue. En dessous, le paiement est réglé en entier. 0 = tous les paiements.',
      } as T,
      rateRequired: {
        en: 'Enter a rate above 0 to turn the withholding tax on.',
        fr: 'Saisissez un taux supérieur à 0 pour activer la retenue.',
      } as T,
      exampleTitle: { en: 'Example', fr: 'Exemple' } as T,
      exampleEligible: {
        en: 'A payment of {amount}: {withheld} withheld, {cash} to pay ({stamp} stamp duty included).',
        fr: 'Un paiement de {amount} : retenue {withheld}, à payer {cash} (timbre {stamp} compris).',
      } as T,
      exampleEligibleNoStamp: {
        en: 'A payment of {amount}: {withheld} withheld, {cash} to pay.',
        fr: 'Un paiement de {amount} : retenue {withheld}, à payer {cash}.',
      } as T,
      exampleOff: {
        en: 'Off: every payment is made in full.',
        fr: 'Désactivée : chaque paiement est réglé en entier.',
      } as T,
      lastChange: {
        en: 'Last changed {date} by {actor}',
        fr: 'Dernière modification le {date} par {actor}',
      } as T,
    },

    // components/payments/withholding.tsx — WithholdingChoice, when the
    // retenue is on but the payment does not reach the threshold.
    hint: {
      belowThreshold: {
        en: 'Withholding tax not offered: this payment is below the {threshold} threshold (incl. tax, stamp duty excluded).',
        fr: 'Retenue à la source non proposée : ce paiement est inférieur au seuil de {threshold} (TTC, hors timbre).',
      } as T,
      belowThresholdEach: {
        en: 'Withholding tax not offered: each installment must reach {threshold} (incl. tax, stamp duty excluded). Pay them one at a time to apply it to those that do.',
        fr: 'Retenue à la source non proposée : chaque échéance doit atteindre {threshold} (TTC, hors timbre). Payez-les une par une pour l’appliquer à celles qui l’atteignent.',
      } as T,
    },

    // withholdingErrorCopy() — 400 WITHHOLDING_DISABLED / _BELOW_THRESHOLD.
    errors: {
      disabled: {
        en: 'The withholding tax is turned off: the amount due must be paid in full.',
        fr: 'La retenue à la source n’est pas activée : le montant dû doit être payé en entier.',
      } as T,
      belowThreshold: {
        en: 'The withholding tax only applies to payments of at least {threshold}: this amount must be paid in full.',
        fr: 'La retenue à la source ne s’applique qu’aux paiements d’au moins {threshold} : ce montant doit être payé en entier.',
      } as T,
      belowThresholdNoAmount: {
        en: 'This payment is below the withholding tax threshold: it must be paid in full.',
        fr: 'Ce paiement est inférieur au seuil de la retenue à la source : il doit être payé en entier.',
      } as T,
    },

    // components/billing/billing-settings-history.tsx
    history: {
      title: {
        en: 'History of tax and rule settings',
        fr: 'Historique des règles fiscales',
      } as T,
      description: {
        en: 'Every change to the withholding tax, stamp duty, VAT and inactivity rule, with who made it.',
        fr: 'Chaque modification de la retenue, du droit de timbre, de la TVA et de la règle d’inactivité, avec son auteur.',
      } as T,
      empty: {
        en: 'No change recorded yet.',
        fr: 'Aucune modification enregistrée pour l’instant.',
      } as T,
      loadFailed: {
        en: 'The history could not be loaded.',
        fr: 'Impossible de charger l’historique.',
      } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
      by: { en: 'by {actor}', fr: 'par {actor}' } as T,
      system: { en: 'System', fr: 'Système' } as T,
      initial: { en: 'Initial value', fr: 'Valeur initiale' } as T,
      newer: { en: 'Newer', fr: 'Plus récents' } as T,
      older: { en: 'Older', fr: 'Plus anciens' } as T,
      pageOf: { en: 'Page {page} of {pages}', fr: 'Page {page} sur {pages}' } as T,
      on: { en: 'On', fr: 'Activée' } as T,
      off: { en: 'Off', fr: 'Désactivée' } as T,
      months: { en: '{count} months', fr: '{count} mois' } as T,
      oneMonth: { en: '1 month', fr: '1 mois' } as T,
      fields: {
        withholdingEnabled: { en: 'Withholding tax', fr: 'Retenue à la source' } as T,
        withholdingRate: { en: 'Withholding tax rate', fr: 'Taux de retenue' } as T,
        withholdingThreshold: {
          en: 'Withholding tax threshold',
          fr: 'Seuil de la retenue',
        } as T,
        stampDuty: { en: 'Stamp duty', fr: 'Droit de timbre' } as T,
        defaultTvaRate: { en: 'VAT rate', fr: 'Taux de TVA' } as T,
        inactivityRuleEnabled: { en: 'Inactivity rule', fr: 'Règle d’inactivité' } as T,
        inactivityMonths: { en: 'Inactivity period', fr: 'Délai d’inactivité' } as T,
      },
    },

    // components/billing/billing-rules-confirm-dialog.tsx
    confirm: {
      title: {
        en: 'Confirm the rule changes',
        fr: 'Confirmer le changement des règles',
      } as T,
      description: {
        en: 'These settings apply to the next payments and orders. Payments, quotes and invoices already issued keep their values. Each change is recorded in the history.',
        fr: 'Ces réglages s’appliquent aux prochains paiements et commandes. Les paiements, devis et factures déjà émis gardent leurs valeurs. Chaque changement est inscrit dans l’historique.',
      } as T,
      changesLabel: { en: 'Changes', fr: 'Changements' } as T,
      withholdingOn: {
        en: 'You are turning the withholding tax on. Check that your accountant has confirmed the rate and the threshold.',
        fr: 'Vous activez la retenue à la source. Vérifiez que votre expert-comptable a validé le taux et le seuil.',
      } as T,
      inactivityOn: {
        en: 'You are turning the inactivity rule on. The practitioners concerned are warned first: no account is deactivated before 30 days.',
        fr: 'Vous activez la règle d’inactivité. Les praticiens concernés sont d’abord avertis : aucun compte n’est désactivé avant 30 jours.',
      } as T,
      cancel: { en: 'Cancel', fr: 'Annuler' } as T,
      submit: { en: 'Save the changes', fr: 'Enregistrer les changements' } as T,
    },
  },
};
