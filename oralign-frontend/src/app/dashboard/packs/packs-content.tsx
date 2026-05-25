'use client';

import { useEffect, useMemo, useState } from 'react';
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
            Pack catalogue
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Commercial bundles attached to quotations. Each pack carries
            one price — edit it inline alongside the rest of the pack
            details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs sm:text-sm">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(!!v)}
            />
            Show inactive
          </label>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" />
            New pack
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Active packs</CardTitle>
          <CardDescription>
            {packs?.length ?? 0} pack{packs?.length === 1 ? '' : 's'}
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
              <p className="text-sm">No packs yet.</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 size-4" />
                Create your first pack
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
                      <TableHead>Name</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
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
                              ? 'Unlimited steps'
                              : `Max ${pack.maxStepsPerArch ?? 0} steps`}
                            <br />
                            {pack.isUnlimitedCorrections
                              ? 'Unlimited corrections'
                              : `${pack.includedCorrections ?? 0} corrections`}
                          </TableCell>
                          <TableCell>
                            {price ? (
                              <span className="text-sm font-semibold tabular-nums">
                                {formatMoney(price)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No price set
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {pack.isActive ? (
                              <Badge>Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
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
                              <Badge>Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
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
                            Steps
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {pack.isUnlimitedSteps
                              ? 'Unlimited'
                              : `Max ${pack.maxStepsPerArch ?? 0}`}
                          </dd>
                        </div>
                        <div className="rounded border bg-muted/30 p-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Corrections
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {pack.isUnlimitedCorrections
                              ? 'Unlimited'
                              : pack.includedCorrections ?? 0}
                          </dd>
                        </div>
                        <div className="col-span-2 rounded border bg-muted/30 p-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Price
                          </dt>
                          <dd className="mt-0.5 font-semibold tabular-nums">
                            {price ? formatMoney(price) : '— no price set'}
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
            <AlertDialogTitle>Delete this pack?</AlertDialogTitle>
            <AlertDialogDescription>
              The pack &quot;{confirmDelete?.name}&quot; will be soft-deleted
              and hidden from the catalogue. Quotations that already
              snapshotted this pack keep working — they don&apos;t reference
              the pack row, only a copy of its fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  deletePack.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
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
          Edit pack
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {pack.isActive ? (
          <DropdownMenuItem onClick={onDeactivate}>
            <PowerOff className="mr-2 size-4" />
            Deactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onActivate}>
            <Power className="mr-2 size-4" />
            Activate
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 size-4" />
          Delete pack
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
          <DialogTitle>{editing ? 'Edit pack' : 'New pack'}</DialogTitle>
          <DialogDescription>
            Pack name is the only user-visible identifier — pick something
            short and consistent (LITE, ESSENTIAL, SMART, PRO, PRO+). Price
            is edited inline below — leave the field empty to keep the
            current price (or create the pack without one).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="pack-name">Name *</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ESSENTIAL"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pack-description">Description</Label>
            <Textarea
              id="pack-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — short note shown alongside the pack name."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pack-steps">Max steps</Label>
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
                Unlimited steps
              </label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pack-corrections">Included corrections</Label>
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
                Unlimited corrections
              </label>
            </div>
          </div>

          {/* Inline price block — the admin's "one source of truth"
              for catalogue pricing. Backend creates/updates the
              underlying PackPrice atomically. Currency stays in TND
              for now but the field is editable for future markets. */}
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-sm font-medium">Pack price</Label>
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
                      : 'e.g. 1950.000'
                    : 'e.g. 1950.000'
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
                  ? 'Saving changes the active price. Existing quotations that already snapshotted the old price are unaffected.'
                  : 'No price set yet. Enter one to expose this pack on new quotations.'
                : 'Optional on create — you can add a price later from the same Edit form.'}
            </p>
            {priceInvalid ? (
              <p className="text-[11px] text-destructive">
                Enter a positive number with up to 3 decimals (e.g. 1950 or
                1950.000).
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
              Active in catalogue
            </label>
            <p className="text-xs text-muted-foreground">
              {isActive
                ? 'Visible to practitioners and selectable on new quotes.'
                : 'Hidden from new quotes and the public showcase. Existing quotes that already use this pack are unaffected.'}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || submitting || priceInvalid}
          >
            {editing ? 'Save changes' : 'Create pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
