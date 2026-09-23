'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AvailablePacks } from '@/components/dashboard/available-packs';
import { useT } from '@/lib/i18n/lang-context';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  usePacks,
  useCreatePack,
  useUpdatePack,
  useDeletePack,
  usePermanentDeletePack,
  useRestorePack,
  useActivatePack,
  useDeactivatePack,
} from '@/lib/hooks';
import { useBillingPublicDefaults } from '@/lib/hooks/use-company-billing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionCard } from '@/components/ui/section-card';
import { cn } from '@/lib/utils';
import { LoyaltyContent } from './loyalty-content';
import { formatPrice } from '@/lib/utils/currency';
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
  MoreHorizontal,
  ArchiveRestore,
  ShieldX,
  Plus,
  PackageIcon,
  Trash2,
  Power,
  PowerOff,
  Pencil,
} from 'lucide-react';

// ─── Visual helpers ──────────────────────────────────────────────

/** Active price for a specific arch, or null when not offered. */
function priceForArch(pack: Pack, arch: ArchType): PackPrice | null {
  return (
    (pack.prices ?? []).find((p) => p.isActive && p.archType === arch) ?? null
  );
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
    return <AdminPacksArea />;
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
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
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

// ─────────────────────────────────────────────────────────────────────
// Admin surface: the 2026 price sheet and the loyalty program.

/**
 * Admin side of /dashboard/packs: the catalogue and the "beyond the
 * pack" tariffs under one tab, the quarterly loyalty program under the
 * other. The dentist catalogue above is a different screen entirely.
 */
function AdminPacksArea() {
  const { t } = useT();
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8">
      <header className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('packsDesk.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t('packsDesk.subtitle')}
        </p>
      </header>

      <Tabs defaultValue="packs" className="gap-4">
        <TabsList>
          <TabsTrigger value="packs">{t('packsAdmin.tabPacks')}</TabsTrigger>
          <TabsTrigger value="loyalty">{t('packsAdmin.tabLoyalty')}</TabsTrigger>
        </TabsList>
        <TabsContent value="packs" className="flex flex-col gap-4">
          <PackCatalogue />
          <BeyondPackCard />
        </TabsContent>
        <TabsContent value="loyalty">
          <LoyaltyContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** "7 aligners / arch · 2 refinements" — a pack's limits on one line. */
function packLimits(pack: Pack, t: ReturnType<typeof useT>['t']): string {
  return [
    pack.isUnlimitedSteps
      ? t('packsAdmin.unlimitedSteps')
      : t('packsAdmin.maxStepsTpl', { count: pack.maxStepsPerArch ?? 0 }),
    pack.isUnlimitedCorrections
      ? t('packsAdmin.unlimitedCorrections')
      : pack.includedCorrections === 1
        ? t('packsDesk.correctionOne')
        : t('packsAdmin.correctionsTpl', { count: pack.includedCorrections ?? 0 }),
  ].join(' · ');
}

function PackCatalogue() {
  const { t, lang } = useT();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading, isError, refetch } = usePacks({
    includeInactive,
    limit: 100,
  });
  const packs = data?.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pack | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<Pack | null>(null);

  const deletePack = useDeletePack();
  const permanentDeletePack = usePermanentDeletePack();
  const restorePack = useRestorePack();
  const activatePack = useActivatePack();
  const deactivatePack = useDeactivatePack();

  const actionsFor = (pack: Pack) => ({
    pack,
    onEdit: () => setEditingPack(pack),
    onActivate: () => activatePack.mutate(pack.id),
    onDeactivate: () => deactivatePack.mutate(pack.id),
    onDelete: () => setConfirmDelete(pack),
    onRestore: () => restorePack.mutate(pack.id),
    onPermanentDelete: () => setConfirmPermanentDelete(pack),
  });

  const price = (pack: Pack, arch: ArchType) => {
    const row = priceForArch(pack, arch);
    return row ? formatPrice(row.price, row.currency) : null;
  };

  return (
    <>
      <SectionCard
        title={t('packsAdmin.title')}
        description={t('packsDesk.catalogueDesc')}
        flush={packs.length > 0}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={includeInactive}
                onCheckedChange={(value) => setIncludeInactive(!!value)}
              />
              {t('packsAdmin.showInactive')}
            </label>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t('packsAdmin.newPack')}
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-2 px-5 pb-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyBlock
            title={t('packsDesk.loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('packsDesk.retry')}
              </Button>
            }
          />
        ) : packs.length === 0 ? (
          <EmptyBlock
            title={t('packsAdmin.emptyTitle')}
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 size-4" />
                {t('packsAdmin.createFirst')}
              </Button>
            }
          />
        ) : (
          <>
            {/* Table ≥ lg. Both arcade prices get their own column so the
                numbers line up; the status column only earns its place
                when inactive packs are on screen. */}
            <div className="hidden overflow-x-auto border-t lg:block [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('packsAdmin.colName')}</TableHead>
                    <TableHead>{t('packsDesk.included')}</TableHead>
                    <TableHead className="text-right">
                      {t('quoteUi.attachPack.twoArches')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('quoteUi.attachPack.singleArch')}
                    </TableHead>
                    {includeInactive ? (
                      <TableHead>{t('packsAdmin.colStatus')}</TableHead>
                    ) : null}
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packs.map((pack) => {
                    const description = packDescription(pack, lang);
                    return (
                      <TableRow key={pack.id} className={cn(pack.deletedAt && 'opacity-60')}>
                        <TableCell>
                          <p className="font-medium">{packName(pack, lang)}</p>
                          {description ? (
                            <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">
                              {description}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {packLimits(pack, t)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {price(pack, ArchType.TWO_ARCHES) ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                          {price(pack, ArchType.ONE_ARCH) ?? '—'}
                        </TableCell>
                        {includeInactive ? (
                          <TableCell>
                            <PackStateBadge pack={pack} />
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right">
                          <RowActions {...actionsFor(pack)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Stacked cards < lg — same data, same actions. */}
            <ul className="flex flex-col gap-2 px-3 pb-3 lg:hidden">
              {packs.map((pack) => {
                const description = packDescription(pack, lang);
                const twoArches = price(pack, ArchType.TWO_ARCHES);
                const singleArch = price(pack, ArchType.ONE_ARCH);
                return (
                  <li
                    key={pack.id}
                    className={cn(
                      'rounded-lg border p-3',
                      pack.deletedAt && 'opacity-60',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{packName(pack, lang)}</span>
                          <PackStateBadge pack={pack} />
                        </div>
                        {description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {packLimits(pack, t)}
                        </p>
                      </div>
                      <RowActions {...actionsFor(pack)} />
                    </div>
                    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-sm">
                      <div className="flex items-baseline gap-2">
                        <dt className="text-xs text-muted-foreground">
                          {t('quoteUi.attachPack.twoArches')}
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {twoArches ?? t('packsAdmin.noPriceSet')}
                        </dd>
                      </div>
                      {singleArch ? (
                        <div className="flex items-baseline gap-2">
                          <dt className="text-xs text-muted-foreground">
                            {t('quoteUi.attachPack.singleArch')}
                          </dt>
                          <dd className="tabular-nums">{singleArch}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SectionCard>

      {/* Create / edit share the same form so validation stays aligned. */}
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
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
              variant="destructive"
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

      {/* Permanent (hard) delete — irreversible, admin-only, trash-first. */}
      <PermanentDeleteDialog
        open={!!confirmPermanentDelete}
        onOpenChange={(o) => !o && setConfirmPermanentDelete(null)}
        title={t('packsAdmin.deletePermanentlyTitle')}
        description={t('packsAdmin.deletePermanentlyBody', {
          name: confirmPermanentDelete ? packName(confirmPermanentDelete, lang) : '',
        })}
        confirmLabel={t('packsAdmin.deletePermanently')}
        pending={permanentDeletePack.isPending}
        onConfirm={() => {
          if (confirmPermanentDelete) {
            permanentDeletePack.mutate(confirmPermanentDelete.id);
            setConfirmPermanentDelete(null);
          }
        }}
      />
    </>
  );
}

/** Only the states that need attention carry a badge. */
function PackStateBadge({ pack }: { pack: Pack }) {
  const { t } = useT();
  if (pack.deletedAt) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t('packsDesk.archived')}
      </Badge>
    );
  }
  if (pack.isActive) return null;
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      {t('packsAdmin.inactive')}
    </Badge>
  );
}

function EmptyBlock({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 border-t px-6 py-10 text-center">
      <PackageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}

/**
 * Read-only "beyond the pack" price list (grille 2026). The values live
 * on CompanyBillingSettings — edited from the billing settings page,
 * surfaced here so the whole tariff sheet reads in one place.
 */
function BeyondPackCard() {
  const { t } = useT();
  const { data: defaults, isPending, isError, refetch } = useBillingPublicDefaults();

  const money = (amount: number | undefined): string =>
    amount && amount > 0
      ? formatPrice(amount, defaults?.defaultCurrency ?? 'TND')
      : t('packsAdmin.beyondPackNotSet');

  const rows: { label: string; value: string; hint?: string }[] = [
    {
      label: t('packsAdmin.beyondPackStudy'),
      value: money(defaults?.defaultTreatmentFee),
      hint: t('packsAdmin.beyondPackStudyHint'),
    },
    {
      label: t('packsAdmin.beyondPackDicom'),
      value: defaults?.cbctSupplementEnabled
        ? defaults.cbctSupplementFee > 0
          ? `+ ${money(defaults.cbctSupplementFee)}`
          : t('packsAdmin.beyondPackNotSet')
        : t('packsAdmin.beyondPackDicomOff'),
    },
    {
      label: t('packsAdmin.beyondPackRefinementTwo'),
      value: money(defaults?.refinementTwoArchesFee),
    },
    {
      label: t('packsAdmin.beyondPackRefinementOne'),
      value: money(defaults?.refinementSingleArchFee),
    },
    { label: t('packsAdmin.beyondPackReplacement'), value: money(defaults?.replacementAlignerFee) },
    { label: t('packsAdmin.beyondPackRetainers'), value: money(defaults?.retainersFee) },
  ];

  return (
    <SectionCard
      title={t('packsAdmin.beyondPackTitle')}
      description={t('packsAdmin.beyondPackIntro')}
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/account/billing-settings">{t('packsAdmin.beyondPackEdit')}</Link>
        </Button>
      }
    >
      {isPending ? (
        <div className="grid gap-x-8 sm:grid-cols-2">
          {rows.map((row) => (
            <Skeleton key={row.label} className="my-2 h-10 rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-muted-foreground">{t('packsAdmin.beyondPackLoadError')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t('packsAdmin.beyondPackRetry')}
          </Button>
        </div>
      ) : (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <div className="min-w-0">
                <dt className="text-sm">{row.label}</dt>
                {row.hint ? (
                  <dd className="text-xs text-muted-foreground">{row.hint}</dd>
                ) : null}
              </div>
              <dd className="shrink-0 text-sm font-medium tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row-action menu — shared by the table and the stacked cards so the
// two layouts can never drift apart.

function RowActions({
  pack,
  onEdit,
  onActivate,
  onDeactivate,
  onDelete,
  onRestore,
  onPermanentDelete,
}: {
  pack: Pack;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const { t } = useT();
  const inTrash = !!pack.deletedAt;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('packsAdmin.colActions')}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {inTrash ? (
          // Trash-first: an archived pack can only be restored or purged.
          <>
            <DropdownMenuItem onClick={onRestore}>
              <ArchiveRestore className="size-4" />
              {t('common.restore')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onPermanentDelete}>
              <ShieldX className="size-4" />
              {t('packsAdmin.deletePermanently')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4" />
              {t('packsAdmin.editPack')}
            </DropdownMenuItem>
            {pack.isActive ? (
              <DropdownMenuItem onClick={onDeactivate}>
                <PowerOff className="size-4" />
                {t('packsAdmin.deactivate')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onActivate}>
                <Power className="size-4" />
                {t('packsAdmin.activate')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              {t('packsAdmin.deletePack')}
            </DropdownMenuItem>
          </>
        )}
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
