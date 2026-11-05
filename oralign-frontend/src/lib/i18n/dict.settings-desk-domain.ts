import type { Lang } from './dict';

type T = Record<Lang, string>;

/**
 * Account settings: billing settings form (Oralign gift card, loading states), account tabs, country/city picker —
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
      invalidNextNumber: {
        en: 'Enter a whole number of 1 or more.',
        fr: 'Saisissez un nombre entier supérieur ou égal à 1.',
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
