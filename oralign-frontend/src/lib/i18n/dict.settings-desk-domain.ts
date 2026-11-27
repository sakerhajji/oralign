import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Account settings: billing settings form (Oralign gift card, inactivity rule card, loading states), account tabs, country/city picker —
 * spread into dict (`...settingsDeskDomainDict`) by the main dictionary.
 * Same leaf shape as dict.ts: every leaf is `{ en, fr } as T`.
 */
export const settingsDeskDomainDict = {
  settingsDesk: {
    // account-nav-tabs.tsx — the <nav> holding the Profile / Clinic / Billing links
    tabs: {
      ariaLabel: { en: 'Account sections', fr: 'Sections du compte' } as T,
    },

    // ui/country-city-picker.tsx + ui/searchable-combobox.tsx
    picker: {
      country: { en: 'Country', fr: 'Pays' } as T,
      city: { en: 'City', fr: 'Ville' } as T,
      loading: { en: 'Loading the list…', fr: 'Chargement de la liste…' } as T,
      loadFailed: {
        en: 'The list could not be loaded. Close and reopen to try again.',
        fr: 'Impossible de charger la liste. Fermez puis rouvrez pour réessayer.',
      } as T,
      citiesHint: {
        en: '{count} cities — narrow with search',
        fr: '{count} villes — affinez avec la recherche',
      } as T,
    },

    // company-billing-settings-form.tsx — loading, errors, number drafts, save bar
    billing: {
      loadFailedTitle: {
        en: 'The billing settings could not be loaded',
        fr: 'Impossible de charger les paramètres de facturation',
      } as T,
      loadFailedBody: {
        en: 'Check your connection, then try again.',
        fr: 'Vérifiez votre connexion, puis réessayez.',
      } as T,
      retry: { en: 'Try again', fr: 'Réessayer' } as T,
      invalidAmount: {
        en: 'Enter an amount of 0 or more (up to 3 decimals).',
        fr: 'Saisissez un montant supérieur ou égal à 0 (3 décimales au plus).',
      } as T,
      invalidRate: {
        en: 'Enter a rate between 0 and 100.',
        fr: 'Saisissez un taux compris entre 0 et 100.',
      } as T,
      invalidWithholdingRate: {
        en: 'Enter a rate between 0 and 99.99 (up to 2 decimals).',
        fr: 'Saisissez un taux compris entre 0 et 99,99 (2 décimales au plus).',
      } as T,
      invalidNextNumber: {
        en: 'Enter a whole number of 1 or more.',
        fr: 'Saisissez un nombre entier supérieur ou égal à 1.',
      } as T,
      invalidMonths: {
        en: 'Enter a whole number of months from 1 to 24.',
        fr: 'Saisissez un nombre entier de mois entre 1 et 24.',
      } as T,
      fixErrors: {
        en: 'Fix the highlighted fields to save.',
        fr: 'Corrigez les champs signalés pour enregistrer.',
      } as T,
      unsavedChanges: {
        en: 'Unsaved changes',
        fr: 'Modifications non enregistrées',
      } as T,
    },

    // inactivity-rule-card.tsx — the doctor inactivity rule (spec §5), saved with the form
    inactivity: {
      title: { en: 'Practitioner inactivity', fr: 'Inactivité des praticiens' } as T,
      statusOn: { en: 'On', fr: 'Activée' } as T,
      statusOff: { en: 'Off', fr: 'Désactivée' } as T,
      description: {
        en: 'A practitioner who submits no order during the chosen period is deactivated automatically, after two warnings by e-mail and in the app (30 days, then 7 days before).',
        fr: 'Un praticien qui ne soumet aucune commande pendant la période choisie est désactivé automatiquement, après deux avertissements par e-mail et dans l’application (30 jours puis 7 jours avant).',
      } as T,
      effects: {
        en: 'Once deactivated, they keep access to their account, payments and ongoing treatments, but can no longer create or submit orders and no longer appear in the public directory. Nothing is deleted, and an admin can reactivate them at any time.',
        fr: 'Désactivé, il garde l’accès à son compte, à ses paiements et à ses traitements en cours, mais ne peut plus créer ni soumettre de commande et n’apparaît plus dans l’annuaire public. Rien n’est supprimé, et un administrateur peut le réactiver à tout moment.',
      } as T,
      switchLabel: {
        en: 'Apply the inactivity rule',
        fr: 'Appliquer la règle d’inactivité',
      } as T,
      monthsLabel: {
        en: 'Period without an order (months)',
        fr: 'Période sans commande (mois)',
      } as T,
      monthsHelp: {
        en: 'Calendar months since the last submitted order (or the account approval). 1 to 24.',
        fr: 'Mois calendaires depuis la dernière commande soumise (ou l’approbation du compte). De 1 à 24.',
      } as T,
      firstRunNote: {
        en: 'When you turn it on, nobody is deactivated straight away: practitioners already past the period get the 30-day warning first.',
        fr: 'À l’activation, personne n’est désactivé d’emblée : les praticiens déjà au-delà de la période reçoivent d’abord l’avertissement à 30 jours.',
      } as T,
    },

    // welcome-gift-settings-card.tsx — the instant on/off at the top of the billing form
    gift: {
      title: { en: 'Oralign gift', fr: 'Cadeau Oralign' } as T,
      statusOn: { en: 'On', fr: 'Activé' } as T,
      statusOff: { en: 'Off', fr: 'Désactivé' } as T,
      description: {
        en: 'One practitioner, one gift: the treatment fee and the CBCT supplement of their next submitted case are offered.',
        fr: 'Un praticien, un cadeau : les honoraires de traitement et le supplément CBCT de son prochain cas soumis sont offerts.',
      } as T,
      offNote: {
        en: 'Turning it off stops new gifts. Gifts already applied to a case are kept.',
        fr: 'Désactiver arrête les nouveaux cadeaux. Les cadeaux déjà appliqués à un cas sont conservés.',
      } as T,
      switchLabel: { en: 'Offer the Oralign gift', fr: 'Offrir le cadeau Oralign' } as T,
      // Under the switch: it saves on its own, unlike the form below.
      instantHint: { en: 'Saves instantly', fr: 'Enregistré immédiatement' } as T,
      manageDoctors: {
        en: 'To change it for one practitioner: Users → practitioner profile → Oralign gift.',
        fr: 'Pour un praticien précis : Utilisateurs → fiche praticien → Cadeau Oralign.',
      } as T,
      openUsers: { en: 'Open Users', fr: 'Ouvrir Utilisateurs' } as T,
      needsSettings: {
        en: 'Save the company information below once to enable this switch.',
        fr: 'Enregistrez une première fois les informations de la société ci-dessous pour activer cet interrupteur.',
      } as T,
      saving: { en: 'Saving…', fr: 'Enregistrement…' } as T,
      savedOn: { en: 'Oralign gift turned on', fr: 'Cadeau Oralign activé' } as T,
      savedOff: { en: 'Oralign gift turned off', fr: 'Cadeau Oralign désactivé' } as T,
    },
  },
};
