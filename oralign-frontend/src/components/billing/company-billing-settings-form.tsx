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

interface FormState extends UpsertCompanyBillingSettingsDto {
  companyName: string;
  defaultTvaRate: number;
  defaultTreatmentFee: number;
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
            Only admins can view the company billing settings.
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
        <h1 className="text-xl font-semibold sm:text-2xl">Billing settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company-wide configuration used by every quotation PDF.
        </p>
      </header>

      {/* ─── Logo + company info ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Company
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
                  alt="Company logo"
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
                {logoUrl ? 'Replace logo' : 'Upload logo'}
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
                  Remove
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
              label="Company name"
              required
              value={form.companyName}
              onChange={(v) => updateField('companyName', v)}
              placeholder="Oralign SARL"
            />
            <Field
              label="Tax registration number"
              value={form.taxRegistrationNumber ?? ''}
              onChange={(v) => updateField('taxRegistrationNumber', v)}
              placeholder="MF 0000000A"
            />
            <Field
              label="Phone"
              value={form.companyPhone ?? ''}
              onChange={(v) => updateField('companyPhone', v)}
              placeholder="+216 71 000 000"
            />
            <Field
              label="Email"
              value={form.companyEmail ?? ''}
              onChange={(v) => updateField('companyEmail', v)}
              placeholder="contact@oralign.com"
            />
            <Field
              label="Address"
              value={form.companyAddress ?? ''}
              onChange={(v) => updateField('companyAddress', v)}
              placeholder="Street, suite…"
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
          <CardTitle className="text-base">Quote defaults</CardTitle>
          <p className="text-xs text-muted-foreground">
            These values are auto-applied to every new quotation. The admin
            can still override them per-quote when editing a specific case.
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
            label="Default TVA (%)"
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
            label={`Default treatment fee (${form.defaultCurrency || 'TND'})`}
            value={String(form.defaultTreatmentFee)}
            type="number"
            onChange={(v) => updateField('defaultTreatmentFee', Number(v) || 0)}
            placeholder="0"
          />
          <Field
            label="Default currency"
            value={form.defaultCurrency}
            onChange={(v) => updateField('defaultCurrency', v.toUpperCase())}
            placeholder="TND"
          />
          <Field
            label="Devis prefix"
            value={form.devisPrefix}
            onChange={(v) => updateField('devisPrefix', v.toUpperCase())}
            placeholder="DEV"
          />
          <Field
            label="Next quote number"
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
          <CardTitle className="text-base">Legal & footer text</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each language is rendered on the PDF when the admin generates
            the quote in that language. Empty languages fall back to
            French.
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
                { code: 'fr' as const, label: 'Français' },
                { code: 'en' as const, label: 'English' },
                { code: 'ar' as const, label: 'العربية', dir: 'rtl' as const },
              ]
            ).map(({ code, label, dir }) => (
              <TabsContent key={code} value={code} className="space-y-3 pt-3">
                <div className="grid gap-2">
                  <Label>Legal text — {label}</Label>
                  <Textarea
                    rows={3}
                    dir={dir ?? 'ltr'}
                    value={form.legalTextTranslations?.[code] ?? ''}
                    onChange={(e) => updateLegal(code, e.target.value)}
                    placeholder={
                      code === 'fr'
                        ? "Texte légal qui apparaîtra en bas du devis…"
                        : code === 'en'
                          ? 'Legal text that will appear at the bottom of every quotation…'
                          : 'النص القانوني…'
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Footer text — {label}</Label>
                  <Textarea
                    rows={2}
                    dir={dir ?? 'ltr'}
                    value={form.footerTextTranslations?.[code] ?? ''}
                    onChange={(e) => updateFooter(code, e.target.value)}
                    placeholder={
                      code === 'fr'
                        ? 'Merci pour votre confiance.'
                        : code === 'en'
                          ? 'Thank you for your trust.'
                          : 'شكراً لثقتكم.'
                    }
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* ─── Bank details ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            Bank details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Bank name"
            value={form.bankDetails.bankName ?? ''}
            onChange={(v) => updateBank('bankName', v)}
            placeholder="BIAT"
          />
          <Field
            label="Account name"
            value={form.bankDetails.accountName ?? ''}
            onChange={(v) => updateBank('accountName', v)}
            placeholder="Oralign SARL"
          />
          <Field
            label="RIB"
            value={form.bankDetails.rib ?? ''}
            onChange={(v) => updateBank('rib', v)}
            placeholder="123 4567890 1234567890"
          />
          <Field
            label="IBAN"
            value={form.bankDetails.iban ?? ''}
            onChange={(v) => updateBank('iban', v)}
            placeholder="TN59 0000 0000 0000 0000 0000"
          />
          <Field
            label="SWIFT"
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
          Save settings
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
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
      />
    </div>
  );
}
