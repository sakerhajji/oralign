'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { DentistProfile } from '@/lib/types';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  ExternalLink,
  X,
  Clock,
} from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ClinicViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: DentistProfile;
  dentistName?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClinicViewDialog({
  open,
  onOpenChange,
  profile,
  dentistName,
}: ClinicViewDialogProps) {
  const { t } = useT();
  const hasLocation =
    profile.latitude != null &&
    profile.longitude != null &&
    !(profile.latitude === 0 && profile.longitude === 0);

  const mapsUrl = hasLocation
    ? `https://www.google.com/maps?q=${profile.latitude!.toFixed(6)},${profile.longitude!.toFixed(6)}`
    : null;

  const addressParts = [profile.clinicAddress, profile.city, profile.country].filter(Boolean);
  const addressLine  = addressParts.join(', ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 overflow-hidden w-[95vw] max-w-[680px] max-h-[90vh]"
      >
        <DialogTitle className="sr-only">
          {t('usersUi.clinicView.srTitle')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('usersUi.clinicView.srDesc', { name: profile.clinicName })}
        </DialogDescription>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-start gap-4 px-6 py-5 border-b bg-gradient-to-br from-primary/5 via-background to-background">
          {/* Icon */}
          <div className="h-14 w-14 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>

          {/* Name + address */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold leading-tight truncate">{profile.clinicName}</h2>
            {dentistName && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Dr. {dentistName}
              </p>
            )}
            {addressLine && (
              <div className="flex items-start gap-1.5 mt-2">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span className="text-sm text-muted-foreground">{addressLine}</span>
              </div>
            )}
          </div>

          {/* Close */}
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0">
              <X className="h-4 w-4" />
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </DialogClose>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">

            {/* ── Contact info ──────────────────────────────────────────── */}
            {(profile.clinicPhone || profile.clinicEmail) && (
              <section>
                <SectionLabel icon={<Phone className="h-3.5 w-3.5" />}>
                  {t('usersUi.clinicView.contact')}
                </SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  {profile.clinicPhone && (
                    <InfoTile
                      icon={<Phone className="h-4 w-4 text-muted-foreground" />}
                      label={t('usersUi.phone')}
                      value={profile.clinicPhone}
                      href={`tel:${profile.clinicPhone}`}
                      actionLabel={t('usersUi.clinicView.call')}
                    />
                  )}
                  {profile.clinicEmail && (
                    <InfoTile
                      icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                      label={t('usersUi.email')}
                      value={profile.clinicEmail}
                      href={`mailto:${profile.clinicEmail}`}
                      actionLabel={t('usersUi.clinicView.sendEmail')}
                    />
                  )}
                </div>
              </section>
            )}

            {/* ── Location details ──────────────────────────────────────── */}
            {(profile.city || profile.country || hasLocation) && (
              <>
                <Separator />
                <section>
                  <SectionLabel icon={<Globe className="h-3.5 w-3.5" />}>
                    {t('usersUi.clinicView.location')}
                  </SectionLabel>
                  <div className="mt-3 space-y-2">
                    {profile.city && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-16 shrink-0">
                          {t('usersUi.clinicView.city')}
                        </span>
                        <span className="font-medium">{profile.city}</span>
                        {profile.country && (
                          <Badge variant="outline" className="text-xs h-5">
                            {profile.country}
                          </Badge>
                        )}
                      </div>
                    )}
                    {hasLocation && mapsUrl && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-16 shrink-0">
                          {t('usersUi.clinicView.gps')}
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {profile.latitude!.toFixed(5)}, {profile.longitude!.toFixed(5)}
                        </span>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('usersUi.clinicView.openInMaps')}
                        </a>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* ── Description ───────────────────────────────────────────── */}
            {profile.description && (
              <>
                <Separator />
                <section>
                  <SectionLabel icon={<FileText className="h-3.5 w-3.5" />}>
                    {t('usersUi.clinicView.about')}
                  </SectionLabel>
                  <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {profile.description}
                  </p>
                </section>
              </>
            )}

            {/* Empty state */}
            {!profile.clinicPhone && !profile.clinicEmail && !profile.city &&
              !profile.country && !hasLocation && !profile.description && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Building2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">{t('usersUi.clinicView.noDetails')}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t bg-muted/30 px-6 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {t('usersUi.clinicView.readOnly')}
          </span>
          <DialogClose asChild>
            <Button variant="outline" size="sm">{t('common.close')}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  href,
  actionLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  /** Translated link text (e.g. "Call" / "Send email"); falls back to the href. */
  actionLabel?: string;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-background px-4 py-3 space-y-1',
      href && 'hover:border-primary/40 transition-colors',
    )}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {actionLabel ?? href}
        </a>
      )}
    </div>
  );
}
