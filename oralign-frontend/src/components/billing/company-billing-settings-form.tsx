'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CountryCityPicker } from '@/components/ui/country-city-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  type TranslatedTexts,
  type UpsertCompanyBillingSettingsDto,
} from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';

interface FormState extends UpsertCompanyBillingSettingsDto {
  companyName: string;
  defaultTvaRate: number;
  defaultTreatmentFee: number;
  stampDuty: number;
  defaultCurrency: string;
  devisPrefix: string;
  devisNextNumber: number;
  legalTextTranslations: TranslatedTexts;
  footerTextTranslations: TranslatedTexts;
  bankDetails: BankDetails;
}

const emptyState: FormState = {
  companyName: '',
  companyAddress: '',
  companyCity: '',
  companyCountry: '',
  companyPhone: '',
  companyEmail: '',
  taxRegistrationNumber: '',
  defaultTvaRate: 19,
  defaultTreatmentFee: 0,
  // "Droit de timbre" — Tunisian fiscal stamp added to every invoice
  // total. Backend column defaults to 1.000 TND.
  stampDuty: 1,
  defaultCurrency: 'TND',
  devisPrefix: 'DEV',
  devisNextNumber: 1,
  legalTextTranslations: { fr: '', en: '', ar: '' },
  footerTextTranslations: { fr: '', en: '', ar: '' },
  bankDetails: { bankName: '', accountName: '', rib: '', iban: '', swift: '' },
};

/**
 * Single-form admin page for the company-billing-settings singleton.
 *
 * Three logical sections:
 *   • Company info (name + address + contact + tax id + logo)
 *   • Quote defaults (TVA, currency, devis prefix + next number)
 *   • Translations (FR/EN/AR for legal + footer text) and bank details
 *
 * The page renders an empty state when no settings exist yet — admin
 * fills in companyName and saves to create the singleton row.
 */
export function CompanyBillingSettingsForm() {
  const { t } = useT();
  const { isAdmin } = useAuth();
  const { data: settings, isLoading } = useCompanyBilling(isAdmin);
  const upsert = useUpsertCompanyBilling();
  const upload = useUploadCompanyLogo();
  const removeLogo = useDeleteCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(emptyState);

  useEffect(() => {
    if (!settings) {
      setForm(emptyState);
      return;
    }
    setForm({
      companyName: settings.companyName ?? '',
      companyAddress: settings.companyAddress ?? '',
      companyCity: settings.companyCity ?? '',
      companyCountry: settings.companyCountry ?? '',
      companyPhone: settings.companyPhone ?? '',
      companyEmail: settings.companyEmail ?? '',
      taxRegistrationNumber: settings.taxRegistrationNumber ?? '',
      defaultTvaRate: settings.defaultTvaRate ?? 19,
      defaultTreatmentFee: settings.defaultTreatmentFee ?? 0,
      stampDuty: settings.stampDuty ?? 1,
      defaultCurrency: settings.defaultCurrency ?? 'TND',
      devisPrefix: settings.devisPrefix ?? 'DEV',
      devisNextNumber: settings.devisNextNumber ?? 1,
      legalTextTranslations: settings.legalTextTranslations ?? { fr: '', en: '', ar: '' },
      footerTextTranslations: settings.footerTextTranslations ?? { fr: '', en: '', ar: '' },
      bankDetails: settings.bankDetails ?? { bankName: '', accountName: '', rib: '', iban: '', swift: '' },
    });
  }, [settings]);

  const logoUrl = useMemo(
    () => companyBillingService.resolveLogoUrl(settings?.companyLogoPath),
    [settings?.companyLogoPath],
  );

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

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const updateLegal = (lang: keyof TranslatedTexts, value: string) =>
    setForm((s) => ({
      ...s,
      legalTextTranslations: { ...s.legalTextTranslations, [lang]: value },
    }));

  const updateFooter = (lang: keyof TranslatedTexts, value: string) =>
    setForm((s) => ({
      ...s,
      footerTextTranslations: { ...s.footerTextTranslations, [lang]: value },
    }));

  const updateBank = (field: keyof BankDetails, value: string) =>
    setForm((s) => ({ ...s, bankDetails: { ...s.bankDetails, [field]: value } }));

  const handleSave = () => {
    upsert.mutate({
      companyName: form.companyName.trim(),
      companyAddress: form.companyAddress?.trim() || undefined,
      companyCity: form.companyCity?.trim() || undefined,
      companyCountry: form.companyCountry?.trim() || undefined,
      companyPhone: form.companyPhone?.trim() || undefined,
      companyEmail: form.companyEmail?.trim() || undefined,
      taxRegistrationNumber: form.taxRegistrationNumber?.trim() || undefined,
      defaultTvaRate: form.defaultTvaRate,
      defaultTreatmentFee: form.defaultTreatmentFee,
      stampDuty: form.stampDuty,
      defaultCurrency: form.defaultCurrency.trim() || 'TND',
      devisPrefix: form.devisPrefix.trim() || 'DEV',
      devisNextNumber: form.devisNextNumber,
      legalTextTranslations: form.legalTextTranslations,
      footerTextTranslations: form.footerTextTranslations,
      bankDetails: form.bankDetails,
    });
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">{t('accountBillingSettings.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('accountBillingSettings.subtitle')}
        </p>
      </header>

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
              label={t('accountBillingSettings.companyName')}
              required
              value={form.companyName}
              onChange={(v) => updateField('companyName', v)}
              placeholder="Oralign SARL"
            />
            <Field
              label={t('accountBillingSettings.taxRegistrationNumber')}
              value={form.taxRegistrationNumber ?? ''}
              onChange={(v) => updateField('taxRegistrationNumber', v)}
              placeholder="MF 0000000A"
            />
            <Field
              label={t('accountBillingSettings.phone')}
              value={form.companyPhone ?? ''}
              onChange={(v) => updateField('companyPhone', v)}
              placeholder="+216 71 000 000"
            />
            <Field
              label={t('accountBillingSettings.email')}
              value={form.companyEmail ?? ''}
              onChange={(v) => updateField('companyEmail', v)}
              placeholder="contact@oralign.com"
            />
            <Field
              label={t('accountBillingSettings.address')}
              value={form.companyAddress ?? ''}
              onChange={(v) => updateField('companyAddress', v)}
              placeholder={t('accountBillingSettings.addressPlaceholder')}
              wide
            />
            {/* Country + City — searchable pickers with the full world list
                (CountryCityPicker reads from `country-state-city`). Selecting
                a country narrows the city dropdown to that country's cities.
                Persisted as plain strings to match the company-billing-
                settings JSONB-friendly storage. */}
            <div className="sm:col-span-2">
              <CountryCityPicker
                value={{
                  country: form.companyCountry ?? '',
                  city: form.companyCity ?? '',
                }}
                onChange={(next) => {
                  updateField('companyCountry', next.country);
                  updateField('companyCity', next.city);
                }}
                defaultCountryCode="TN"
              />
            </div>
          </div>
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
            label={t('accountBillingSettings.defaultTvaLabel')}
            value={String(form.defaultTvaRate)}
            type="number"
            onChange={(v) => updateField('defaultTvaRate', Number(v) || 0)}
            placeholder="19"
          />
          {/* Professional / clinical fee. This used to be re-typed on
              every quote (or accidentally left at 0 = revenue leak).
              Now lives here as a policy default. The admin form on the
              quote itself remains editable, so promotions and free
              first-consults still work without touching this. */}
          <Field
            label={t('accountBillingSettings.defaultTreatmentFeeLabel', {
              currency: form.defaultCurrency || 'TND',
            })}
            value={String(form.defaultTreatmentFee)}
            type="number"
            onChange={(v) => updateField('defaultTreatmentFee', Number(v) || 0)}
            placeholder="0"
          />
          {/* "Droit de timbre" — Tunisian fiscal stamp added to every
              invoice total (typically 1.000 TND). Decimal(12,3) on the
              backend, so the input steps in milli-units. Set to 0 to
              disable it on invoices. Mirrors the defaultTreatmentFee
              numeric field above. */}
          <Field
            label={t('accountBillingSettings.stampDutyLabel', {
              currency: form.defaultCurrency || 'TND',
            })}
            value={String(form.stampDuty)}
            type="number"
            step="0.001"
            min="0"
            onChange={(v) => updateField('stampDuty', Number(v) || 0)}
            placeholder={t('accountBillingSettings.stampDutyPlaceholder')}
            helper={t('accountBillingSettings.stampDutyHelp')}
          />
          <Field
            label={t('accountBillingSettings.defaultCurrencyLabel')}
            value={form.defaultCurrency}
            onChange={(v) => updateField('defaultCurrency', v.toUpperCase())}
            placeholder="TND"
          />
          <Field
            label={t('accountBillingSettings.devisPrefixLabel')}
            value={form.devisPrefix}
            onChange={(v) => updateField('devisPrefix', v.toUpperCase())}
            placeholder="DEV"
          />
          <Field
            label={t('accountBillingSettings.nextQuoteNumberLabel')}
            value={String(form.devisNextNumber)}
            type="number"
            onChange={(v) => updateField('devisNextNumber', Number(v) || 1)}
            placeholder="1"
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
              return (
                <TabsContent key={code} value={code} className="space-y-3 pt-3">
                  <div className="grid gap-2">
                    <Label>{t('accountBillingSettings.legalText', { label })}</Label>
                    <Textarea
                      rows={3}
                      dir={dir ?? 'ltr'}
                      value={form.legalTextTranslations?.[code] ?? ''}
                      onChange={(e) => updateLegal(code, e.target.value)}
                      placeholder={legalPlaceholder}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('accountBillingSettings.footerText', { label })}</Label>
                    <Textarea
                      rows={2}
                      dir={dir ?? 'ltr'}
                      value={form.footerTextTranslations?.[code] ?? ''}
                      onChange={(e) => updateFooter(code, e.target.value)}
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
            label={t('accountBillingSettings.bankName')}
            value={form.bankDetails.bankName ?? ''}
            onChange={(v) => updateBank('bankName', v)}
            placeholder="BIAT"
          />
          <Field
            label={t('accountBillingSettings.accountName')}
            value={form.bankDetails.accountName ?? ''}
            onChange={(v) => updateBank('accountName', v)}
            placeholder="Oralign SARL"
          />
          <Field
            label={t('accountBillingSettings.rib')}
            value={form.bankDetails.rib ?? ''}
            onChange={(v) => updateBank('rib', v)}
            placeholder="123 4567890 1234567890"
          />
          <Field
            label={t('accountBillingSettings.iban')}
            value={form.bankDetails.iban ?? ''}
            onChange={(v) => updateBank('iban', v)}
            placeholder="TN59 0000 0000 0000 0000 0000"
          />
          <Field
            label={t('accountBillingSettings.swift')}
            value={form.bankDetails.swift ?? ''}
            onChange={(v) => updateBank('swift', v)}
            placeholder="BIATTNTT"
          />
        </CardContent>
      </Card>

      {/* ─── Save ────────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending || !form.companyName.trim() || isLoading}
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  wide,
  step,
  min,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
  step?: string;
  min?: string;
  helper?: string;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <Label className="mb-1.5 inline-flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
      />
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
