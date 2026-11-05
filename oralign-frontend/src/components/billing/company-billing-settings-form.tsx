'use client';

import { memo, useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  Check,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CountryCityPicker, DEFAULT_COUNTRY } from '@/components/ui/country-city-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CompanyBillingSettingsSkeleton } from '@/components/billing/company-billing-settings-skeleton';
import { WelcomeGiftSettingsCard } from '@/components/billing/welcome-gift-settings-card';
import { companyBillingService } from '@/lib/api/company-billing.service';
import {
  useCompanyBilling,
  useDeleteCompanyLogo,
  useUploadCompanyLogo,
  useUpsertCompanyBilling,
} from '@/lib/hooks/use-company-billing';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  DevisLanguage,
  type BankDetails,
  type CompanyBillingSettings,
  type TranslatedTexts,
} from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

// ─── Draft model ─────────────────────────────────────────────────────────

/** Free-text inputs. Saved trimmed; '' clears the stored value. */
type TextKey =
  | 'companyName'
  | 'companyAddress'
  | 'companyCity'
  | 'companyCountry'
  | 'companyPhone'
  | 'companyEmail'
  | 'taxRegistrationNumber'
  | 'tradeName'
  | 'legalForm'
  | 'registreDeCommerce'
  | 'hostingProvider'
  | 'hostingProviderUrl'
  | 'websiteDomain'
  | 'defaultCurrency'
  | 'devisPrefix';

/** Non-negative amounts (3 decimals: TND millimes). */
type AmountKey =
  | 'defaultTreatmentFee'
  | 'stampDuty'
  | 'cbctSupplementFee'
  | 'refinementTwoArchesFee'
  | 'refinementSingleArchFee'
  | 'replacementAlignerFee'
  | 'retainersFee';

/**
 * Number inputs keep the string being typed — emptying one no longer
 * snaps it back to "0" / "1" — and are parsed and validated on save.
 */
type NumberKey = AmountKey | 'defaultTvaRate' | 'devisNextNumber';

type ToggleKey = 'cbctSupplementEnabled' | 'loyaltyEnabled';

type FormFields = Record<TextKey | NumberKey, string> & Record<ToggleKey, boolean>;

interface Draft {
  fields: FormFields;
  legal: Required<TranslatedTexts>;
  footer: Required<TranslatedTexts>;
  bank: Required<BankDetails>;
}

/**
 * What the admin changed, laid over the saved row. Never "seeded": data
 * arriving or changing (refetch, logo upload, the gift switch) updates the
 * untouched fields and leaves the typed ones alone.
 */
interface Edits {
  fields: Partial<FormFields>;
  legal: Partial<TranslatedTexts>;
  footer: Partial<TranslatedTexts>;
  bank: Partial<BankDetails>;
}

const NO_EDITS: Edits = { fields: {}, legal: {}, footer: {}, bank: {} };

const toTexts = (texts?: TranslatedTexts | null): Required<TranslatedTexts> => ({
  fr: texts?.fr ?? '',
  en: texts?.en ?? '',
  ar: texts?.ar ?? '',
});

function draftFromSettings(settings: CompanyBillingSettings | null): Draft {
  const s = settings;
  return {
    fields: {
      companyName: s?.companyName ?? '',
      companyAddress: s?.companyAddress ?? '',
      companyCity: s?.companyCity ?? '',
      // Preselected Tunisia is part of the draft, so what the picker shows
      // is exactly what Save stores (it used to show Tunisia and send '').
      // The country is mandatory (the picker has no clear button): a Save
      // can never store null that this default would then hide.
      companyCountry: s?.companyCountry || DEFAULT_COUNTRY.name,
      companyPhone: s?.companyPhone ?? '',
      companyEmail: s?.companyEmail ?? '',
      taxRegistrationNumber: s?.taxRegistrationNumber ?? '',
      tradeName: s?.tradeName ?? '',
      legalForm: s?.legalForm ?? '',
      registreDeCommerce: s?.registreDeCommerce ?? '',
      hostingProvider: s?.hostingProvider ?? '',
      hostingProviderUrl: s?.hostingProviderUrl ?? '',
      websiteDomain: s?.websiteDomain ?? '',
      defaultTvaRate: String(s?.defaultTvaRate ?? 19),
      defaultTreatmentFee: String(s?.defaultTreatmentFee ?? 0),
      // "Droit de timbre" — Tunisian fiscal stamp added to every invoice
      // total. Backend column defaults to 1.000 TND.
      stampDuty: String(s?.stampDuty ?? 1),
      // CBCT paid supplement — off by default; enabling it prices CBCT
      // requests on NEW orders only (existing orders keep their snapshot).
      cbctSupplementEnabled: s?.cbctSupplementEnabled ?? false,
      cbctSupplementFee: String(s?.cbctSupplementFee ?? 0),
      refinementTwoArchesFee: String(s?.refinementTwoArchesFee ?? 0),
      refinementSingleArchFee: String(s?.refinementSingleArchFee ?? 0),
      replacementAlignerFee: String(s?.replacementAlignerFee ?? 0),
      retainersFee: String(s?.retainersFee ?? 0),
      loyaltyEnabled: s?.loyaltyEnabled ?? true,
      defaultCurrency: s?.defaultCurrency ?? 'TND',
      devisPrefix: s?.devisPrefix ?? 'DEV',
      devisNextNumber: String(s?.devisNextNumber ?? 1),
    },
    legal: toTexts(s?.legalTextTranslations),
    footer: toTexts(s?.footerTextTranslations),
    bank: {
      bankName: s?.bankDetails?.bankName ?? '',
      accountName: s?.bankDetails?.accountName ?? '',
      rib: s?.bankDetails?.rib ?? '',
      iban: s?.bankDetails?.iban ?? '',
      swift: s?.bankDetails?.swift ?? '',
    },
  };
}

// ─── Number parsing (mirrors the backend DTO limits) ─────────────────────

const AMOUNT_RE = /^\d+(?:\.\d{1,3})?$/;
const MAX_AMOUNT = 999_999_999.999;

function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!AMOUNT_RE.test(text)) return null;
  const value = Number(text);
  return value <= MAX_AMOUNT ? value : null;
}

function parseRate(raw: string): number | null {
  const value = parseAmount(raw);
  return value !== null && value <= 100 ? value : null;
}

function parseNextNumber(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

const AMOUNT_KEYS: readonly AmountKey[] = [
  'defaultTreatmentFee',
  'stampDuty',
  'cbctSupplementFee',
  'refinementTwoArchesFee',
  'refinementSingleArchFee',
  'replacementAlignerFee',
  'retainersFee',
];

type NumberError = 'amount' | 'rate' | 'nextNumber';

const NUMBER_ERROR_KEYS: Record<NumberError, string> = {
  amount: 'settingsDesk.billing.invalidAmount',
  rate: 'settingsDesk.billing.invalidRate',
  nextNumber: 'settingsDesk.billing.invalidNextNumber',
};

function parseNumbers(fields: FormFields) {
  const values: Partial<Record<NumberKey, number>> = {};
  const errors: Partial<Record<NumberKey, NumberError>> = {};
  for (const key of AMOUNT_KEYS) {
    const value = parseAmount(fields[key]);
    if (value !== null) values[key] = value;
    // A disabled CBCT fee is not saved when invalid (see handleSave), so
    // it never blocks the save either.
    else if (key !== 'cbctSupplementFee' || fields.cbctSupplementEnabled) errors[key] = 'amount';
  }
  const rate = parseRate(fields.defaultTvaRate);
  if (rate !== null) values.defaultTvaRate = rate;
  else errors.defaultTvaRate = 'rate';
  const next = parseNextNumber(fields.devisNextNumber);
  if (next !== null) values.devisNextNumber = next;
  else errors.devisNextNumber = 'nextNumber';
  return { values, errors, valid: Object.keys(errors).length === 0 };
}

// ─── Page ────────────────────────────────────────────────────────────────

/**
 * Admin page for the company-billing-settings singleton.
 *
 * Sections:
 *   • Oralign gift (its own instant switch — WelcomeGiftSettingsCard)
 *   • Company info (name + address + contact + tax id + logo)
 *   • Legal identity, quote defaults, translations, bank details — saved
 *     together by the Save bar
 *
 * When no settings row exists yet the admin fills in companyName and saves
 * to create it.
 */
export function CompanyBillingSettingsForm() {
  const { t } = useT();
  const { user, isAdmin } = useAuth();
  const settingsQuery = useCompanyBilling(isAdmin);

  const header = (
    <header>
      <h1 className="text-xl font-semibold sm:text-2xl">{t('accountBillingSettings.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('accountBillingSettings.subtitle')}</p>
    </header>
  );

  // The session is read after the first client render (AuthProvider), so an
  // admin briefly has no user: wait for it instead of flashing "admins only".
  if (!user) return <CompanyBillingSettingsSkeleton header={header} />;

  if (!isAdmin) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            {t('accountBillingSettings.adminsOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settingsQuery.data === undefined) {
    if (!settingsQuery.isError) return <CompanyBillingSettingsSkeleton header={header} />;
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        {header}
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">{t('settingsDesk.billing.loadFailedTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('settingsDesk.billing.loadFailedBody')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void settingsQuery.refetch()}
              disabled={settingsQuery.isFetching}
              className="gap-2"
            >
              {settingsQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('settingsDesk.billing.retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mounted once the row (or "none yet") is known: the draft starts from
  // real data, never from defaults that would then be swapped out.
  return <BillingSettingsEditor settings={settingsQuery.data} header={header} />;
}

function BillingSettingsEditor({
  settings,
  header,
}: {
  settings: CompanyBillingSettings | null;
  header: ReactNode;
}) {
  const { t } = useT();
  const upsert = useUpsertCompanyBilling();
  const upload = useUploadCompanyLogo();
  const removeLogo = useDeleteCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();

  const base = useMemo(() => draftFromSettings(settings), [settings]);
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const form = useMemo<FormFields>(
    () => ({ ...base.fields, ...edits.fields }),
    [base.fields, edits.fields],
  );
  const legal = { ...base.legal, ...edits.legal };
  const footer = { ...base.footer, ...edits.footer };
  const bank = { ...base.bank, ...edits.bank };
  const numbers = useMemo(() => parseNumbers(form), [form]);

  // Stable setters: the memoised <Field>s re-render only when their own
  // value changes, not on every keystroke elsewhere in the form.
  const setText = useCallback((name: TextKey | NumberKey, value: string) => {
    setEdits((current) => ({ ...current, fields: { ...current.fields, [name]: value } }));
  }, []);
  const setToggle = useCallback((name: ToggleKey, value: boolean) => {
    setEdits((current) => ({ ...current, fields: { ...current.fields, [name]: value } }));
  }, []);
  const setBank = useCallback((name: keyof BankDetails, value: string) => {
    setEdits((current) => ({ ...current, bank: { ...current.bank, [name]: value } }));
  }, []);
  const setLegal = (code: keyof TranslatedTexts, value: string) =>
    setEdits((current) => ({ ...current, legal: { ...current.legal, [code]: value } }));
  const setFooter = (code: keyof TranslatedTexts, value: string) =>
    setEdits((current) => ({ ...current, footer: { ...current.footer, [code]: value } }));

  const logoUrl = useMemo(
    () => companyBillingService.resolveLogoUrl(settings?.companyLogoPath),
    [settings?.companyLogoPath],
  );

  const numberError = (key: NumberKey): string | undefined => {
    const error = numbers.errors[key];
    return error ? t(NUMBER_ERROR_KEYS[error]) : undefined;
  };

  const currency = form.defaultCurrency.trim() || 'TND';
  const hasEdits = edits !== NO_EDITS;
  const canSave = !upsert.isPending && form.companyName.trim() !== '' && numbers.valid;

  const handleSave = () => {
    if (!canSave) return;
    const n = numbers.values;
    // Every optional text goes out trimmed, '' included: the backend
    // stores '' as "cleared" (undefined would keep the old value).
    const text = (key: TextKey) => form[key].trim();
    const submitted = edits;
    upsert.mutate(
      {
        companyName: text('companyName'),
        companyAddress: text('companyAddress'),
        companyCity: text('companyCity'),
        companyCountry: text('companyCountry'),
        companyPhone: text('companyPhone'),
        companyEmail: text('companyEmail'),
        taxRegistrationNumber: text('taxRegistrationNumber'),
        tradeName: text('tradeName'),
        legalForm: text('legalForm'),
        registreDeCommerce: text('registreDeCommerce'),
        hostingProvider: text('hostingProvider'),
        hostingProviderUrl: text('hostingProviderUrl'),
        websiteDomain: text('websiteDomain'),
        defaultTvaRate: n.defaultTvaRate,
        defaultTreatmentFee: n.defaultTreatmentFee,
        stampDuty: n.stampDuty,
        cbctSupplementEnabled: form.cbctSupplementEnabled,
        // Undefined (= unchanged) only when the supplement is off and its
        // draft is not a number.
        cbctSupplementFee: n.cbctSupplementFee,
        refinementTwoArchesFee: n.refinementTwoArchesFee,
        refinementSingleArchFee: n.refinementSingleArchFee,
        replacementAlignerFee: n.replacementAlignerFee,
        retainersFee: n.retainersFee,
        loyaltyEnabled: form.loyaltyEnabled,
        // welcomeGiftEnabled is NOT sent: the gift card saves it on its own,
        // and a stale draft value must never overwrite that switch.
        defaultCurrency: currency,
        devisPrefix: text('devisPrefix') || 'DEV',
        devisNextNumber: n.devisNextNumber,
        legalTextTranslations: legal,
        footerTextTranslations: footer,
        bankDetails: bank,
      },
      {
        // The cache now holds the saved row: drop the overlay so the form
        // shows it — unless the admin kept typing while it was saving.
        onSuccess: () => setEdits((current) => (current === submitted ? NO_EDITS : current)),
      },
    );
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      {header}

      <WelcomeGiftSettingsCard settings={settings} />

      {/* ─── Logo + company info ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            {t('accountBillingSettings.companyTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Logo */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="grid h-20 w-32 place-items-center overflow-hidden rounded-md border bg-muted">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt={t('accountBillingSettings.companyLogoAlt')}
                  width={128}
                  height={80}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/60" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending}
                className="gap-2"
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {logoUrl
                  ? t('accountBillingSettings.replaceLogo')
                  : t('accountBillingSettings.uploadLogo')}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => removeLogo.mutate()}
                  disabled={removeLogo.isPending}
                  className="gap-2 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('accountBillingSettings.removeLogo')}
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (file) upload.mutate(file);
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="companyName"
              label={t('accountBillingSettings.companyName')}
              required
              value={form.companyName}
              onValueChange={setText}
              placeholder="Oralign SARL"
              autoComplete="organization"
            />
            <Field
              name="taxRegistrationNumber"
              label={t('accountBillingSettings.taxRegistrationNumber')}
              value={form.taxRegistrationNumber}
              onValueChange={setText}
              placeholder="MF 0000000A"
            />
            <Field
              name="companyPhone"
              label={t('accountBillingSettings.phone')}
              type="tel"
              value={form.companyPhone}
              onValueChange={setText}
              placeholder="+216 71 000 000"
            />
            <Field
              name="companyEmail"
              label={t('accountBillingSettings.email')}
              type="email"
              value={form.companyEmail}
              onValueChange={setText}
              placeholder="contact@oralign.com"
            />
            <Field
              name="companyAddress"
              label={t('accountBillingSettings.address')}
              value={form.companyAddress}
              onValueChange={setText}
              placeholder={t('accountBillingSettings.addressPlaceholder')}
              wide
            />
            {/* Country + City — searchable pickers over the world list. The
                dataset (country-state-city, 8 MB of cities) loads only when
                a list is opened; the stored names render without it.
                Persisted as plain strings. */}
            <div className="sm:col-span-2">
              <CountryCityPicker
                value={{ country: form.companyCountry, city: form.companyCity }}
                countryClearable={false}
                onChange={(next) =>
                  setEdits((current) => ({
                    ...current,
                    fields: {
                      ...current.fields,
                      companyCountry: next.country,
                      companyCity: next.city,
                    },
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Legal identity (mentions légales) ──────────────────────────── */}
      {/* These fields feed the public compliance pages (mentions légales,
          conditions de vente, …) that the payment provider requires. They
          are read via the public /company-billing-settings/legal-info
          endpoint, so keeping them here means nothing is hardcoded in the
          frontend — the admin controls the merchant's legal identity. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            {t('accountBillingSettings.legalInfoTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('accountBillingSettings.legalInfoBody')}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="tradeName"
            label={t('accountBillingSettings.tradeName')}
            value={form.tradeName}
            onValueChange={setText}
            placeholder="Oralign"
          />
          <Field
            name="legalForm"
            label={t('accountBillingSettings.legalForm')}
            value={form.legalForm}
            onValueChange={setText}
            placeholder="SUARL / SARL / …"
          />
          <Field
            name="registreDeCommerce"
            label={t('accountBillingSettings.registreDeCommerce')}
            value={form.registreDeCommerce}
            onValueChange={setText}
            placeholder="B0000000000"
          />
          <Field
            name="websiteDomain"
            label={t('accountBillingSettings.websiteDomain')}
            value={form.websiteDomain}
            onValueChange={setText}
            placeholder="oralign.com.tn"
          />
          <Field
            name="hostingProvider"
            label={t('accountBillingSettings.hostingProvider')}
            value={form.hostingProvider}
            onValueChange={setText}
            placeholder="OVH, Vercel, …"
          />
          <Field
            name="hostingProviderUrl"
            label={t('accountBillingSettings.hostingProviderUrl')}
            type="url"
            value={form.hostingProviderUrl}
            onValueChange={setText}
            placeholder="https://www.ovh.com"
          />
        </CardContent>
      </Card>

      {/* ─── Quote defaults ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('accountBillingSettings.quoteDefaultsTitle')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('accountBillingSettings.quoteDefaultsBody')}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            // Tunisian / Maghreb billing convention is "TVA"
            // (Taxe sur la Valeur Ajoutée) — the field maps onto
            // the existing `defaultTvaRate` column so the label is
            // the only thing that flips here. Keeps the form
            // vocabulary aligned with what doctors actually see on
            // their tax filings.
            name="defaultTvaRate"
            label={t('accountBillingSettings.defaultTvaLabel')}
            value={form.defaultTvaRate}
            inputMode="decimal"
            onValueChange={setText}
            placeholder="19"
            error={numberError('defaultTvaRate')}
          />
          {/* Professional / clinical fee. This used to be re-typed on
              every quote (or accidentally left at 0 = revenue leak).
              Now lives here as a policy default. The admin form on the
              quote itself remains editable, so promotions and free
              first-consults still work without touching this. */}
          <Field
            name="defaultTreatmentFee"
            label={t('accountBillingSettings.defaultTreatmentFeeLabel', { currency })}
            value={form.defaultTreatmentFee}
            inputMode="decimal"
            onValueChange={setText}
            placeholder="0"
            error={numberError('defaultTreatmentFee')}
          />
          {/* "Droit de timbre" — Tunisian fiscal stamp added to every
              invoice total (typically 1.000 TND). Decimal(12,3) on the
              backend, so up to 3 decimals. Set to 0 to disable it on
              invoices. */}
          <Field
            name="stampDuty"
            label={t('accountBillingSettings.stampDutyLabel', { currency })}
            value={form.stampDuty}
            inputMode="decimal"
            onValueChange={setText}
            placeholder={t('accountBillingSettings.stampDutyPlaceholder')}
            helper={t('accountBillingSettings.stampDutyHelp')}
            error={numberError('stampDuty')}
          />
          {/* ── CBCT paid supplement ─────────────────────────────────
              When enabled with a fee > 0, requesting CBCT on a NEW
              order adds this amount to the professional fee (the price
              is snapshotted onto the order server-side, so changing it
              here never touches existing orders). */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor={`${idPrefix}-cbct`} className="font-medium">
                  {t('accountBillingSettings.cbctEnabledLabel')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('accountBillingSettings.cbctEnabledHelp')}
                </p>
              </div>
              <Switch
                id={`${idPrefix}-cbct`}
                checked={form.cbctSupplementEnabled}
                onCheckedChange={(checked) => setToggle('cbctSupplementEnabled', checked)}
              />
            </div>
            <Field
              name="cbctSupplementFee"
              label={t('accountBillingSettings.cbctFeeLabel', { currency })}
              value={form.cbctSupplementFee}
              inputMode="decimal"
              disabled={!form.cbctSupplementEnabled}
              onValueChange={setText}
              placeholder="0"
              helper={t('accountBillingSettings.cbctFeeHelp')}
              error={numberError('cbctSupplementFee')}
            />
          </div>
          {/* ── Beyond-the-pack tariffs (grille 2026) ────────────────
              Informational price list shown on the packs page and in
              doctor-facing surfaces. 0 = not configured → hidden. Full
              width: four amounts no longer squeezed into half a row. */}
          <div className="space-y-3 rounded-lg border p-4 sm:col-span-2">
            <div className="space-y-0.5">
              <p className="font-medium">{t('accountBillingSettings.beyondPackTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('accountBillingSettings.beyondPackHelp')}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field
                name="refinementTwoArchesFee"
                label={t('accountBillingSettings.refinementTwoLabel', { currency })}
                value={form.refinementTwoArchesFee}
                inputMode="decimal"
                onValueChange={setText}
                placeholder="0"
                error={numberError('refinementTwoArchesFee')}
              />
              <Field
                name="refinementSingleArchFee"
                label={t('accountBillingSettings.refinementOneLabel', { currency })}
                value={form.refinementSingleArchFee}
                inputMode="decimal"
                onValueChange={setText}
                placeholder="0"
                error={numberError('refinementSingleArchFee')}
              />
              <Field
                name="replacementAlignerFee"
                label={t('accountBillingSettings.replacementLabel', { currency })}
                value={form.replacementAlignerFee}
                inputMode="decimal"
                onValueChange={setText}
                placeholder="0"
                error={numberError('replacementAlignerFee')}
              />
              <Field
                name="retainersFee"
                label={t('accountBillingSettings.retainersLabel', { currency })}
                value={form.retainersFee}
                inputMode="decimal"
                onValueChange={setText}
                placeholder="0"
                error={numberError('retainersFee')}
              />
            </div>
          </div>

          {/* ── Loyalty program master switch ────────────────────────
              Off = attachPack never applies a loyalty discount; closed
              quarters and issued quotes keep their snapshots. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${idPrefix}-loyalty`} className="font-medium">
                {t('accountBillingSettings.loyaltyEnabledLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('accountBillingSettings.loyaltyEnabledHelp')}
              </p>
            </div>
            <Switch
              id={`${idPrefix}-loyalty`}
              checked={form.loyaltyEnabled}
              onCheckedChange={(checked) => setToggle('loyaltyEnabled', checked)}
            />
          </div>

          <Field
            name="defaultCurrency"
            label={t('accountBillingSettings.defaultCurrencyLabel')}
            value={form.defaultCurrency}
            onValueChange={setText}
            uppercase
            placeholder="TND"
          />
          <Field
            name="devisPrefix"
            label={t('accountBillingSettings.devisPrefixLabel')}
            value={form.devisPrefix}
            onValueChange={setText}
            uppercase
            placeholder="DEV"
          />
          <Field
            name="devisNextNumber"
            label={t('accountBillingSettings.nextQuoteNumberLabel')}
            value={form.devisNextNumber}
            inputMode="numeric"
            onValueChange={setText}
            placeholder="1"
            error={numberError('devisNextNumber')}
          />
        </CardContent>
      </Card>

      {/* ─── Translations ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('accountBillingSettings.translationsTitle')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('accountBillingSettings.translationsBody')}
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={DevisLanguage.FR}>
            <TabsList className="w-full justify-start sm:w-auto">
              <TabsTrigger value={DevisLanguage.FR}>FR</TabsTrigger>
              <TabsTrigger value={DevisLanguage.EN}>EN</TabsTrigger>
              <TabsTrigger value={DevisLanguage.AR}>AR</TabsTrigger>
            </TabsList>

            {(
              [
                { code: 'fr' as const, labelKey: 'accountBillingSettings.languageFrench' },
                { code: 'en' as const, labelKey: 'accountBillingSettings.languageEnglish' },
                {
                  code: 'ar' as const,
                  labelKey: 'accountBillingSettings.languageArabic',
                  dir: 'rtl' as const,
                },
              ]
            ).map(({ code, labelKey, dir }) => {
              const label = t(labelKey);
              const legalPlaceholder = t(
                code === 'fr'
                  ? 'accountBillingSettings.legalPlaceholderFr'
                  : code === 'en'
                    ? 'accountBillingSettings.legalPlaceholderEn'
                    : 'accountBillingSettings.legalPlaceholderAr',
              );
              const footerPlaceholder = t(
                code === 'fr'
                  ? 'accountBillingSettings.footerPlaceholderFr'
                  : code === 'en'
                    ? 'accountBillingSettings.footerPlaceholderEn'
                    : 'accountBillingSettings.footerPlaceholderAr',
              );
              const legalId = `${idPrefix}-legal-${code}`;
              const footerId = `${idPrefix}-footer-${code}`;
              return (
                <TabsContent key={code} value={code} className="space-y-3 pt-3">
                  <div className="grid gap-2">
                    <Label htmlFor={legalId}>{t('accountBillingSettings.legalText', { label })}</Label>
                    <Textarea
                      id={legalId}
                      rows={3}
                      dir={dir ?? 'ltr'}
                      value={legal[code]}
                      onChange={(e) => setLegal(code, e.target.value)}
                      placeholder={legalPlaceholder}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={footerId}>{t('accountBillingSettings.footerText', { label })}</Label>
                    <Textarea
                      id={footerId}
                      rows={2}
                      dir={dir ?? 'ltr'}
                      value={footer[code]}
                      onChange={(e) => setFooter(code, e.target.value)}
                      placeholder={footerPlaceholder}
                    />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* ─── Bank details ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            {t('accountBillingSettings.bankDetailsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="bankName"
            label={t('accountBillingSettings.bankName')}
            value={bank.bankName}
            onValueChange={setBank}
            placeholder="BIAT"
          />
          <Field
            name="accountName"
            label={t('accountBillingSettings.accountName')}
            value={bank.accountName}
            onValueChange={setBank}
            placeholder="Oralign SARL"
          />
          <Field
            name="rib"
            label={t('accountBillingSettings.rib')}
            value={bank.rib}
            onValueChange={setBank}
            placeholder="123 4567890 1234567890"
          />
          <Field
            name="iban"
            label={t('accountBillingSettings.iban')}
            value={bank.iban}
            onValueChange={setBank}
            placeholder="TN59 0000 0000 0000 0000 0000"
          />
          <Field
            name="swift"
            label={t('accountBillingSettings.swift')}
            value={bank.swift}
            onValueChange={setBank}
            placeholder="BIATTNTT"
          />
        </CardContent>
      </Card>

      {/* ─── Save ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {!numbers.valid
            ? t('settingsDesk.billing.fixErrors')
            : hasEdits
              ? t('settingsDesk.billing.unsavedChanges')
              : null}
        </p>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="gap-2"
          size="lg"
        >
          {upsert.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {t('accountBillingSettings.saveSettings')}
        </Button>
      </div>
    </div>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────

interface FieldProps<N extends string> {
  name: N;
  label: string;
  value: string;
  onValueChange: (name: N, value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  inputMode?: 'decimal' | 'numeric';
  autoComplete?: string;
  required?: boolean;
  wide?: boolean;
  helper?: string;
  error?: string;
  disabled?: boolean;
  /** Upper-case what is typed (currency, quote prefix). */
  uppercase?: boolean;
}

function FieldImpl<N extends string>({
  name,
  label,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete = 'off',
  required,
  wide,
  helper,
  error,
  disabled,
  uppercase,
}: FieldProps<N>) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? helper;
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <Label htmlFor={id} className="mb-1.5 inline-flex items-center gap-1">
        {label}
        {required && (
          <span aria-hidden className="text-red-500">
            *
          </span>
        )}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) =>
          onValueChange(name, uppercase ? e.target.value.toUpperCase() : e.target.value)
        }
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
      />
      {message && (
        <p
          id={messageId}
          className={cn('mt-1 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** Memoised: with the stable setters above, typing re-renders one field. */
const Field = memo(FieldImpl) as typeof FieldImpl;
