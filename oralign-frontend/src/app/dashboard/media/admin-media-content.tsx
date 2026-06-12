'use client';

import { useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  ImageIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import {
  SliderMediaDeviceTarget,
  SliderMediaSourceType,
  SliderMediaStatus,
  SliderMediaType,
  type CreateSliderMediaInput,
  type SliderMedia,
  type SliderMediaFilters,
  type UpdateSliderMediaInput,
} from '@/lib/types';
import {
  useActivateSliderMedia,
  useCreateSliderMedia,
  useDashboardSocket,
  useDeactivateSliderMedia,
  useDeleteSliderMedia,
  useReorderSliderMedia,
  useRestoreSliderMedia,
  useSliderMediaAdminList,
  useUpdateSliderMedia,
} from '@/lib/hooks';
import { resolveSliderMediaUrl } from '@/lib/api/slider-media.service';
import { toast } from 'sonner';
import { useAuth } from '@/lib/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Admin Media Management — full CRUD over the doctor dashboard
 * carousel. Tabs filter by device target, a search box scopes by
 * title, and per-row actions activate / deactivate / edit / reorder
 * / soft-delete / restore.
 *
 * Real-time updates via `useDashboardSocket()` so another admin's
 * edit shows up here without a refresh.
 */
export function AdminMediaContent() {
  const { t } = useT();
  const { isAdmin, user } = useAuth();
  const router = useRouter();
  useDashboardSocket({ enabled: isAdmin });

  // RBAC guard — redirect non-admins out so the page can't be reached
  // by hand-typed URL. We wait until auth has resolved (`user` is set)
  // before redirecting so we don't flash the page on first render.
  useEffect(() => {
    if (user && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [user, isAdmin, router]);

  const [filters, setFilters] = useState<SliderMediaFilters>({
    page: 1,
    limit: 20,
    includeDeleted: false,
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [tab, setTab] = useState<'all' | 'desktop' | 'mobile' | 'inactive' | 'trash'>(
    'all',
  );

  const effectiveFilters = useMemo<SliderMediaFilters>(() => {
    const next: SliderMediaFilters = {
      page: filters.page,
      limit: filters.limit,
    };
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    if (tab === 'desktop') next.device = SliderMediaDeviceTarget.DESKTOP;
    if (tab === 'mobile') next.device = SliderMediaDeviceTarget.MOBILE;
    if (tab === 'inactive') next.status = SliderMediaStatus.INACTIVE;
    if (tab === 'trash') next.deletedOnly = true;
    return next;
  }, [filters, debouncedSearch, tab]);

  const list = useSliderMediaAdminList(effectiveFilters, isAdmin);
  const reorder = useReorderSliderMedia();
  const activate = useActivateSliderMedia();
  const deactivate = useDeactivateSliderMedia();
  const softDelete = useDeleteSliderMedia();
  const restore = useRestoreSliderMedia();

  const [editing, setEditing] = useState<SliderMedia | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<SliderMedia | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SliderMedia | null>(null);

  // Reorder helpers — operate on the visible list slice; we send the
  // re-sorted id array to the backend which rewrites displayOrder.
  const items = list.data?.data ?? [];

  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((i) => i.id));
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('mediaAdmin.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('mediaAdmin.intro')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCwIcon
              className={cn('size-4', list.isFetching && 'animate-spin')}
            />
            {t('mediaAdmin.refresh')}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            {t('mediaAdmin.addSlide')}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="all">{t('mediaAdmin.tabAll')}</TabsTrigger>
          <TabsTrigger value="desktop">{t('mediaAdmin.tabDesktop')}</TabsTrigger>
          <TabsTrigger value="mobile">{t('mediaAdmin.tabMobile')}</TabsTrigger>
          <TabsTrigger value="inactive">{t('mediaAdmin.tabInactive')}</TabsTrigger>
          <TabsTrigger value="trash">{t('mediaAdmin.tabTrash')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('mediaAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('mediaAdmin.slides')}</CardTitle>
          <CardDescription>
            {t('mediaAdmin.totalDescription', { total: list.data?.total ?? 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="grid h-32 place-items-center rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
              {t('mediaAdmin.loadError')}
            </div>
          ) : items.length === 0 ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              {t('mediaAdmin.emptyHint')}
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((s, i) => (
                <SlideRow
                  key={s.id}
                  slide={s}
                  isFirst={i === 0}
                  isLast={i === items.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onEdit={() => setEditing(s)}
                  onPreview={() => setPreview(s)}
                  onActivate={() =>
                    activate.mutate(s.id, {
                      onError: () => toast.error(t('mediaAdmin.activateError')),
                    })
                  }
                  onDeactivate={() => deactivate.mutate(s.id)}
                  onDelete={() => setConfirmDelete(s)}
                  onRestore={() => restore.mutate(s.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      {creating ? (
        <MediaFormDialog
          mode="create"
          onClose={() => setCreating(false)}
        />
      ) : null}

      {/* Edit dialog */}
      {editing ? (
        <MediaFormDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/* Preview dialog */}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription>
              {t('mediaAdmin.previewDesc')}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="grid gap-4 md:grid-cols-2">
              <PreviewBox
                label={t('mediaAdmin.previewLabelDesktop')}
                emptyLabel={t('mediaAdmin.previewNoDesktop')}
                url={resolveSliderMediaUrl(preview.desktopUrl ?? preview.mobileUrl)}
                type={preview.mediaType}
                aspect="16/6"
              />
              <PreviewBox
                label={t('mediaAdmin.previewLabelMobile')}
                emptyLabel={t('mediaAdmin.previewNoMobile')}
                url={resolveSliderMediaUrl(preview.mobileUrl ?? preview.desktopUrl)}
                type={preview.mediaType}
                aspect="4/5"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mediaAdmin.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('mediaAdmin.deleteBody', { title: confirmDelete?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('mediaAdmin.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  softDelete.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
            >
              {t('mediaAdmin.moveToTrash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Row

function SlideRow({
  slide,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onPreview,
  onActivate,
  onDeactivate,
  onDelete,
  onRestore,
}: {
  slide: SliderMedia;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const { t } = useT();
  const thumbnail =
    resolveSliderMediaUrl(slide.desktopUrl) ??
    resolveSliderMediaUrl(slide.mobileUrl);
  const isVideo = slide.mediaType === SliderMediaType.VIDEO;
  const inTrash = !!slide.deletedAt;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {/* Thumbnail */}
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40">
        {thumbnail ? (
          isVideo ? (
            <video src={thumbnail} className="size-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt={slide.title} className="size-full object-cover" />
          )
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{slide.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">
            {isVideo ? (
              <VideoIcon className="mr-1 size-3" />
            ) : (
              <ImageIcon className="mr-1 size-3" />
            )}
            {slide.mediaType}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {slide.sourceType}
          </Badge>
          {slide.deviceTargets.map((d) => (
            <Badge key={d} variant="secondary" className="capitalize">
              {d}
            </Badge>
          ))}
          <Badge
            variant="outline"
            className={cn(
              slide.status === SliderMediaStatus.ACTIVE
                ? 'border-emerald-300/60 text-emerald-700 dark:text-emerald-300'
                : 'text-muted-foreground',
            )}
          >
            {slide.status}
          </Badge>
          {inTrash ? (
            <Badge variant="destructive" className="text-[10px]">
              {t('mediaAdmin.badgeTrashed')}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Order controls */}
      {!inTrash ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label={t('mediaAdmin.moveUp')}
          >
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label={t('mediaAdmin.moveDown')}
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onPreview} aria-label={t('mediaAdmin.preview')}>
          <EyeIcon className="size-4" />
        </Button>
        {!inTrash ? (
          <>
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t('mediaAdmin.edit')}>
              <PencilIcon className="size-4" />
            </Button>
            {slide.status === SliderMediaStatus.ACTIVE ? (
              <Switch
                checked
                onCheckedChange={() => onDeactivate()}
                aria-label={t('mediaAdmin.deactivate')}
              />
            ) : (
              <Switch
                checked={false}
                onCheckedChange={() => onActivate()}
                aria-label={t('mediaAdmin.activate')}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t('mediaAdmin.delete')}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onRestore}
            className="gap-1.5"
          >
            <RotateCcwIcon className="size-3" />
            {t('mediaAdmin.restore')}
          </Button>
        )}
      </div>
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────
// Preview helper

function PreviewBox({
  label,
  emptyLabel,
  url,
  type,
  aspect,
}: {
  label: string;
  emptyLabel: string;
  url: string | null;
  type: SliderMediaType;
  aspect: '16/6' | '4/5';
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-muted/40',
          aspect === '16/6' ? 'aspect-[16/6]' : 'aspect-[4/5]',
        )}
      >
        {url ? (
          type === SliderMediaType.VIDEO ? (
            <video src={url} controls className="absolute inset-0 size-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="absolute inset-0 size-full object-contain" />
          )
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Create / Edit form

function MediaFormDialog({
  mode,
  existing,
  onClose,
}: {
  mode: 'create' | 'edit';
  existing?: SliderMedia;
  onClose: () => void;
}) {
  const { t } = useT();
  const create = useCreateSliderMedia();
  const update = useUpdateSliderMedia();
  const pending = create.isPending || update.isPending;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [mediaType, setMediaType] = useState<SliderMediaType>(
    existing?.mediaType ?? SliderMediaType.IMAGE,
  );
  const [sourceType, setSourceType] = useState<SliderMediaSourceType>(
    existing?.sourceType ?? SliderMediaSourceType.UPLOAD,
  );
  const [devices, setDevices] = useState<SliderMediaDeviceTarget[]>(
    existing?.deviceTargets ?? [
      SliderMediaDeviceTarget.DESKTOP,
      SliderMediaDeviceTarget.MOBILE,
    ],
  );
  const [externalDesktop, setExternalDesktop] = useState(
    existing?.sourceType === SliderMediaSourceType.EXTERNAL
      ? existing?.desktopUrl ?? ''
      : '',
  );
  const [externalMobile, setExternalMobile] = useState(
    existing?.sourceType === SliderMediaSourceType.EXTERNAL
      ? existing?.mobileUrl ?? ''
      : '',
  );
  const [linkUrl, setLinkUrl] = useState(existing?.linkUrl ?? '');
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SliderMediaStatus>(
    existing?.status ?? SliderMediaStatus.ACTIVE,
  );

  const toggleDevice = (d: SliderMediaDeviceTarget) => {
    setDevices((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const onSubmit = () => {
    if (!title.trim()) {
      toast.error(t('mediaAdmin.toastTitleRequired'));
      return;
    }
    if (devices.length === 0) {
      toast.error(t('mediaAdmin.toastDeviceRequired'));
      return;
    }
    if (mode === 'create') {
      const input: CreateSliderMediaInput = {
        title: title.trim(),
        mediaType,
        sourceType,
        deviceTargets: devices,
        status,
        linkUrl: linkUrl.trim() || undefined,
      };
      if (sourceType === SliderMediaSourceType.UPLOAD) {
        if (!desktopFile && !mobileFile) {
          toast.error(t('mediaAdmin.toastUploadRequired'));
          return;
        }
        if (desktopFile) input.desktopFile = desktopFile;
        if (mobileFile) input.mobileFile = mobileFile;
      } else {
        if (!externalDesktop.trim() && !externalMobile.trim()) {
          toast.error(t('mediaAdmin.toastUrlRequired'));
          return;
        }
        if (externalDesktop.trim()) input.desktopUrl = externalDesktop.trim();
        if (externalMobile.trim()) input.mobileUrl = externalMobile.trim();
      }
      create.mutate(input, {
        onSuccess: () => onClose(),
      });
    } else if (existing) {
      const input: UpdateSliderMediaInput = {
        title: title.trim(),
        mediaType,
        sourceType,
        deviceTargets: devices,
        status,
        linkUrl: linkUrl.trim() || undefined,
      };
      if (sourceType === SliderMediaSourceType.UPLOAD) {
        if (desktopFile) input.desktopFile = desktopFile;
        if (mobileFile) input.mobileFile = mobileFile;
      } else {
        if (externalDesktop.trim()) input.desktopUrl = externalDesktop.trim();
        else input.clearDesktopUrl = !existing.mobileUrl ? false : true;
        if (externalMobile.trim()) input.mobileUrl = externalMobile.trim();
        else input.clearMobileUrl = !existing.desktopUrl ? false : true;
      }
      update.mutate(
        { id: existing.id, input },
        { onSuccess: () => onClose() },
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('mediaAdmin.dialogAdd') : t('mediaAdmin.dialogEdit')}</DialogTitle>
          <DialogDescription>
            {t('mediaAdmin.dialogDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t('mediaAdmin.fieldTitle')}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('mediaAdmin.fieldTitlePh')}
              maxLength={160}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('mediaAdmin.mediaType')}</Label>
              <Select
                value={mediaType}
                onValueChange={(v) => setMediaType(v as SliderMediaType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SliderMediaType.IMAGE}>{t('mediaAdmin.image')}</SelectItem>
                  <SelectItem value={SliderMediaType.VIDEO}>{t('mediaAdmin.video')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('mediaAdmin.source')}</Label>
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SliderMediaSourceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SliderMediaSourceType.UPLOAD}>
                    {t('mediaAdmin.upload')}
                  </SelectItem>
                  <SelectItem value={SliderMediaSourceType.EXTERNAL}>
                    {t('mediaAdmin.externalUrl')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('mediaAdmin.deviceTargets')}</Label>
            <div className="flex flex-wrap gap-3">
              {[SliderMediaDeviceTarget.DESKTOP, SliderMediaDeviceTarget.MOBILE].map(
                (d) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={devices.includes(d)}
                      onCheckedChange={() => toggleDevice(d)}
                    />
                    <span className="capitalize">
                      {d === SliderMediaDeviceTarget.DESKTOP
                        ? t('mediaAdmin.desktopLabel')
                        : t('mediaAdmin.mobileLabel')}
                    </span>
                  </label>
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('mediaAdmin.deviceHint')}
            </p>
          </div>

          {sourceType === SliderMediaSourceType.UPLOAD ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FilePicker
                label={t('mediaAdmin.desktopAsset')}
                accept={mediaType === SliderMediaType.IMAGE ? 'image/*' : 'video/*'}
                onChange={setDesktopFile}
                file={desktopFile}
                existingUrl={existing?.desktopUrl ?? null}
              />
              <FilePicker
                label={t('mediaAdmin.mobileAsset')}
                accept={mediaType === SliderMediaType.IMAGE ? 'image/*' : 'video/*'}
                onChange={setMobileFile}
                file={mobileFile}
                existingUrl={existing?.mobileUrl ?? null}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('mediaAdmin.desktopUrl')}</Label>
                <Input
                  type="url"
                  value={externalDesktop}
                  onChange={(e) => setExternalDesktop(e.target.value)}
                  placeholder="https://cdn.example.com/desktop.mp4"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('mediaAdmin.mobileUrl')}</Label>
                <Input
                  type="url"
                  value={externalMobile}
                  onChange={(e) => setExternalMobile(e.target.value)}
                  placeholder="https://cdn.example.com/mobile.mp4"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="linkUrl">{t('mediaAdmin.linkUrl')}</Label>
            <Input
              id="linkUrl"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://oralign.com/packs/pro"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('mediaAdmin.activeRow')}</p>
              <p className="text-xs text-muted-foreground">
                {t('mediaAdmin.activeRowHint')}
              </p>
            </div>
            <Switch
              checked={status === SliderMediaStatus.ACTIVE}
              onCheckedChange={(checked) =>
                setStatus(checked ? SliderMediaStatus.ACTIVE : SliderMediaStatus.INACTIVE)
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('mediaAdmin.cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
            {mode === 'create' ? t('mediaAdmin.addSlide') : t('mediaAdmin.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilePicker({
  label,
  accept,
  file,
  existingUrl,
  onChange,
}: {
  label: string;
  accept: string;
  file: File | null;
  existingUrl: string | null;
  onChange: (f: File | null) => void;
}) {
  const { t } = useT();
  const url = file ? URL.createObjectURL(file) : resolveSliderMediaUrl(existingUrl);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        <div className="grid aspect-video place-items-center">
          {url ? (
            accept.startsWith('video') ? (
              <video src={url} controls className="size-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className="size-full object-contain" />
            )
          ) : (
            <p className="text-xs text-muted-foreground">{t('mediaAdmin.noFile')}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-background px-2 py-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            />
            <PlusIcon className="size-3.5" />
            {file ? t('mediaAdmin.replace') : t('mediaAdmin.uploadLabel')}
          </label>
          {file ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
