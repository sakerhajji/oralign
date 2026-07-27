'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AvailablePacks } from '@/components/dashboard/available-packs';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  usePacks,
  useCreatePack,
  useUpdatePack,
  useDeletePack,
  usePermanentDeletePack,
  useActivatePack,
  useDeactivatePack,
} from '@/lib/hooks';
import { useBillingPublicDefaults } from '@/lib/hooks/use-company-billing';
import { pickLocalized } from '@/lib/api/blog.service';
import {
  ArchType,
  UserRole,
  type CreatePackDto,
  type Pack,
  type PackPrice,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreVertical,
  ShieldX,
  Plus,
  PackageIcon,
  Trash2,
  Power,
  PowerOff,
  Pencil,
} from 'lucide-react';

// ─── Visual helpers ──────────────────────────────────────────────

/**
 * Returns the single active price for a pack. The admin UI no longer
 * surfaces the one_arch / two_arches distinction — every pack has
 * ONE price keyed by archType=two_arches on the backend (the
 * canonical pricing unit). Legacy packs may still have a one_arch
 * price too; we prefer two_arches when present and fall back to the
 * first active row otherwise.
 */
function activePriceFor(pack: Pack): PackPrice | null {
  const active = (pack.prices ?? []).filter((p) => p.isActive);
  if (active.length === 0) return null;
  const twoArches = active.find((p) => p.archType === ArchType.TWO_ARCHES);
  return twoArches ?? active[0]!;
}

/** Active price for a specific arch, or null when not offered. */
function priceForArch(pack: Pack, arch: ArchType): PackPrice | null {
  return (
    (pack.prices ?? []).find((p) => p.isActive && p.archType === arch) ?? null
  );
}

function formatMoney(p: PackPrice): string {
  // Decimal-as-string on the wire — render with a thin space + the
  // currency code so the columns line up cleanly in tabular nums.
  return `${p.price} ${p.currency}`;
}

/**
 * Localized pack name / description with FR fallback. Old packs whose
 * `*I18n` bags are null resolve through the legacy plain string. Never
 * returns empty for the name (falls back to the plain `name`).
 */
function packName(pack: Pack, lang: string): string {
  return pickLocalized(pack.nameI18n ?? pack.name, lang) || pack.name;
}
function packDescription(pack: Pack, lang: string): string {
  return pickLocalized(pack.descriptionI18n ?? pack.description ?? '', lang);
}

// ─────────────────────────────────────────────────────────────────────
// Page

export function PacksPageContent() {
  const { t } = useT();
  const { user, isAdmin } = useAuth();

  if (!user) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (isAdmin) {
    return <AdminPacksManager />;
  }

  if (user.role === UserRole.DENTIST) {
    return <DoctorPacksCatalogue />;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t('packsAdmin.accessDeniedTitle')}</CardTitle>
          <CardDescription>{t('packsAdmin.accessDeniedBody')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function DoctorPacksCatalogue() {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-5 p-3 sm:gap-6 sm:p-4 md:p-6">
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <PackageIcon className="size-3.5 text-primary" />
            {t('packsDoctor.eyebrow')}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t('packsDoctor.title')}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t('packsDoctor.intro')}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/orders/new">
            <Plus className="mr-2 size-4" />
            {t('packsDoctor.newOrder')}
          </Link>
        </Button>
      </header>

      <AvailablePacks />
    </div>
  );
}

function AdminPacksManager() {
  const { t, lang } = useT();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: packsResponse, isLoading } = usePacks({
    includeInactive,
    limit: 100,
  });
  const packs = packsResponse?.data;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pack | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] =
    useState<Pack | null>(null);

  const deletePack = useDeletePack();
  const permanentDeletePack = usePermanentDeletePack();
  const activatePack = useActivatePack();
  const deactivatePack = useDeactivatePack();

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('packsAdmin.title')}
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {t('packsAdmin.intro')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs sm:text-sm">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(!!v)}
            />
            {t('packsAdmin.showInactive')}
          </label>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" />
            {t('packsAdmin.newPack')}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>{t('packsAdmin.activePacks')}</CardTitle>
          <CardDescription>
            {packs?.length === 1
              ? t('packsAdmin.countOne', { count: packs.length })
              : t('packsAdmin.countMany', { count: packs?.length ?? 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !packs || packs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <PackageIcon className="size-8 opacity-50" />
              <p className="text-sm">{t('packsAdmin.emptyTitle')}</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 size-4" />
                {t('packsAdmin.createFirst')}
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop / tablet — table layout. Hidden below sm so
                  the page never tries to fit a 5-column table on a
                  phone (where it would force horizontal scroll). */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('packsAdmin.colName')}</TableHead>
                      <TableHead>{t('packsAdmin.colLimits')}</TableHead>
                      <TableHead>{t('packsAdmin.colPrice')}</TableHead>
                      <TableHead>{t('packsAdmin.colStatus')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packs.map((pack) => {
                      const twoArch = priceForArch(pack, ArchType.TWO_ARCHES);
                      const singleArch = priceForArch(
                        pack,
                        ArchType.ONE_ARCH,
                      );
                      const primaryPrice =
                        twoArch ?? singleArch ?? activePriceFor(pack);
                      const desc = packDescription(pack, lang);
                      return (
                        <TableRow key={pack.id}>
                          <TableCell>
                            <div className="font-medium">
                              {packName(pack, lang)}
                            </div>
                            {desc ? (
                              <div className="line-clamp-2 max-w-md text-xs text-muted-foreground">
                                {desc}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs leading-relaxed">
                            {pack.isUnlimitedSteps
                              ? t('packsAdmin.unlimitedSteps')
                              : t('packsAdmin.maxStepsTpl', {
                                  count: pack.maxStepsPerArch ?? 0,
                                })}
                            <br />
                            {pack.isUnlimitedCorrections
                              ? t('packsAdmin.unlimitedCorrections')
                              : t('packsAdmin.correctionsTpl', {
                                  count: pack.includedCorrections ?? 0,
                                })}
                          </TableCell>
                          <TableCell>
                            {twoArch || singleArch ? (
                              <div className="space-y-0.5 text-sm tabular-nums">
                                {twoArch ? (
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      {t('packsAdmin.priceTwoArchShort')}
                                    </span>{' '}
                                    <span className="font-semibold">
                                      {formatMoney(twoArch)}
                                    </span>
                                  </div>
                                ) : null}
                                {singleArch ? (
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      {t('packsAdmin.priceSingleArchShort')}
                                    </span>{' '}
                                    <span className="font-medium">
                                      {formatMoney(singleArch)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            ) : primaryPrice ? (
                              <span className="text-sm font-semibold tabular-nums">
                                {formatMoney(primaryPrice)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('packsAdmin.noPriceSet')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {pack.isActive ? (
                              <Badge>{t('packsAdmin.active')}</Badge>
                            ) : (
                              <Badge variant="outline">{t('packsAdmin.inactive')}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <RowActions
                              pack={pack}
                              onEdit={() => setEditingPack(pack)}
                              onActivate={() => activatePack.mutate(pack.id)}
                              onDeactivate={() =>
                                deactivatePack.mutate(pack.id)
                              }
                              onDelete={() => setConfirmDelete(pack)}
                              onPermanentDelete={() =>
                                setConfirmPermanentDelete(pack)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile — stacked cards. Each card carries the same
                  five datapoints + actions, laid out vertically so
                  text wraps naturally and never overflows the
                  viewport. */}
              <div className="flex flex-col gap-3 p-3 sm:hidden">
                {packs.map((pack) => {
                  const twoArch = priceForArch(pack, ArchType.TWO_ARCHES);
                  const singleArch = priceForArch(pack, ArchType.ONE_ARCH);
                  const primaryPrice =
                    twoArch ?? singleArch ?? activePriceFor(pack);
                  const desc = packDescription(pack, lang);
                  return (
                    <div
                      key={pack.id}
                      className="rounded-lg border bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {packName(pack, lang)}
                            </span>
                            {pack.isActive ? (
                              <Badge>{t('packsAdmin.active')}</Badge>
                            ) : (
                              <Badge variant="outline">{t('packsAdmin.inactive')}</Badge>
                            )}
                          </div>
                          {desc ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {desc}
                            </p>
                          ) : null}
                        </div>
                        <RowActions
                          pack={pack}
                          onEdit={() => setEditingPack(pack)}
                          onActivate={() => activatePack.mutate(pack.id)}
                          onDeactivate={() => deactivatePack.mutate(pack.id)}
                          onDelete={() => setConfirmDelete(pack)}
                          onPermanentDelete={() =>
                            setConfirmPermanentDelete(pack)
                          }
                        />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border bg-muted/30 p-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t('packsAdmin.cardSteps')}
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {pack.isUnlimitedSteps
                              ? t('packsAdmin.cardUnlimited')
                              : t('packsAdmin.cardMaxTpl', {
                                  count: pack.maxStepsPerArch ?? 0,
                                })}
                          </dd>
                        </div>
                        <div className="rounded border bg-muted/30 p-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t('packsAdmin.cardCorrections')}
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {pack.isUnlimitedCorrections
                              ? t('packsAdmin.cardUnlimited')
                              : pack.includedCorrections ?? 0}
                          </dd>
                        </div>
                        <div className="col-span-2 rounded border bg-muted/30 p-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t('packsAdmin.cardPrice')}
                          </dt>
                          <dd className="mt-0.5 space-y-0.5 text-sm tabular-nums">
                            {twoArch || singleArch ? (
                              <>
                                {twoArch ? (
                                  <div>
                                    <span className="text-muted-foreground">
                                      {t('packsAdmin.priceTwoArchShort')}:{' '}
                                    </span>
                                    <span className="font-semibold">
                                      {formatMoney(twoArch)}
                                    </span>
                                  </div>
                                ) : null}
                                {singleArch ? (
                                  <div>
                                    <span className="text-muted-foreground">
                                      {t('packsAdmin.priceSingleArchShort')}:{' '}
                                    </span>
                                    <span className="font-medium">
                                      {formatMoney(singleArch)}
                                    </span>
                                  </div>
                                ) : null}
                              </>
                            ) : primaryPrice ? (
                              <span className="font-semibold">
                                {formatMoney(primaryPrice)}
                              </span>
                            ) : (
                              t('packsAdmin.cardNoPrice')
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialogs share the same form to keep validation aligned. */}
      <PackFormDialog
        key={`create:${createOpen ? 'open' : 'closed'}`}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pack={null}
      />
      <PackFormDialog
        key={`edit:${editingPack?.id ?? 'closed'}`}
        open={!!editingPack}
        onClose={() => setEditingPack(null)}
        pack={editingPack}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('packsAdmin.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('packsAdmin.deleteBody', {
                name: confirmDelete ? packName(confirmDelete, lang) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('packsAdmin.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  deletePack.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
            >
              {t('packsAdmin.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent (hard) delete — irreversible, admin-only. */}
      <AlertDialog
        open={!!confirmPermanentDelete}
        onOpenChange={(o) => !o && setConfirmPermanentDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('packsAdmin.deletePermanentlyTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('packsAdmin.deletePermanentlyBody', {
                name: confirmPermanentDelete
                  ? packName(confirmPermanentDelete, lang)
                  : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('packsAdmin.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmPermanentDelete) {
                  permanentDeletePack.mutate(confirmPermanentDelete.id);
                  setConfirmPermanentDelete(null);
                }
              }}
            >
              {t('packsAdmin.deletePermanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row-action dropdown — extracted so the mobile cards + the desktop
// table use the same surface. Keeps menu items in lockstep on both
// layouts without duplicating JSX.

function RowActions({
  pack,
  onEdit,
  onActivate,
  onDeactivate,
  onDelete,
  onPermanentDelete,
}: {
  pack: Pack;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onPermanentDelete: () => void;
}) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 size-4" />
          {t('packsAdmin.editPack')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {pack.isActive ? (
          <DropdownMenuItem onClick={onDeactivate}>
            <PowerOff className="mr-2 size-4" />
            {t('packsAdmin.deactivate')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onActivate}>
            <Power className="mr-2 size-4" />
            {t('packsAdmin.activate')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 size-4" />
          {t('packsAdmin.deletePack')}
        </DropdownMenuItem>
        {/* Admin-only irreversible hard delete. This whole page is gated
            to admins, so no extra role check is needed here. */}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onPermanentDelete}
        >
          <ShieldX className="mr-2 size-4" />
          {t('packsAdmin.deletePermanently')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bilingual (FR / EN) field — one labelled row with a French input and
// an English input side-by-side on desktop, stacked on mobile. FR can be
// marked required; EN is always optional (falls back to FR at display).

function BilingualField({
  label,
  required,
  textarea,
  frValue,
  enValue,
  onFr,
  onEn,
  frPlaceholder,
  enPlaceholder,
}: {
  label: string;
  required?: boolean;
  textarea?: boolean;
  frValue: string;
  enValue: string;
  onFr: (v: string) => void;
  onEn: (v: string) => void;
  frPlaceholder?: string;
  enPlaceholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Français
          </span>
          {textarea ? (
            <Textarea
              rows={2}
              value={frValue}
              onChange={(e) => onFr(e.target.value)}
              placeholder={frPlaceholder}
            />
          ) : (
            <Input
              value={frValue}
              onChange={(e) => onFr(e.target.value)}
              placeholder={frPlaceholder}
            />
          )}
        </div>
        <div className="grid gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            English
          </span>
          {textarea ? (
            <Textarea
              rows={2}
              value={enValue}
              onChange={(e) => onEn(e.target.value)}
              placeholder={enPlaceholder}
            />
          ) : (
            <Input
              value={enValue}
              onChange={(e) => onEn(e.target.value)}
              placeholder={enPlaceholder}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Small titled section wrapper used inside the pack modal body. */
function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pack form — wide, responsive, sectioned. Multilingual (FR/EN) content
// + arch-based pricing (two arches / single arch) + currency. The
// backend persists the localized bags and the matching PackPrice rows
// atomically, so the admin saves once.

function PackFormDialog({
  open,
  onClose,
  pack,
}: {
  open: boolean;
  onClose: () => void;
  pack: Pack | null;
}) {
  const { t } = useT();
  const editing = !!pack;
  const create = useCreatePack();
  const update = useUpdatePack();
  const billing = useBillingPublicDefaults();
  const defaultCurrency = billing.data?.defaultCurrency ?? 'TND';
  const initialTwo = pack ? priceForArch(pack, ArchType.TWO_ARCHES) : null;
  const initialSingle = pack ? priceForArch(pack, ArchType.ONE_ARCH) : null;

  // Multilingual text
  const [nameFr, setNameFr] = useState(
    () => pack?.nameI18n?.fr ?? pack?.name ?? '',
  );
  const [nameEn, setNameEn] = useState(() => pack?.nameI18n?.en ?? '');
  const [descFr, setDescFr] = useState(
    () => pack?.descriptionI18n?.fr ?? pack?.description ?? '',
  );
  const [descEn, setDescEn] = useState(
    () => pack?.descriptionI18n?.en ?? '',
  );
  const [expFr, setExpFr] = useState(
    () => pack?.treatmentExpirationLabel?.fr ?? '',
  );
  const [expEn, setExpEn] = useState(
    () => pack?.treatmentExpirationLabel?.en ?? '',
  );
  const [finFr, setFinFr] = useState(
    () => pack?.finishingIncludedLabel?.fr ?? '',
  );
  const [finEn, setFinEn] = useState(
    () => pack?.finishingIncludedLabel?.en ?? '',
  );
  // Treatment
  const [maxSteps, setMaxSteps] = useState(() =>
    pack?.maxStepsPerArch != null ? String(pack.maxStepsPerArch) : '',
  );
  const [isUnlimitedSteps, setIsUnlimitedSteps] = useState(
    () => pack?.isUnlimitedSteps ?? false,
  );
  const [includedCorrections, setIncludedCorrections] = useState(() =>
    pack?.includedCorrections != null ? String(pack.includedCorrections) : '',
  );
  const [isUnlimitedCorrections, setIsUnlimitedCorrections] = useState(
    () => pack?.isUnlimitedCorrections ?? false,
  );
  // Pricing
  const [priceTwo, setPriceTwo] = useState(() =>
    initialTwo ? String(initialTwo.price) : '',
  );
  const [priceSingle, setPriceSingle] = useState(() =>
    initialSingle ? String(initialSingle.price) : '',
  );
  const [currency, setCurrency] = useState(
    () => initialTwo?.currency ?? initialSingle?.currency ?? defaultCurrency,
  );
  // Visibility
  const [isActive, setIsActive] = useState(() => pack?.isActive ?? true);

  // ── Derived validation ──
  const twoNum = priceTwo.trim() === '' ? undefined : Number(priceTwo);
  const singleNum = priceSingle.trim() === '' ? undefined : Number(priceSingle);
  const twoInvalid =
    priceTwo.trim() !== '' && (!Number.isFinite(twoNum) || (twoNum as number) <= 0);
  const singleInvalid =
    priceSingle.trim() !== '' &&
    (!Number.isFinite(singleNum) || (singleNum as number) <= 0);
  const hasAnyPrice =
    (twoNum !== undefined && twoNum > 0) ||
    (singleNum !== undefined && singleNum > 0);
  const nameValid = nameFr.trim() !== '';
  const stepsValid =
    isUnlimitedSteps || (maxSteps.trim() !== '' && Number(maxSteps) >= 1);
  const submitting = create.isPending || update.isPending;
  const canSubmit =
    nameValid &&
    hasAnyPrice &&
    stepsValid &&
    !twoInvalid &&
    !singleInvalid &&
    !submitting;

  const bag = (fr: string, en: string): { fr?: string; en?: string } | undefined => {
    const o: { fr?: string; en?: string } = {};
    if (fr.trim()) o.fr = fr.trim();
    if (en.trim()) o.en = en.trim();
    return Object.keys(o).length ? o : undefined;
  };

  const submit = () => {
    if (!canSubmit) return;
    const dto: CreatePackDto = {
      nameI18n: {
        fr: nameFr.trim(),
        ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
      },
      descriptionI18n: bag(descFr, descEn),
      // On edit, send an empty bag when cleared so the backend can null
      // the column; on create just omit an empty label.
      treatmentExpirationLabel: editing ? bag(expFr, expEn) ?? {} : bag(expFr, expEn),
      finishingIncludedLabel: editing ? bag(finFr, finEn) ?? {} : bag(finFr, finEn),
      maxStepsPerArch: isUnlimitedSteps ? undefined : Number(maxSteps) || undefined,
      includedCorrections: isUnlimitedCorrections
        ? undefined
        : includedCorrections.trim() === ''
          ? undefined
          : Number(includedCorrections),
      isUnlimitedSteps,
      isUnlimitedCorrections,
      isActive,
      // Retired flag — always send false so legacy `true` rows normalize.
      isForOrthodontists: false,
      priceTwoArches: twoNum !== undefined && twoNum > 0 ? twoNum : undefined,
      // On edit, an empty single-arch field clears (archives) the price;
      // on create it just means "single arch not offered".
      priceSingleArch:
        singleNum !== undefined && singleNum > 0
          ? singleNum
          : editing
            ? null
            : undefined,
      currency: currency.trim() || 'TND',
    };
    if (editing && pack) {
      update.mutate({ id: pack.id, dto }, { onSuccess: onClose });
    } else {
      create.mutate(dto, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Wide on desktop (base DialogContent caps at sm:max-w-sm, so the
          sm:/lg: overrides are required), single-column + 95vw on mobile.
          The body scrolls between a sticky header and a sticky footer so
          the modal never exceeds the viewport height. */}
      <DialogContent className="flex max-h-[90vh] max-w-[95vw] flex-col gap-0 p-0 sm:max-w-2xl lg:max-w-4xl">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>
            {editing
              ? t('packsAdmin.dialogEditTitle')
              : t('packsAdmin.dialogNewTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('packsAdmin.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* 1 · General info */}
          <FormSection title={t('packsAdmin.sectionGeneral')}>
            <BilingualField
              label={t('packsAdmin.nameLabel')}
              required
              frValue={nameFr}
              enValue={nameEn}
              onFr={setNameFr}
              onEn={setNameEn}
              frPlaceholder={t('packsAdmin.namePlaceholder')}
              enPlaceholder={t('packsAdmin.namePlaceholderEn')}
            />
            <BilingualField
              label={t('packsAdmin.descriptionLabel')}
              textarea
              frValue={descFr}
              enValue={descEn}
              onFr={setDescFr}
              onEn={setDescEn}
              frPlaceholder={t('packsAdmin.descriptionPlaceholder')}
            />
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={isActive}
                onCheckedChange={(v) => setIsActive(!!v)}
              />
              {t('packsAdmin.activeInCatalogue')}
              <span className="text-xs font-normal text-muted-foreground">
                {isActive ? t('packsAdmin.activeYes') : t('packsAdmin.activeNo')}
              </span>
            </label>
          </FormSection>

          {/* 2 · Treatment */}
          <FormSection title={t('packsAdmin.sectionTreatment')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pack-steps">{t('packsAdmin.alignersLabel')}</Label>
                <Input
                  id="pack-steps"
                  type="number"
                  min={1}
                  disabled={isUnlimitedSteps}
                  value={isUnlimitedSteps ? '' : maxSteps}
                  onChange={(e) => setMaxSteps(e.target.value)}
                  placeholder={t('packsAdmin.alignersPlaceholder')}
                />
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={isUnlimitedSteps}
                    onCheckedChange={(v) => {
                      setIsUnlimitedSteps(!!v);
                      if (v) setMaxSteps('');
                    }}
                  />
                  {t('packsAdmin.unlimitedStepsCb')}
                </label>
                {!stepsValid ? (
                  <p className="text-[11px] text-destructive">
                    {t('packsAdmin.alignersRequired')}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pack-corrections">
                  {t('packsAdmin.includedCorrectionsLabel')}
                </Label>
                <Input
                  id="pack-corrections"
                  type="number"
                  min={0}
                  disabled={isUnlimitedCorrections}
                  value={isUnlimitedCorrections ? '' : includedCorrections}
                  onChange={(e) => setIncludedCorrections(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={isUnlimitedCorrections}
                    onCheckedChange={(v) => {
                      setIsUnlimitedCorrections(!!v);
                      if (v) setIncludedCorrections('');
                    }}
                  />
                  {t('packsAdmin.unlimitedCorrectionsCb')}
                </label>
              </div>
            </div>
            <BilingualField
              label={t('packsAdmin.expirationLabel')}
              frValue={expFr}
              enValue={expEn}
              onFr={setExpFr}
              onEn={setExpEn}
              frPlaceholder={t('packsAdmin.expirationPlaceholder')}
            />
          </FormSection>

          {/* 3 · Pricing */}
          <FormSection title={t('packsAdmin.sectionPricing')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="price-two">
                  {t('packsAdmin.priceTwoArchesLabel')}
                </Label>
                <Input
                  id="price-two"
                  type="number"
                  step="0.001"
                  min={0.001}
                  value={priceTwo}
                  onChange={(e) => setPriceTwo(e.target.value)}
                  placeholder={t('packsAdmin.pricePlaceholder')}
                  aria-invalid={twoInvalid}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price-single">
                  {t('packsAdmin.priceSingleArchLabel')}
                </Label>
                <Input
                  id="price-single"
                  type="number"
                  step="0.001"
                  min={0.001}
                  value={priceSingle}
                  onChange={(e) => setPriceSingle(e.target.value)}
                  placeholder={t('packsAdmin.priceSingleArchPlaceholder')}
                  aria-invalid={singleInvalid}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pack-currency">
                  {t('packsAdmin.currencyLabel')}
                </Label>
                <Input
                  id="pack-currency"
                  value={currency}
                  maxLength={8}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="uppercase"
                />
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t('packsAdmin.singleArchOptionalHint')}
            </p>
            {!hasAnyPrice ? (
              <p className="text-[11px] text-destructive">
                {t('packsAdmin.atLeastOnePrice')}
              </p>
            ) : null}
          </FormSection>

          {/* 4 · Finishing */}
          <FormSection title={t('packsAdmin.sectionFinishing')}>
            <BilingualField
              label={t('packsAdmin.finishingLabel')}
              frValue={finFr}
              enValue={finEn}
              onFr={setFinFr}
              onEn={setFinEn}
              frPlaceholder={t('packsAdmin.finishingPlaceholder')}
            />
          </FormSection>
        </div>

        <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('packsAdmin.cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {editing ? t('packsAdmin.saveChanges') : t('packsAdmin.createPack')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
