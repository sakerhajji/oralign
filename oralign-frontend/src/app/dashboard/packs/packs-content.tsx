'use client';

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import {
  usePacks,
  useCreatePack,
  useUpdatePack,
  useDeletePack,
  useActivatePack,
  useDeactivatePack,
} from '@/lib/hooks';
import { ArchType, type Pack, type PackPrice } from '@/lib/types';
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

function formatMoney(p: PackPrice): string {
  // Decimal-as-string on the wire — render with a thin space + the
  // currency code so the columns line up cleanly in tabular nums.
  return `${p.price} ${p.currency}`;
}

// ─────────────────────────────────────────────────────────────────────
// Page

export function PacksPageContent() {
  const { t } = useT();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: packsResponse, isLoading } = usePacks({
    includeInactive,
    limit: 100,
  });
  const packs = packsResponse?.data;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pack | null>(null);

  const deletePack = useDeletePack();
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
                      const price = activePriceFor(pack);
                      return (
                        <TableRow key={pack.id}>
                          <TableCell>
                            <div className="font-medium">{pack.name}</div>
                            {pack.description ? (
                              <div className="line-clamp-2 max-w-md text-xs text-muted-foreground">
                                {pack.description}
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
                            {price ? (
                              <span className="text-sm font-semibold tabular-nums">
                                {formatMoney(price)}
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
                  const price = activePriceFor(pack);
                  return (
                    <div
                      key={pack.id}
                      className="rounded-lg border bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{pack.name}</span>
                            {pack.isActive ? (
                              <Badge>{t('packsAdmin.active')}</Badge>
                            ) : (
                              <Badge variant="outline">{t('packsAdmin.inactive')}</Badge>
                            )}
                          </div>
                          {pack.description ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {pack.description}
                            </p>
                          ) : null}
                        </div>
                        <RowActions
                          pack={pack}
                          onEdit={() => setEditingPack(pack)}
                          onActivate={() => activatePack.mutate(pack.id)}
                          onDeactivate={() => deactivatePack.mutate(pack.id)}
                          onDelete={() => setConfirmDelete(pack)}
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
                          <dd className="mt-0.5 font-semibold tabular-nums">
                            {price ? formatMoney(price) : t('packsAdmin.cardNoPrice')}
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pack={null}
      />
      <PackFormDialog
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
              {t('packsAdmin.deleteBody', { name: confirmDelete?.name ?? '' })}
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
}: {
  pack: Pack;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Unified pack form — Pack-row fields + inline price + currency in
// one place. The backend creates / updates the PackPrice atomically
// with the Pack so the admin only saves once.

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

  const currentPrice = useMemo(() => (pack ? activePriceFor(pack) : null), [
    pack,
  ]);

  const [name, setName] = useState(pack?.name ?? '');
  const [description, setDescription] = useState(pack?.description ?? '');
  const [maxSteps, setMaxSteps] = useState<string>(
    pack?.maxStepsPerArch != null ? String(pack.maxStepsPerArch) : '',
  );
  const [includedCorrections, setIncludedCorrections] = useState<string>(
    pack?.includedCorrections != null
      ? String(pack.includedCorrections)
      : '',
  );
  const [isUnlimitedSteps, setIsUnlimitedSteps] = useState(
    pack?.isUnlimitedSteps ?? false,
  );
  const [isUnlimitedCorrections, setIsUnlimitedCorrections] = useState(
    pack?.isUnlimitedCorrections ?? false,
  );
  const [isActive, setIsActive] = useState(pack?.isActive ?? true);
  // Inline price + currency — empty string = "no change" on edit;
  // empty on create = "create the pack without a price (you can add
  // it later via Edit)".
  const [priceInput, setPriceInput] = useState<string>(
    currentPrice ? String(currentPrice.price) : '',
  );
  const [currency, setCurrency] = useState<string>(
    currentPrice?.currency ?? 'TND',
  );

  // Keep the form synced with whichever pack the parent selected. We
  // use useEffect (not useMemo — that was a bug — useMemo's body is
  // computed, not for side effects) so the resets actually fire on
  // open + pack change. Stale state was the cause of "I edited PRO,
  // closed the dialog, opened ESSENTIAL, and saw PRO's name".
  useEffect(() => {
    if (!open) return;
    setName(pack?.name ?? '');
    setDescription(pack?.description ?? '');
    setMaxSteps(
      pack?.maxStepsPerArch != null ? String(pack.maxStepsPerArch) : '',
    );
    setIncludedCorrections(
      pack?.includedCorrections != null
        ? String(pack.includedCorrections)
        : '',
    );
    setIsUnlimitedSteps(pack?.isUnlimitedSteps ?? false);
    setIsUnlimitedCorrections(pack?.isUnlimitedCorrections ?? false);
    setIsActive(pack?.isActive ?? true);
    const p = pack ? activePriceFor(pack) : null;
    setPriceInput(p ? String(p.price) : '');
    setCurrency(p?.currency ?? 'TND');
  }, [open, pack]);

  const priceTouched =
    priceInput.trim() !== '' &&
    (!currentPrice || String(currentPrice.price) !== priceInput.trim());
  const currencyTouched =
    !!currentPrice && currency !== currentPrice.currency;

  const submit = () => {
    const numericPrice =
      priceInput.trim() === '' ? undefined : Number(priceInput);
    const priceIsValid =
      numericPrice === undefined ||
      (Number.isFinite(numericPrice) && numericPrice > 0);
    if (!priceIsValid) return;

    const dto = {
      name: name.trim(),
      description: description.trim() || undefined,
      maxStepsPerArch: isUnlimitedSteps
        ? undefined
        : Number(maxSteps) || undefined,
      includedCorrections: isUnlimitedCorrections
        ? undefined
        : Number(includedCorrections) || undefined,
      isUnlimitedSteps,
      isUnlimitedCorrections,
      isActive,
      // Audience flag is no longer surfaced in the UI — every pack is
      // available to every practitioner. Sending `false` keeps the
      // backend column in sync with the new business rule even on
      // edits of legacy rows that were previously flagged true.
      isForOrthodontists: false,
      // Inline price — only send when the admin actually entered a
      // value. On edit we also send when currency changed; the
      // service skips no-op writes so a re-submit doesn't churn the
      // PackPrice row.
      ...(numericPrice !== undefined &&
      (!editing || priceTouched || currencyTouched)
        ? { price: numericPrice, currency: currency || 'TND' }
        : {}),
    };
    if (editing && pack) {
      update.mutate(
        { id: pack.id, dto },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(dto, { onSuccess: onClose });
    }
  };

  const submitting = create.isPending || update.isPending;
  const priceNumeric = Number(priceInput);
  const priceInvalid =
    priceInput.trim() !== '' &&
    (!Number.isFinite(priceNumeric) || priceNumeric <= 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* max-h on the content so very tall forms scroll inside the
          dialog instead of pushing off-screen on small phones. */}
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? t('packsAdmin.dialogEditTitle') : t('packsAdmin.dialogNewTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('packsAdmin.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="pack-name">{t('packsAdmin.nameLabel')}</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('packsAdmin.namePlaceholder')}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pack-description">{t('packsAdmin.descriptionLabel')}</Label>
            <Textarea
              id="pack-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('packsAdmin.descriptionPlaceholder')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pack-steps">{t('packsAdmin.maxStepsLabel')}</Label>
              <Input
                id="pack-steps"
                type="number"
                min={1}
                disabled={isUnlimitedSteps}
                value={maxSteps}
                onChange={(e) => setMaxSteps(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={isUnlimitedSteps}
                  onCheckedChange={(v) => setIsUnlimitedSteps(!!v)}
                />
                {t('packsAdmin.unlimitedStepsCb')}
              </label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pack-corrections">{t('packsAdmin.includedCorrectionsLabel')}</Label>
              <Input
                id="pack-corrections"
                type="number"
                min={0}
                disabled={isUnlimitedCorrections}
                value={includedCorrections}
                onChange={(e) => setIncludedCorrections(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={isUnlimitedCorrections}
                  onCheckedChange={(v) => setIsUnlimitedCorrections(!!v)}
                />
                {t('packsAdmin.unlimitedCorrectionsCb')}
              </label>
            </div>
          </div>

          {/* Inline price block — the admin's "one source of truth"
              for catalogue pricing. Backend creates/updates the
              underlying PackPrice atomically. Currency stays in TND
              for now but the field is editable for future markets. */}
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-sm font-medium">{t('packsAdmin.packPriceLabel')}</Label>
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr]">
              <Input
                type="number"
                step="0.001"
                min={0.001}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={
                  editing
                    ? currentPrice
                      ? String(currentPrice.price)
                      : t('packsAdmin.pricePlaceholder')
                    : t('packsAdmin.pricePlaceholder')
                }
                aria-invalid={priceInvalid}
              />
              <Input
                value={currency}
                maxLength={8}
                onChange={(e) =>
                  setCurrency(e.target.value.toUpperCase())
                }
                className="uppercase"
              />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {editing
                ? currentPrice
                  ? t('packsAdmin.priceHelpEdited')
                  : t('packsAdmin.priceHelpNoneYet')
                : t('packsAdmin.priceHelpCreate')}
            </p>
            {priceInvalid ? (
              <p className="text-[11px] text-destructive">
                {t('packsAdmin.priceInvalid')}
              </p>
            ) : null}
          </div>

          {/* Catalogue visibility — flipping this OFF hides the pack
              from the public practitioner showcase and from the
              quote-creation picker. Existing quotations that
              snapshotted this pack are unaffected. */}
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={isActive}
                onCheckedChange={(v) => setIsActive(!!v)}
              />
              {t('packsAdmin.activeInCatalogue')}
            </label>
            <p className="text-xs text-muted-foreground">
              {isActive
                ? t('packsAdmin.activeYes')
                : t('packsAdmin.activeNo')}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('packsAdmin.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || submitting || priceInvalid}
          >
            {editing ? t('packsAdmin.saveChanges') : t('packsAdmin.createPack')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
