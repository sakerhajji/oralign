'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCommunitySubmissionAdmin, useUpdateCommunitySubmissionAdmin } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import {
  CommunitySubmissionFormat,
  CommunitySubmissionRole,
  CommunitySubmissionStatus,
  CommunitySubmissionTreatmentStatus,
  type CommunitySubmission,
  type CreateCommunitySubmissionInput,
} from '@/lib/types';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: CommunitySubmission | null;
};

type FormState = Omit<CreateCommunitySubmissionInput, 'city' | 'childName' | 'childAge' | 'satisfied' | 'message' | 'media'> & {
  city: string;
  childName: string;
  childAge: string;
  satisfied: string;
  message: string;
};

const EMPTY_FORM: FormState = {
  format: CommunitySubmissionFormat.TEXT,
  firstName: '',
  lastNameInitial: '',
  phone: '',
  email: '',
  city: '',
  role: CommunitySubmissionRole.ADULT,
  childName: '',
  childAge: '',
  treatmentStatus: CommunitySubmissionTreatmentStatus.COMPLETED,
  why: '',
  journey: '',
  satisfied: '',
  message: '',
  consent: true,
  contactConsent: false,
};

export function CommunitySubmissionEditor({ open, onOpenChange, existing = null }: Props) {
  const { t } = useT();
  const [form, setForm] = useState<FormState>(() => existing ? formFromSubmission(existing) : EMPTY_FORM);
  const [media, setMedia] = useState<File[]>([]);
  const create = useCreateCommunitySubmissionAdmin();
  const update = useUpdateCommunitySubmissionAdmin();
  const isEditing = Boolean(existing);
  const isPending = create.isPending || update.isPending;

  const mediaAccept = useMemo(() => {
    if (form.format === CommunitySubmissionFormat.PHOTO) return 'image/jpeg,image/png,image/webp';
    if (form.format === CommunitySubmissionFormat.VIDEO) return 'video/mp4,video/webm,image/jpeg,image/png,image/webp';
    return undefined;
  }, [form.format]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.role === CommunitySubmissionRole.PARENT && !form.childName.trim()) {
      toast.error(t('communityAdmin.childName'));
      return;
    }
    if (!isEditing && form.format === CommunitySubmissionFormat.PHOTO && media.length === 0) {
      toast.error(t('communityAdmin.mediaUpload'));
      return;
    }
    if (!isEditing && form.format === CommunitySubmissionFormat.VIDEO && !media.some((file) => file.type.startsWith('video/'))) {
      toast.error(t('communityAdmin.mediaUpload'));
      return;
    }

    const baseInput: CreateCommunitySubmissionInput = {
      ...form,
      childAge: form.childAge ? Number(form.childAge) : undefined,
      media,
    };

    if (existing) {
      const editable: Partial<CreateCommunitySubmissionInput> = {
        format: baseInput.format,
        firstName: baseInput.firstName,
        lastNameInitial: baseInput.lastNameInitial,
        phone: baseInput.phone,
        email: baseInput.email,
        city: baseInput.city,
        role: baseInput.role,
        childName: baseInput.childName,
        childAge: baseInput.childAge,
        treatmentStatus: baseInput.treatmentStatus,
        why: baseInput.why,
        journey: baseInput.journey,
        satisfied: baseInput.satisfied,
        message: baseInput.message,
        contactConsent: baseInput.contactConsent,
      };
      update.mutate({ id: existing.id, input: editable }, { onSuccess: () => onOpenChange(false) });
      return;
    }

    create.mutate(
      { ...baseInput, status: CommunitySubmissionStatus.PENDING },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto p-0 sm:max-w-3xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b px-5 py-4 sm:px-6">
            <DialogTitle>{isEditing ? t('communityAdmin.edit') : t('communityAdmin.add')}</DialogTitle>
            <DialogDescription>{t('communityAdmin.formDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <Field label={t('communityAdmin.firstName')} htmlFor="community-first-name">
              <Input id="community-first-name" value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} required maxLength={80} />
            </Field>
            <Field label={t('communityAdmin.lastNameInitial')} htmlFor="community-last-name-initial">
              <Input id="community-last-name-initial" value={form.lastNameInitial} onChange={(event) => updateField('lastNameInitial', event.target.value)} required maxLength={2} />
            </Field>
            <Field label={t('communityAdmin.phone')} htmlFor="community-phone">
              <Input id="community-phone" type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} required maxLength={32} />
            </Field>
            <Field label={t('communityAdmin.email')} htmlFor="community-email">
              <Input id="community-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} required maxLength={254} />
            </Field>
            <Field label={t('communityAdmin.city')} htmlFor="community-city">
              <Input id="community-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} maxLength={120} />
            </Field>
            <Field label={t('communityAdmin.role')} htmlFor="community-role">
              <Select value={form.role} onValueChange={(value) => updateField('role', value as CommunitySubmissionRole)}>
                <SelectTrigger id="community-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CommunitySubmissionRole.ADULT}>{t('communityAdmin.adult')}</SelectItem>
                  <SelectItem value={CommunitySubmissionRole.PARENT}>{t('communityAdmin.parent')}</SelectItem>
                  <SelectItem value={CommunitySubmissionRole.TEEN}>{t('communityAdmin.teen')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.role === CommunitySubmissionRole.PARENT ? <>
              <Field label={t('communityAdmin.childName')} htmlFor="community-child-name">
                <Input id="community-child-name" value={form.childName} onChange={(event) => updateField('childName', event.target.value)} required maxLength={80} />
              </Field>
              <Field label={t('communityAdmin.childAge')} htmlFor="community-child-age">
                <Input id="community-child-age" type="number" min={1} max={21} value={form.childAge} onChange={(event) => updateField('childAge', event.target.value)} />
              </Field>
            </> : null}
            <Field label={t('communityAdmin.treatmentStatus')} htmlFor="community-treatment-status">
              <Select value={form.treatmentStatus} onValueChange={(value) => updateField('treatmentStatus', value as CommunitySubmissionTreatmentStatus)}>
                <SelectTrigger id="community-treatment-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CommunitySubmissionTreatmentStatus.IN_PROGRESS}>{t('communityAdmin.inProgress')}</SelectItem>
                  <SelectItem value={CommunitySubmissionTreatmentStatus.COMPLETED}>{t('communityAdmin.completed')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('communityAdmin.format')} htmlFor="community-format" hint={isEditing ? t('communityAdmin.editFormatHint') : undefined}>
              <Select value={form.format} onValueChange={(value) => { updateField('format', value as CommunitySubmissionFormat); setMedia([]); }} disabled={isEditing}>
                <SelectTrigger id="community-format" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CommunitySubmissionFormat.TEXT}>{t('communityAdmin.textFormat')}</SelectItem>
                  <SelectItem value={CommunitySubmissionFormat.PHOTO}>{t('communityAdmin.photoFormat')}</SelectItem>
                  <SelectItem value={CommunitySubmissionFormat.VIDEO}>{t('communityAdmin.videoFormat')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <TextField label={t('communityAdmin.whyPrompt')} value={form.why} onChange={(value) => updateField('why', value)} />
            <TextField label={t('communityAdmin.journeyPrompt')} value={form.journey} onChange={(value) => updateField('journey', value)} />
            <TextField label={t('communityAdmin.satisfiedPrompt')} value={form.satisfied} onChange={(value) => updateField('satisfied', value)} optional />
            <TextField label={t('communityAdmin.messagePrompt')} value={form.message} onChange={(value) => updateField('message', value)} optional />

            {!isEditing && form.format !== CommunitySubmissionFormat.TEXT ? <div className="sm:col-span-2">
              <Label htmlFor="community-media" className="text-sm font-medium">{t('communityAdmin.mediaUpload')}</Label>
              <div className="mt-2 rounded-lg border border-dashed bg-muted/20 p-4">
                <Input id="community-media" type="file" accept={mediaAccept} multiple={form.format === CommunitySubmissionFormat.PHOTO} onChange={(event) => setMedia(Array.from(event.target.files ?? []))} className="cursor-pointer bg-background" />
                <p className="mt-2 text-xs text-muted-foreground">{t('communityAdmin.mediaHint')}</p>
                {media.length ? <p className="mt-2 truncate text-xs font-medium text-foreground">{media.map((file) => file.name).join(' · ')}</p> : null}
              </div>
            </div> : null}

            <div className="flex items-start gap-3 sm:col-span-2">
              <Checkbox id="community-contact-consent" checked={form.contactConsent} onCheckedChange={(checked) => updateField('contactConsent', checked === true)} />
              <Label htmlFor="community-contact-consent" className="text-sm font-normal leading-5">{t('communityAdmin.contact')}</Label>
            </div>
          </div>

          <DialogFooter className="px-5 sm:px-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t('communityAdmin.cancel')}</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isEditing ? t('communityAdmin.save') : t('communityAdmin.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formFromSubmission(existing: CommunitySubmission): FormState {
  return {
    format: existing.format,
    firstName: existing.firstName,
    lastNameInitial: existing.lastNameInitial,
    phone: existing.phone ?? '',
    email: existing.email ?? '',
    city: existing.city ?? '',
    role: existing.role,
    childName: existing.childName ?? '',
    childAge: existing.childAge ? String(existing.childAge) : '',
    treatmentStatus: existing.treatmentStatus,
    why: existing.why,
    journey: existing.journey,
    satisfied: existing.satisfied ?? '',
    message: existing.message ?? '',
    consent: true,
    contactConsent: existing.contactConsent ?? false,
  };
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

function TextField({ label, value, onChange, optional = false }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return <div className="space-y-2 sm:col-span-2"><Label>{label}{optional ? <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span> : null}</Label><Textarea value={value} onChange={(event) => onChange(event.target.value)} required={!optional} minLength={optional ? undefined : 10} maxLength={3000} rows={4} /></div>;
}
